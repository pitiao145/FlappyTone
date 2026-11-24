import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { captureGameEvent } from "../../analytics/posthog.ts";
import { appHref } from "../../ui/appLink.ts";
import { useSignedIn } from "../../ui/signedIn.ts";
import { VoiceChoice } from "../../ui/VoiceChoice.tsx";
import { saveVoiceStart, type VoicePreset } from "../../game/voiceStart.ts";
import { trackSignupCta } from "../DemoCta.tsx";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { Pip, PipCta } from "../Pip.tsx";
import { SpeakerHighIcon } from "../../ui/icons.tsx";
import {
  DEFAULT_REF,
  polylineOf,
  refFor,
  type RefId,
  type RefMode,
  type ToneRef,
} from "../checker/toneRefs.ts";
import { arrivalTarget, toneTarget, type ToolCta } from "../../ui/toolEntry.ts";
import { makeCheckerReporter, type CheckerReporter } from "../checker/checkerCopy.ts";
import { InAppMicNotice, MicAllowNote, MicHelpPanel, continueInApp } from "../../ui/MicHelp.tsx";

const PATH = "/tools/tone-visualizer";

/**
 * Brief 52: every signup CTA here opens the in-app Visualiser on the tone or
 * pair the visitor is on, and says which CTA it was, so /app can show a
 * tool-user signup screen (see `src/ui/toolEntry.ts`).
 */
function toolHref(id: RefId, cta: ToolCta): string {
  return appHref("visualiser", PATH, { tone: id, cta });
}

/**
 * The tone or pair the tool is on, for the closing card, which sits outside
 * `Visualizer`. The prerender (and the first client render) use the default.
 */
let currentRefId: RefId = DEFAULT_REF;
const refListeners = new Set<() => void>();
function setCurrentRef(id: RefId): void {
  if (id === currentRefId) return;
  currentRefId = id;
  refListeners.forEach((f) => f());
}
function subscribeRef(f: () => void): () => void {
  refListeners.add(f);
  return () => refListeners.delete(f);
}

type HostModule = typeof import("../toolMic.ts") & typeof import("../toolVisualiser.tsx");

/**
 * Brief 53: the app's own Visualiser, plus the mic — the only site code that
 * touches Web Audio here. Loaded on the first press of Start (pointerdown, so
 * it is usually ready by the click), never with the page (hard rule 13).
 */
let hostPromise: Promise<HostModule> | null = null;
let hostLoaded: HostModule | null = null;
function loadHost(): Promise<HostModule> {
  hostPromise ??= Promise.all([import("../toolMic.ts"), import("../toolVisualiser.tsx")]).then(([mic, ui]) => {
    hostLoaded = { ...mic, ...ui };
    return hostLoaded;
  });
  hostPromise.catch(() => {
    hostPromise = null;
  });
  return hostPromise;
}

type Phase = "idle" | "loading" | "tap-again" | "voice" | "opening" | "error" | "running";

/**
 * The stand-in board before Start: the third tone's line on the board's own
 * axes (time from the bird's rest point, chao 1–5 over the playable band).
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
    q: "What is the difference between Standard and Spoken?",
    a: "Both lines are the average shape of many words recorded by our native Taiwan Mandarin speaker. Standard is her slow, clear speech, close to how tones are taught. Spoken is her everyday speed. They often differ: in everyday speech the third tone rarely rises as high, and two third tones in a row are not said as written. Pick the one you want to practise; you are scored against that line.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It runs in the browser on iPhone (Safari) and Android (Chrome). Tap Start and allow the microphone. Hold the phone about a hand's length from your mouth, in a quiet room.",
  },
  {
    q: "Why do I have to calibrate first?",
    a: "Everyone's voice sits at a different height. You pick a lower or a higher voice, and the visualizer sizes the board from it. That takes one tap, and it is saved on this device. If you have played FlappyTone on this device, it uses that calibration instead.",
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

/**
 * The tool: the app's Visualiser in tool mode (brief 53). Before Start, a
 * static stand-in of the same size with the tones and their example words,
 * so the prerender keeps that text and nothing moves when it swaps in.
 */
