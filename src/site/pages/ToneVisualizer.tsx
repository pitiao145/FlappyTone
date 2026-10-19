import { useEffect, useRef, useState } from "react";
import { captureGameEvent } from "../../analytics/posthog.ts";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { appHref } from "../../ui/appLink.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { Pip, PipCta } from "../Pip.tsx";
import {
  DEFAULT_REF,
  modeFor,
  polylineOf,
  refFor,
  TONE_REFS,
  type RefMode,
  type ToneRef,
} from "../checker/toneRefs.ts";
import {
  attemptView,
  makeCheckerReporter,
  type AttemptView,
  type CheckerReporter,
} from "../checker/checkerCopy.ts";
// Types only: erased at build, so neither chunk lands in this one.
import type { CalStep, Checker } from "../checker/engine.ts";

const PATH = "/tools/tone-visualizer";

type EngineModule = typeof import("../checker/engine.ts");
type BoardModule = typeof import("../checker/board.ts");

/**
 * The engine chunk — the only site code that touches the microphone. Loaded on
 * the first press of Start (pointerdown, so it is usually ready by the click),
 * never with the page.
 */
let enginePromise: Promise<EngineModule> | null = null;
let engineLoaded: EngineModule | null = null;
function loadEngine(): Promise<EngineModule> {
  enginePromise ??= import("../checker/engine.ts").then((m) => {
    engineLoaded = m;
    return m;
  });
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

/** The board renderer (no mic): loaded after mount to draw the idle board. */
let boardPromise: Promise<BoardModule> | null = null;
function loadBoard(): Promise<BoardModule> {
  boardPromise ??= import("../checker/board.ts");
  return boardPromise;
}

type Phase =
  | "idle"
  | "loading"
  | "tap-again"
  | "opening"
  | "error"
  | "cal"
  | "ready"
  | "paused";

const SINGLE = TONE_REFS.filter((r) => r.tones.length === 1);
const PAIRS = TONE_REFS.filter((r) => r.tones.length > 1);

/**
 * The prerendered stand-in until the real renderer draws: the same line, on
 * the board's own axes (time from the bird's rest point, chao 1–5 over the
 * playable band). Replaced by the canvas as soon as `board.ts` loads.
 */
function shapePath(ref: ToneRef, mode: RefMode): string {
  const x = (t: number) => 18 + t * 80 * (ref.durationS / 1.6);
  const y = (c: number) => 80 - ((c - 1) / 4) * 60;
  return polylineOf(ref, mode)
    .map(([t, c], i) => `${i ? "L" : "M"}${x(t).toFixed(2)} ${y(c).toFixed(2)}`)
    .join(" ");
}

const FAQ = [
  {
    q: "What is the difference between Real speech and Textbook?",
    a: "Textbook is the classic tone chart: Tone 1 high and level (55), Tone 2 rising (35), Tone 3 dipping and rising (214), Tone 4 falling (51). Real speech is the average shape of many words recorded by our native Taiwan Mandarin speaker at everyday speed. They often differ: real Tone 3 rarely rises as high as the chart says, and two third tones in a row are not said as written. Pick the one you want to practise; you are scored against that line.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It runs in the browser on iPhone (Safari) and Android (Chrome). Tap Start and allow the microphone. Hold the phone about a hand's length from your mouth, in a quiet room.",
  },
  {
    q: "Why do I have to calibrate first?",
    a: "Everyone's voice sits at a different height. You say one high, level mā and one low mǎ, and the visualizer sizes the board to your voice. That takes about ten seconds, and it is saved on this device. If you have played FlappyTone on this device, it uses that calibration instead.",
  },
  {
    q: "Why does it say “couldn't hear that”?",
    a: "The sound was too short or too quiet to measure a tone, so it gives no score instead of a wrong one. Say it a little longer and a little louder, closer to the microphone. A creaky, very low third tone can also drop out; that is normal, just try again.",
  },
  {
    q: "Is my voice recorded or uploaded?",
    a: "No. The pitch is measured in your browser while you speak, and the sound is not saved or sent anywhere.",
  },
];

function useReporter(): CheckerReporter {
  const ref = useRef<CheckerReporter | null>(null);
  ref.current ??= makeCheckerReporter(captureGameEvent);
  return ref.current;
}

/** The tool: pick a tone and a version, say it, see your line over it. */
function Visualizer() {
  const [ref, setRef] = useState<ToneRef>(() => refFor(DEFAULT_REF));
  const [mode, setMode] = useState<RefMode>("real");
  const [phase, setPhase] = useState<Phase>("idle");
  const [calStep, setCalStep] = useState<CalStep>("high");
  const [calRetry, setCalRetry] = useState(false);
  const [calProgress, setCalProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptView | null>(null);
  const [boardDrawn, setBoardDrawn] = useState(false);
  const reporter = useReporter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const checkerRef = useRef<Checker | null>(null);
  const targetRef = useRef({ ref, mode });

  const running = phase === "cal" || phase === "ready" || phase === "paused";

  const choose = (nextRef: ToneRef, nextMode: RefMode) => {
    targetRef.current = { ref: nextRef, mode: nextMode };
    setRef(nextRef);
    setMode(nextMode);
    setResult(null);
    checkerRef.current?.setTarget(nextRef, nextMode);
  };

  // `?tone=3-3&mode=textbook`. Read after mount so the prerendered markup
  // (Tone 3, real speech) and the first client render agree.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("tone") && !q.has("mode")) return;
    const next = { ref: refFor(q.get("tone")), mode: modeFor(q.get("mode")) };
    targetRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is read once, after hydration
    setRef(next.ref);
    setMode(next.mode);
  }, []);

  // The idle board, drawn by the app's own renderer (grid, corridor, bird).
  // Once the mic runs, the engine draws every frame instead.
  useEffect(() => {
    if (running) return;
    let alive = true;
    void loadBoard().then((b) => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!alive || !canvas || !stage) return;
      const r = stage.getBoundingClientRect();
      b.drawIdle(canvas, Math.round(r.width), Math.round(r.height), ref, mode);
      setBoardDrawn(true);
    });
    return () => {
      alive = false;
    };
  }, [ref, mode, running]);

  // Leaving the page stops the mic, and sends the visit's counts once.
  useEffect(() => {
    const onHide = () => {
      reporter.summary();
      checkerRef.current?.destroy();
      checkerRef.current = null;
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      checkerRef.current?.destroy();
      checkerRef.current = null;
    };
  }, [reporter]);

  // Keep the canvas sized to its stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (checkerRef.current) checkerRef.current.resize(w, h);
      else if (canvasRef.current) {
        const t = targetRef.current;
        void loadBoard().then((b) => b.drawIdle(canvasRef.current!, w, h, t.ref, t.mode));
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  /** Must run inside the tap (hard rule 4): `openMic` is the first call. */
  const open = (mod: EngineModule) => {
    setPhase("opening");
    setError(null);
    mod
      .openMic()
      .then(() => {
        const canvas = canvasRef.current;
        const stage = stageRef.current;
        if (!canvas || !stage) return;
        const r = stage.getBoundingClientRect();
        checkerRef.current = mod.startChecker(
          canvas,
          { width: Math.round(r.width), height: Math.round(r.height) },
          targetRef.current,
          {
            onCalStep(step, retry) {
              setPhase("cal");
              setCalStep(step);
              setCalRetry(retry);
            },
            onCalProgress: setCalProgress,
            onReady() {
              setPhase("ready");
              reporter.action("calibrated");
            },
            onAttempt(r) {
              const t = targetRef.current.ref;
              reporter.attempt(t.id);
              setResult(attemptView(r, t.tones[0], t.tones.length));
            },
            onPaused() {
              setPhase("paused");
            },
          },
        );
      })
      .catch((err: unknown) => {
        const kind = mod.micErrorKind(err);
        if (kind === "permission-denied" || kind === "no-microphone") {
          reporter.action("mic_denied");
        }
        setError(mod.micErrorMessage(err));
        setPhase("error");
        mod.shutdownMic();
      });
  };

  const start = () => {
    reporter.action("started");
    if (engineLoaded) {
      open(engineLoaded);
      return;
    }
    // The chunk was not ready inside this tap. Opening the mic after an
    // await would lose the gesture on iOS, so ask for one more tap.
    setPhase("loading");
    loadEngine().then(
      () => setPhase("tap-again"),
      () => {
        setError("Couldn't load the visualizer. Check your connection and try again.");
        setPhase("error");
      },
    );
  };

  const startLabel =
    phase === "tap-again" ? "Allow the microphone" : phase === "error" ? "Try again" : "Start";
  const color = TONE_LINE_COLOR[ref.tones[0]];

  return (
    <div className="tc-tool" role="group" aria-label="Mandarin tone visualizer">
      <Pip size={72} tilt={-10} className="tm-tool-pip" />
      <div className="tc-picker">
        <div className="tc-picker-label">Pick a tone</div>
        <div className="tc-row">
          {SINGLE.map((r) => (
            <RefChip key={r.id} r={r} selected={r.id === ref.id} pick={() => choose(r, mode)} />
          ))}
        </div>
        <div className="tc-picker-label">Tone pairs (tone sandhi)</div>
        <div className="tc-row">
          {PAIRS.map((r) => (
            <RefChip key={r.id} r={r} selected={r.id === ref.id} pick={() => choose(r, mode)} />
          ))}
        </div>

        <div className="tc-picker-label">Practise against</div>
        <div className="tc-toggle" role="radiogroup" aria-label="Reference line">
          {(["real", "textbook"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? "tc-toggle-on" : undefined}
              onClick={() => choose(ref, m)}
            >
              {m === "real" ? "Real speech" : "Textbook"}
            </button>
          ))}
        </div>

        <div className="tc-ref-card" style={{ borderColor: color }}>
          <div className="tc-ref-title">
            <span style={{ color }}>{ref.label}</span>{" "}
            <span className="tc-ref-example" lang="zh-Hant-TW">
              e.g. {ref.example}
            </span>
          </div>
          <p>
            {mode === "real"
              ? "The line is our native speaker's average at everyday speed. "
              : "The line is the textbook tone chart, stretched to the same length. "}
            {ref.diff}
          </p>
        </div>

        <a className="tc-app-link" href={appHref("visualiser", PATH)}>
          Hear real words and practise them in the full visualizer{" "}
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="tc-main">
        <div className="tc-stage" ref={stageRef}>
          <canvas ref={canvasRef} className="tc-canvas" aria-hidden="true" />
          {phase === "cal" && (
            <div className="tc-stage-say" aria-hidden="true">
              <span>Step {calStep === "high" ? 1 : 2}/2</span>
              Say{" "}
              <b style={{ color: TONE_LINE_COLOR[calStep === "high" ? 1 : 3] }}>
                {calStep === "high" ? "mā" : "mǎ"}
              </b>
            </div>
          )}
          {!boardDrawn && (
            <svg
              className="tc-idle"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={shapePath(ref, mode)} style={{ stroke: color }} />
            </svg>
          )}
        </div>

        <div className="tc-status" aria-live="polite">
          {phase === "idle" && (
            <p>
              Tap Start, then say any syllable in {ref.label.toLowerCase()} (or{" "}
              <span lang="zh-Hant-TW">{ref.example}</span>) and see your pitch drawn
              over the line.
            </p>
          )}
          {phase === "loading" && <p>Loading the visualizer…</p>}
          {phase === "tap-again" && <p>Ready. Tap once more to allow the microphone.</p>}
          {phase === "opening" && <p>Allow the microphone when your browser asks.</p>}
          {phase === "error" && <p className="tc-error">{error}</p>}
          {phase === "cal" && (
            <div className="tc-cal">
              <div className="tc-cal-step">
                Step {calStep === "high" ? 1 : 2} of 2 · Fitting the board to your voice
              </div>
              {calRetry && (
                <p className="tc-cal-retry">Couldn't hear that clearly. Let's try again.</p>
              )}
              <p className="tc-cal-say">
                Say{" "}
                <b style={{ color: TONE_LINE_COLOR[calStep === "high" ? 1 : 3] }}>
                  {calStep === "high" ? "mā" : "mǎ"}
                </b>{" "}
                <span lang="zh-Hant-TW">{calStep === "high" ? "媽" : "馬"}</span>
              </p>
              <p>
                {calStep === "high"
                  ? "High and steady, like holding a note. Hold it for about a second, following the flat line."
                  : "Low: let your voice dip as low as is comfortable, following the line down."}
              </p>
              <div className="tc-meter" aria-hidden="true">
                <span style={{ width: `${Math.round(calProgress * 100)}%` }} />
              </div>
              <p className="tc-note">
                Every voice is different, so we measure yours first. Two short
                sounds, about 10 seconds, only once on this device.
              </p>
            </div>
          )}
          {phase === "ready" && !result && (
            <p>
              Your turn: say {ref.label.toLowerCase()} (
              <span lang="zh-Hant-TW">{ref.example}</span>).
            </p>
          )}
          {phase === "ready" && result && (
            <div className={`tc-result tc-result-${result.tier}`}>
              {result.percent !== null && (
                <span className="tc-percent">{result.percent}%</span>
              )}
              <span className="tc-headline">{result.headline}</span>
              {result.read && <span className="tc-read">{result.read}</span>}
              {result.percent !== null && (
                <span className="tc-note">
                  Tone accuracy against the {mode === "real" ? "real-speech" : "textbook"} line.
                </span>
              )}
              {result.tier === "good" && (
                <a className="tc-result-cta" href={appHref(undefined, PATH)}>
                  Now fly it: your voice steers the bird in FlappyTone →
                </a>
              )}
              {(result.tier === "ok" || result.tier === "bad") && (
                <a className="tc-result-cta" href={appHref("visualiser", PATH)}>
                  Practise it with real words and our speaker's audio →
                </a>
              )}
            </div>
          )}
          {phase === "paused" && <p>Paused. Tap Resume to keep going.</p>}
        </div>

        <div className="tc-controls">
          {!running && (
            <button
              type="button"
              className="tc-button tc-primary"
              disabled={phase === "loading" || phase === "opening"}
              onPointerDown={() => void loadEngine()}
              onClick={() => {
                if (phase === "tap-again" && engineLoaded) open(engineLoaded);
                else start();
              }}
            >
              {startLabel}
            </button>
          )}
          {phase === "paused" && (
            <button
              type="button"
              className="tc-button tc-primary"
              onClick={() => {
                checkerRef.current?.resume();
                setPhase("ready");
              }}
            >
              Resume
            </button>
          )}
          {phase === "ready" && (
            <button
              type="button"
              className="tc-button"
              onClick={() => {
                checkerRef.current?.clear();
                setResult(null);
              }}
            >
              Clear
            </button>
          )}
          {running && (
            <button
              type="button"
              className="tc-link"
              onClick={() => {
                setResult(null);
                checkerRef.current?.recalibrate();
              }}
            >
              Recalibrate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RefChip({ r, selected, pick }: { r: ToneRef; selected: boolean; pick: () => void }) {
  return (
    <button
      type="button"
      className={selected ? "tc-chip tc-chip-on" : "tc-chip"}
      aria-pressed={selected}
      onClick={pick}
    >
      {r.tones.map((t, i) => (
        <span key={i} style={{ color: TONE_LINE_COLOR[t] }}>
          {i ? " + " : ""}
          {r.tones.length > 1 ? t : `Tone ${t}`}
        </span>
      ))}
    </button>
  );
}

export function ToneVisualizer() {
  return (
    <div className="screen legal-screen site-page site-wide">
      <article className="legal-body">
        <header className="tm-head">
          <h1>Mandarin tone visualizer</h1>
          <p className="site-answer">
            See your Chinese tones as you say them. Pick a tone, choose the
            textbook shape or how a native speaker really says it, and your pitch
            is drawn over that line with a tone accuracy score. A free Chinese
            pronunciation checker for tones, no sign-up.
          </p>
        </header>

        <Visualizer />

        <div className="tm-notes">
          <section>
            <h2>How it works</h2>
            <p>
              Mandarin tones are pitch shapes: high and level, rising, dipping,
              falling. While you speak, the visualizer measures the pitch of your
              voice many times a second and draws it as your own line on the same
              board as the reference, so you can see where your tone goes flat,
              starts too high or falls too early.
            </p>
            <p>
              The percentage is tone accuracy: how close your shape is to the line
              you picked, whatever your speed. For single tones it also says which
              of the four tones your shape sounded most like. It checks the tone
              only, not the consonants or vowels.
            </p>
            <h2>Textbook vs real speech</h2>
            <p>
              Tone charts teach 55, 35, 214 and 51. Real speech is softer and
              faster: the third tone usually stays low, and pairs change shape
              (two third tones become a rising tone plus a third tone). Switch
              between the two lines to see the difference, then practise the one
              you need. More in the{" "}
              <a href="/chinese-tones">guide to the four Chinese tones</a>.
            </p>
          </section>
          <section>
            <h2>Questions</h2>
            {FAQ.map((f) => (
              <details key={f.q} className="site-faq" open>
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        </div>

        <PipCta
          path={PATH}
          intent="visualiser"
          preview="visualiser"
          title="Practise real words, then play"
          body="In FlappyTone you hear each word from our native speaker, practise it in the full visualizer, and your progress is saved with a free account. Then the game turns it into flight: your voice steers the bird through tunnels shaped like each tone."
          secondary={{ href: "/chinese-tones", label: "Read the tone guide" }}
        />
      </article>
    </div>
  );
}

export function toneVisualizerJsonLd(route: SiteRoute): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Mandarin Tone Visualizer",
      url: absoluteUrl(route.path),
      description: route.description,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript and a microphone",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: {
        "@type": "Organization",
        name: "FlappyTone",
        url: absoluteUrl("/"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}
