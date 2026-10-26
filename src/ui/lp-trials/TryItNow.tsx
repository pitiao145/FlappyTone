import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "../../brand.ts";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { wordsFromCatalog, type Word } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { DemoLoop } from "../DemoLoop.tsx";
import { go } from "./shared.tsx";

type MiniModule = typeof import("./miniGame.ts");

/** The mic chunk, loaded on the first tap so the second tap can open the mic. */
let modulePromise: Promise<MiniModule> | null = null;
function loadMini(): Promise<MiniModule> {
  modulePromise ??= import("./miniGame.ts");
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

/** Easy single syllables, all textbook-clear and guest-playable. */
const EASY_IDS = ["ma1b", "ma2", "ma3b", "ma4b", "mao1", "wo3"];
const GATES = 6;
const W = 420;
const H = 640;

type Step =
  | { kind: "demo" }
  | { kind: "loading" }
  | { kind: "choose"; mini: MiniModule; calibrated: boolean }
  | { kind: "playing" }
  | { kind: "done"; cleared: number; total: number; unheard: number }
  | { kind: "error"; message: string };

/**
 * The hero's demo, with a "Try it now" button over it. Tap once: the mic
 * chunk loads and the visitor picks a voice. Tap again: the mic opens (inside
 * that tap) and six easy gates fly right here, no account, no calibration.
 */
export function TryItNow() {
  const [step, setStep] = useState<Step>({ kind: "demo" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const words = useMemo(() => {
    const all = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
    return all.filter((w) => EASY_IDS.includes(w.id));
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const open = async () => {
    capturePostHogEvent("landing_cta_clicked", { cta: "try_now", location: "hero_demo" });
    setStep({ kind: "loading" });
    try {
      const mini = await loadMini();
      setStep({ kind: "choose", mini, calibrated: mini.hasSavedCalibration() });
    } catch {
      setStep({ kind: "error", message: "Couldn't load the game. Check your connection and try again." });
    }
  };

  const start = (mini: MiniModule, voice: "lower" | "higher") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStep({ kind: "playing" });
    mini
      .startMiniGame({
        canvas,
        width: W,
        height: H,
        words,
        voice,
        gates: GATES,
        onWord: (word: Word | null) => {
          const el = wordRef.current;
          if (!el) return;
          el.textContent = word ? `${word.hanzi} ${word.pinyin}: ${brand.tones[word.tone].cue}` : "Get ready…";
        },
        onEnd: (r) => {
          stopRef.current = null;
          capturePostHogEvent("landing_try_now_done", { cleared: r.cleared, total: r.total });
          setStep({ kind: "done", ...r });
        },
      })
      .then((stop) => {
        stopRef.current = stop;
      })
      .catch((err: unknown) => {
        setStep({ kind: "error", message: mini.micErrorCopy(mini.micErrorKind(err)) });
      });
  };

  const live = step.kind === "playing";

  return (
    <figure id="demo" className="sky-screen sky-try">
      <div className="sky-try-stage">
        {/* The canvas exists from the first tap so `start` can draw at once. */}
        <canvas
          ref={canvasRef}
          className="sky-try-canvas"
          hidden={!live}
          role="img"
          aria-label="The game: say the tone to fly the bird through its corridor."
        />
        {!live && <DemoLoop width={340} />}

        {step.kind === "demo" && (
          <button className="sky-btn sky-try-button" onClick={open}>
            Try it now
          </button>
        )}
        {step.kind === "loading" && <p className="sky-try-panel" role="status">Loading the game…</p>}
        {step.kind === "choose" && (
          <div className="sky-try-panel">
            <p>
              {step.calibrated
                ? "Ready when you are. Say each word as the bird reaches its tunnel."
                : "Pick your voice so the bird fits your range. Then say each word."}
            </p>
            {step.calibrated ? (
              <button className="sky-btn" onClick={() => start(step.mini, "lower")}>
                Start
              </button>
            ) : (
              <div className="sky-try-voices">
                <button className="sky-btn" onClick={() => start(step.mini, "lower")}>
                  Lower voice
                </button>
                <button className="sky-btn" onClick={() => start(step.mini, "higher")}>
                  Higher voice
                </button>
              </div>
            )}
            <p className="sky-small">{brand.requirement}</p>
          </div>
        )}
        {step.kind === "done" && (
          <div className="sky-try-panel">
            <p className="sky-try-score">
              {step.cleared} of {step.total} tunnels cleared
            </p>
            {step.unheard > 0 && (
              <p className="sky-small">We couldn&rsquo;t hear {step.unheard} of them. That never counts against you.</p>
            )}
            <button className="sky-btn" onClick={() => go("play", "try_now_done")}>
              Play the full game
            </button>
            <button className="sky-btn sky-btn-ghost" onClick={open}>
              Try again
            </button>
          </div>
        )}
        {step.kind === "error" && (
          <div className="sky-try-panel" role="alert">
            <p>{step.message}</p>
            <button className="sky-btn sky-btn-ghost" onClick={open}>
              Try again
            </button>
          </div>
        )}
      </div>
      <figcaption>
        {step.kind === "playing" ? <span ref={wordRef}>Get ready…</span> : brand.demoCaption}
      </figcaption>
    </figure>
  );
}