function Visualizer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  /** The last mic failure's kind; `permission-denied` shows the unblock help. */
  const [micKind, setMicKind] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const signedIn = useSignedIn();
  const reporter = useReporter();
  const refId = useSyncExternalStore(subscribeRef, () => currentRefId, () => DEFAULT_REF);
  const boxRef = useRef<HTMLDivElement>(null);
  /** `?tone=3-3` (links from the guide pages): the tone or pair to open on; Tone 3 by default. */
  const [arrival] = useState(() => {
    const q = typeof window === "undefined" ? "" : window.location.search;
    return arrivalTarget(`?intent=visualiser&tone=${new URLSearchParams(q).get("tone") ?? DEFAULT_REF}`);
  });

  // Leaving the page stops the mic, and sends the visit's counts once.
  useEffect(() => {
    const onHide = () => {
      reporter.summary();
      hostLoaded?.closeMic();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      hostLoaded?.closeMic();
    };
  }, [reporter]);

  // The Visualiser is sized to the box the page reserves for it.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  /** Opens the mic inside this tap (hard rule 4), then shows the Visualiser. */
  const open = (mod: HostModule) => {
    setPhase("opening");
    setError(null);
    setMicKind(null);
    // Starting here is the in-app notice's "continue here" (brief 27).
    continueInApp();
    mod
      .openMic()
      .then(() => setPhase("running"))
      .catch((err: unknown) => {
        const kind = mod.micErrorKind(err);
        if (kind === "permission-denied" || kind === "no-microphone") {
          reporter.action("mic_denied");
        }
        setMicKind(kind);
        setError(mod.micErrorMessage(err));
        setPhase("error");
        mod.closeMic();
      });
  };

  /** With a board on this device, straight to the mic; else the voice choice first. */
  const begin = (mod: HostModule) => {
    if (mod.toolSettings()) open(mod);
    else setPhase("voice");
  };

  const start = () => {
    reporter.action("started");
    if (hostLoaded) {
      begin(hostLoaded);
      return;
    }
    // The chunk was not ready inside this tap. Opening the mic after an
    // await would lose the gesture on iOS, so ask for one more tap.
    setPhase("loading");
    loadHost().then(
      () => setPhase("tap-again"),
      () => {
        setError("Couldn't load the visualizer. Check your connection and try again.");
        setPhase("error");
      },
    );
  };

  const chooseVoice = (p: VoicePreset) => {
    saveVoiceStart(p);
    reporter.action("calibrated");
    if (hostLoaded) open(hostLoaded);
  };

  /** The note under the board: signup, or the app for a browser that is signed in. */
  const lockedCta = signedIn
    ? { href: toolHref(refId, "more"), label: "Open full visualizer" }
    : { href: toolHref(refId, "hear"), label: "Hear every word" };

  return (
    <div className="tc-tool tool-vis-tool" role="group" aria-label="Mandarin tone visualizer">
      <div className="tool-vis" ref={boxRef}>
        {phase === "running" && hostLoaded && size ? (
          <hostLoaded.ToolVisualiser
            width={size.w}
            height={size.h}
            arrival={arrival}
            tool={{
              cta: {
                ...lockedCta,
                onClick: () => trackSignupCta(PATH, "visualizer_sound_locked", refId),
              },
              onAttempt: (id) => reporter.attempt(id),
              onLockedSound: () => reporter.action("sound_locked"),
              onTarget: (id) => {
                if (id !== null && toneTarget(id)) setCurrentRef(id as RefId);
              },
            }}
          />
        ) : phase === "voice" ? (
          <div className="tool-vis-voice">
            <VoiceChoice
              onChoose={chooseVoice}
              onBack={() => setPhase("idle")}
              note="The board starts from this voice, so your line sits where it should."
              help="Not sure? Pick either."
            />
          </div>
        ) : (
          <StandIn
            phase={phase}
            error={error}
            micKind={micKind}
            onStart={start}
            onRetry={() => (hostLoaded ? begin(hostLoaded) : start())}
            onTapAgain={() => hostLoaded && begin(hostLoaded)}
          />
        )}
      </div>

      {/* One word per tone plays here; hearing every word is what the app
          adds, so that wish leads there (brief 52's tool-user signup). */}
      <aside className="tool-cta">
        <div className="tool-cta-text">
          <p className="tool-cta-title">
            <SpeakerHighIcon />
            Hear every word from a native speaker
          </p>
          <p className="tool-cta-body">
            Sign up free: 5 practice words per tone and 10 per tone pair, each one said by our native
            speaker, so you hear it before you say it.
          </p>
        </div>
        <a
          className="sticker-button"
          href={signedIn ? toolHref(refId, "more") : toolHref(refId, "hear")}
          onClick={() => trackSignupCta(PATH, "visualizer_hear_example", refId)}
        >
          {signedIn ? "Open the full visualizer" : "Sign up free"}
        </a>
      </aside>
    </div>
  );
}

