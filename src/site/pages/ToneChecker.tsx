import { useEffect, useRef, useState } from "react";
import { captureGameEvent } from "../../analytics/posthog.ts";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { Pip, PipCta } from "../Pip.tsx";
import {
  CHECKER_WORDS,
  checkerWordFor,
  DEFAULT_CHECKER_WORD,
  type CheckerWord,
} from "../checker/checkerWords.ts";
import {
  attemptView,
  makeCheckerReporter,
  type AttemptView,
  type CheckerReporter,
} from "../checker/checkerCopy.ts";
// Types only: erased at build, so the engine stays out of this chunk.
import type { CalStep, Checker } from "../checker/engine.ts";

const PATH = "/tools/tone-checker";

type EngineModule = typeof import("../checker/engine.ts");

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

type Phase =
  | "idle"
  | "loading"
  | "tap-again"
  | "opening"
  | "error"
  | "cal"
  | "ready"
  | "paused";

const TONES = [1, 2, 3, 4] as const;
const SINGLE = CHECKER_WORDS.filter((w) => w.tones.length === 1);
const PAIRS = CHECKER_WORDS.filter((w) => w.tones.length > 1);

/** The word's measured shape as a static SVG path — the idle board. */
function shapePath(w: CheckerWord, width: number, height: number): string {
  const y = (chao: number) => height - ((chao - 1) / 4) * height;
  return w.polyline
    .map(([t, c], i) => `${i ? "L" : "M"}${(t * width).toFixed(1)} ${y(c).toFixed(1)}`)
    .join(" ");
}

function ColoredPinyin({ w }: { w: CheckerWord }) {
  const parts = w.pinyin.split(" ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={{ color: TONE_LINE_COLOR[w.tones[i] ?? w.tone] }}>
          {i ? " " : ""}
          {p}
        </span>
      ))}
    </>
  );
}

