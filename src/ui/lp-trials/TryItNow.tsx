import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "../../brand.ts";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { wordsFromCatalog } from "../../game/words.ts";
import type { RunSnapshot } from "../../game/run.ts";
import { GameHud } from "../GameHud.tsx";
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

/** An encouraging line and a nudge into the game, by how the run went. */
function verdict(cleared: number, total: number): { title: string; nudge: string } {
  const share = total ? cleared / total : 0;
  if (share >= 0.8) {
    return { title: "Great ear!", nudge: "You're ready for more. The game has 450+ words and real tone pairs." };
  }
  if (share >= 0.4) {
    return { title: "Nice start!", nudge: "A few runs a day and these shapes start to stick. Keep going in the game." };
  }
  return { title: "Everyone starts here", nudge: "Tones click with practice. The game builds them up one word at a time." };
}

type Step =
  | { kind: "demo" }
  | { kind: "loading" }
  | { kind: "choose"; mini: MiniModule; calibrated: boolean }
  | { kind: "preparing" }
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
  const stopRef = useRef<(() => void) | null>(null);
  /** The game's HUD, polled like Game.tsx does (never per frame). */
  const [hud, setHud] = useState<RunSnapshot | null>(null);

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
    setStep({ kind: "preparing" });
    let poll = 0;
    mini
      .startMiniGame({
        canvas,
        width: W,
        height: H,
        words,
        voice,
        gates: GATES,
        onReady: () => setStep({ kind: "playing" }),
        onEnd: (r) => {
          window.clearInterval(poll);
          setHud(null);
          stopRef.current = null;
          capturePostHogEvent("landing_try_now_done", { cleared: r.cleared, total: r.total });
          setStep({ kind: "done", ...r });
        },
      })
      .then((game) => {
        stopRef.current = () => {
          window.clearInterval(poll);
          game.stop();
        };
        poll = window.setInterval(() => setHud(game.snapshot()), 100);
      })
      .catch((err: unknown) => {
        window.clearInterval(poll);
        setStep({ kind: "error", message: mini.micErrorCopy(mini.micErrorKind(err)) });
      });
  };

  const live = step.kind === "playing";

  return (
    <figure id="demo" className="sky-screen sky-try">
      <div className="sky-try-stage">
        {/* The canvas exists from the first tap so `start` can draw at once. */}
        <div className="stage game-stage sky-try-game" hidden={!live}>
          <canvas
            ref={canvasRef}
            className="sky-try-canvas"
            role="img"
            aria-label="The game: listen to the word, then say it to fly the bird through its corridor."
          />
          {live && (
            <GameHud
              hud={hud}
              flash={null}
              mode="game"
              scored
              showTranslation={false}
              showPinyin
              showToneMarks
              showPause={false}
              onPause={() => {}}
            />
          )}
        </div>
        {!live && <DemoLoop width={340} />}

        {step.kind === "demo" && (
          <button className="sky-btn sky-try-button" onClick={open}>
            Try it now
          </button>
        )}
        {step.kind === "loading" && <p className="sky-try-panel" role="status">Loading the game…</p>}
        {step.kind === "preparing" && (
          <p className="sky-try-panel" role="status">
            Loading the words…
            <span className="sky-small">Turn your sound on: you hear each word before you say it.</span>
          </p>
        )}
        {step.kind === "choose" && (
          <div className="sky-try-panel">
            <p>
              {step.calibrated
                ? "Listen to each word, then say it to fly through its tunnel."
                : "Pick your voice so the bird fits your range. Then listen to each word and say it back."}
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
            <p className="sky-try-score">{verdict(step.cleared, step.total).title}</p>
            <p>
              {step.cleared} of {step.total} tunnels cleared. {verdict(step.cleared, step.total).nudge}
            </p>
            <button className="sky-btn" onClick={() => go("play", "try_now_done")}>
              Keep practising, free
            </button>
            <button className="sky-btn sky-btn-ghost" onClick={open}>
              One more round
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
        {live ? null : brand.demoCaption}
      </figcaption>
    </figure>
  );
}