/**
 * The tool before Start: the Visualiser's empty board (the chao grid, the
 * third tone's guide line, the bird) with one Start card on it.
 */
function StandIn({
  phase,
  error,
  micKind,
  onStart,
  onRetry,
  onTapAgain,
}: {
  phase: Phase;
  error: string | null;
  micKind: string | null;
  onStart: () => void;
  onRetry: () => void;
  onTapAgain: () => void;
}) {
  const ref = refFor(DEFAULT_REF);
  const helpOpen = phase === "error" && micKind === "permission-denied";
  return (
    <div className="tool-vis-standin">
      <div className="tool-vis-board">
        <svg className="tool-vis-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((c) => (
            <line key={c} x1="0" x2="100" y1={90 - (c - 1) * 20} y2={90 - (c - 1) * 20} />
          ))}
          <path className="tool-vis-guide" d={shapePath(ref, "textbook")} />
        </svg>
        <Pip size={40} className="tool-vis-bird" />
        <div className="tool-vis-start" aria-live="polite">
          {helpOpen ? (
            <MicHelpPanel surface="visualizer-tool" reason="permission-denied" onTryAgain={onRetry} />
          ) : (
            <>
              <p className="tool-vis-start-title">Say a tone, see its shape</p>
              <button
                type="button"
                className="sticker-button"
                disabled={phase === "loading" || phase === "opening"}
                onPointerDown={() => void loadHost()}
                onClick={phase === "tap-again" ? onTapAgain : phase === "error" ? onRetry : onStart}
              >
                {phase === "tap-again"
                  ? "Allow the microphone"
                  : phase === "error"
                    ? "Try again"
                    : phase === "loading" || phase === "opening"
                      ? "One moment…"
                      : "Start"}
              </button>
              {phase === "error" && error ? (
                <p className="tc-error">{error}</p>
              ) : phase === "opening" ? (
                <p>Allow the microphone when your browser asks.</p>
              ) : phase === "tap-again" ? (
                <p>Ready. Tap once more to allow the microphone.</p>
              ) : (
                <p>
                  Pick a lower or higher voice, then say a word. Your pitch is drawn over our native
                  speaker&apos;s line, Standard (slow, clear) or Spoken (everyday speed), with your tone
                  accuracy.
                </p>
              )}
              {(phase === "idle" || phase === "tap-again") && <InAppMicNotice surface="visualizer-tool" />}
              {(phase === "idle" || phase === "tap-again") && <MicAllowNote />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ToneVisualizer() {
  const refId = useSyncExternalStore(subscribeRef, () => currentRefId, () => DEFAULT_REF);
  return (
    <div className="screen legal-screen site-page site-wide">
      <article className="legal-body">
        <header className="tm-head">
          <h1>Mandarin tone visualizer</h1>
          <p className="site-answer">
            See your Chinese tones as you say them. Pick a tone or a tone pair,
            choose how a native speaker says it slowly or at everyday speed, and
            your pitch is drawn over that line with a tone accuracy score. A free Chinese
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
          </section>
          <section>
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
            <h2>Common questions</h2>
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
          to="signup"
          intent="visualiser"
          params={{ tone: refId, cta: "more" }}
          preview="visualiser"
          title="Practise, then play"
          body="Practise in the full visualizer, then let the game turn it into flight: your voice steers the bird through tunnels shaped like each tone."
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