const FAQ = [
  {
    q: "Does it work on my phone?",
    a: "Yes. It runs in the browser on iPhone (Safari) and Android (Chrome). Tap Start and allow the microphone. Hold the phone about a hand's length from your mouth, in a quiet room.",
  },
  {
    q: "Why do I have to calibrate first?",
    a: "Everyone's voice sits at a different height. You say one high, level mā and one low mǎ, and the checker sizes the board to your voice. That takes about ten seconds, and it is saved on this device. If you have played FlappyTone on this device, it uses that calibration instead.",
  },
  {
    q: "Why does it say “couldn't hear that”?",
    a: "The sound was too short or too quiet to measure a tone, so it gives no score instead of a wrong one. Say the word a little longer and a little louder, closer to the microphone. A creaky, very low third tone can also drop out; that is normal, just try again.",
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

/** The checker: pick a word, listen, say it, see your line over ours. */
function Checker() {
  const [word, setWord] = useState<CheckerWord>(() =>
    checkerWordFor(DEFAULT_CHECKER_WORD),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [calStep, setCalStep] = useState<CalStep>("high");
  const [calRetry, setCalRetry] = useState(false);
  const [calProgress, setCalProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fromApp, setFromApp] = useState(false);
  const [result, setResult] = useState<AttemptView | null>(null);
  const [listening, setListening] = useState(false);
  const reporter = useReporter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const checkerRef = useRef<Checker | null>(null);
  const wordRef = useRef(word);

  const pick = (w: CheckerWord) => {
    wordRef.current = w;
    setWord(w);
    setResult(null);
    checkerRef.current?.setWord(w);
  };

  // `?word=<id>` (deep links from word pages). Read after mount so the
  // prerendered markup (default word) and the first client render agree.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("word");
    if (!id) return;
    const w = checkerWordFor(id);
    wordRef.current = w;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is read once, after hydration
    setWord(w);
  }, []);

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
      checkerRef.current?.resize(Math.round(r.width), Math.round(r.height));
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
          wordRef.current,
          {
            onCalStep(step, retry) {
              setPhase("cal");
              setCalStep(step);
              setCalRetry(retry);
            },
            onCalProgress: setCalProgress,
            onReady(app) {
              setFromApp(app);
              setPhase("ready");
              reporter.action("calibrated");
            },
            onAttempt(r) {
              const w = wordRef.current;
              reporter.attempt(w.id);
              setResult(attemptView(r, w.tone, w.tones.length));
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
        setError("Couldn't load the checker. Check your connection and try again.");
        setPhase("error");
      },
    );
  };

  const listen = async () => {
    setListening(true);
    try {
      if (checkerRef.current) await checkerRef.current.listen(word);
      else await (await import("../wordAudio.ts")).playWord(word.id);
    } finally {
      setListening(false);
    }
  };

  const running = phase === "cal" || phase === "ready" || phase === "paused";
  const startLabel =
    phase === "tap-again" ? "Allow the microphone" : phase === "error" ? "Try again" : "Start";

  return (
    <div className="tc-tool" role="group" aria-label="Chinese tone checker">
      <Pip size={72} tilt={-10} className="tm-tool-pip" />
      <div className="tc-picker">
        <div className="tc-picker-label">Pick a word</div>
        {TONES.map((t) => (
          <div key={t} className="tc-row">
            <span className="tc-row-label" style={{ color: TONE_LINE_COLOR[t] }}>
              Tone {t}
            </span>
            {SINGLE.filter((w) => w.tone === t).map((w) => (
              <WordChip key={w.id} w={w} selected={w.id === word.id} pick={pick} />
            ))}
          </div>
        ))}
        {PAIRS.length > 0 && (
          <div className="tc-row">
            <span className="tc-row-label">Two syllables</span>
            {PAIRS.map((w) => (
              <WordChip key={w.id} w={w} selected={w.id === word.id} pick={pick} />
            ))}
          </div>
        )}
      </div>

      <div className="tc-main">
        <div className="tc-word">
          <span className="tc-hanzi" lang="zh-Hant-TW">
            {word.hanzi}
          </span>
          <span className="tc-pinyin">
            <ColoredPinyin w={word} />
          </span>
          <span className="tc-english">{word.english}</span>
          <button
            type="button"
            className="tc-button"
            onClick={() => void listen()}
            disabled={listening}
          >
            {listening ? "Playing…" : "Listen"}
          </button>
        </div>

        <div className="tc-stage" ref={stageRef}>
          <canvas ref={canvasRef} className="tc-canvas" aria-hidden="true" />
          {!running && (
            <svg
              className="tc-idle"
              viewBox="0 0 300 120"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={shapePath(word, 300, 120)}
                style={{ stroke: TONE_LINE_COLOR[word.tone] }}
              />
            </svg>
          )}
        </div>

        <div className="tc-status" aria-live="polite">
          {phase === "idle" && (
            <p>
              The line is how our native speaker says {word.hanzi}. Tap Start,
              then say the word and see your line drawn over it.
            </p>
          )}
          {phase === "loading" && <p>Loading the checker…</p>}
          {phase === "tap-again" && <p>Ready. Tap once more to allow the microphone.</p>}
          {phase === "opening" && <p>Allow the microphone when your browser asks.</p>}
          {phase === "error" && <p className="tc-error">{error}</p>}
          {phase === "cal" && (
            <div className="tc-cal">
              <p>
                <strong>
                  Quick setup, step {calStep === "high" ? 1 : 2} of 2.
                </strong>{" "}
                {calRetry && "Couldn't hear that clearly, let's try again. "}
                {calStep === "high" ? (
                  <>
                    Say <b style={{ color: TONE_LINE_COLOR[1] }}>mā</b>: high and
                    level, held for a second.
                  </>
                ) : (
                  <>
                    Now say <b style={{ color: TONE_LINE_COLOR[3] }}>mǎ</b>: low,
                    the lowest you comfortably can.
                  </>
                )}
              </p>
              <div className="tc-meter" aria-hidden="true">
                <span style={{ width: `${Math.round(calProgress * 100)}%` }} />
              </div>
            </div>
          )}
          {phase === "ready" && !result && (
            <p>
              Your turn: say <b lang="zh-Hant-TW">{word.hanzi}</b>{" "}
              <ColoredPinyin w={word} />.
              {fromApp && " Using your FlappyTone calibration."}
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
                <span className="tc-note">Tone accuracy against our recording.</span>
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

function WordChip({
  w,
  selected,
  pick,
}: {
  w: CheckerWord;
  selected: boolean;
  pick: (w: CheckerWord) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "tc-chip tc-chip-on" : "tc-chip"}
      aria-pressed={selected}
      onClick={() => pick(w)}
    >
      <span lang="zh-Hant-TW">{w.hanzi}</span>{" "}
      <span className="tc-chip-pinyin">
        <ColoredPinyin w={w} />
      </span>
    </button>
  );
}

export function ToneChecker() {
  return (
    <div className="screen legal-screen site-page site-wide">
      <article className="legal-body">
        <header className="tm-head">
          <h1>Chinese pronunciation checker for tones</h1>
          <p className="site-answer">
            Pick a word, hear our native speaker say it, then say it yourself.
            Your pitch is drawn over the recording's tone shape, with a tone
            accuracy score and which tone it sounded like. Free, no sign-up.
          </p>
        </header>

        <Checker />

        <div className="tm-notes">
          <section>
            <h2>How it works</h2>
            <p>
              Mandarin tones are pitch shapes: high and level, rising, dipping,
              falling. The coloured line is the shape our native speaker made
              in the recording. When you speak, the checker measures
              the pitch of your voice many times a second and draws it as your
              own line on the same board, so you can see where your tone goes
              flat, starts too high or falls too early.
            </p>
            <p>
              The percentage is tone accuracy: how close your shape is to the
              recording's, whatever your speed. The tone read says which of the
              four tones your shape sounded most like. It checks the tone only,
              not the consonants or vowels.
            </p>
            <p>
              Everything runs in your browser. Your voice is not recorded or
              sent anywhere. New to tones? Start with the{" "}
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
          title="Practise every word, then play"
          body="This checker has 24 words. FlappyTone has hundreds of recorded words, and the game turns them into flight: your voice steers the bird through tunnels shaped like each tone."
          secondary={{ href: "/chinese-tones", label: "Read the tone guide" }}
        />
      </article>
    </div>
  );
}

export function toneCheckerJsonLd(route: SiteRoute): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Chinese Tone Checker",
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
