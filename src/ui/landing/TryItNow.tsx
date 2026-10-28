import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "../../brand.ts";
import { captureGameEvent, capturePostHogEvent } from "../../analytics/posthog.ts";
import type { AnalyticsEvent } from "../../analytics/session.ts";

type TryNowAction = Extract<AnalyticsEvent, { type: "tool_used"; tool: "try-now" }>;

/** Try it now's funnel, in the site tools' events (global tier, closed values). */
function trackTry(action: TryNowAction["action"], extra: Omit<TryNowAction, "type" | "tool" | "action"> = {}) {
  captureGameEvent({ type: "tool_used", tool: "try-now", action, ...extra });
}
import { wordsFromCatalog } from "../../game/words.ts";
import type { RunSnapshot } from "../../game/run.ts";
import { GameHud } from "../GameHud.tsx";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { DemoLoop } from "../DemoLoop.tsx";
import { go } from "./shared.tsx";
import { DemoGameOver } from "./DemoGameOver.tsx";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";

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
  | { kind: "preparing" }
  | { kind: "playing" }
  | { kind: "done"; stats: RunStats }
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
  /** Bumped on exit, so a run still loading when the visitor left never starts. */
  const attemptRef = useRef(0);
  /** The game's HUD, polled like Game.tsx does (never per frame). */
  const [hud, setHud] = useState<RunSnapshot | null>(null);

  const words = useMemo(() => {
    const all = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
    return all.filter((w) => EASY_IDS.includes(w.id));
  }, []);

  useEffect(
    () => () => {
      attemptRef.current++;
      stopRef.current?.();
    },
    [],
  );

  const open = async () => {
    capturePostHogEvent("landing_cta_clicked", { cta: "try_now", location: "hero_demo" });
    trackTry("opened");
    setStep({ kind: "loading" });
    try {
      const mini = await loadMini();
      setStep({ kind: "choose", mini, calibrated: mini.hasSavedCalibration() });
    } catch {
      trackTry("error");
      setStep({ kind: "error", message: "Couldn't load the game. Check your connection and try again." });
    }
  };

  const start = (mini: MiniModule, voice: "lower" | "higher") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStep({ kind: "preparing" });
    trackTry("started", { voice: mini.hasSavedCalibration() ? "saved" : voice });
    const attempt = ++attemptRef.current;
    const current = () => attempt === attemptRef.current;
    let poll = 0;
    mini
      .startMiniGame({
        canvas,
        width: W,
        height: H,
        words,
        voice,
        gates: GATES,
        onReady: () => {
          if (!current()) return;
          trackTry("ready");
          setStep({ kind: "playing" });
        },
        onEnd: (r) => {
          window.clearInterval(poll);
          setHud(null);
          stopRef.current = null;
          trackTry("finished");
          const acc = Object.fromEntries(toneBreakdown(r.stats).map((b) => [b.tone, b.pct === null ? null : Math.round(b.pct)]));
          const t = r.perTone;
          captureGameEvent({
            type: "tool_summary",
            tool: "try-now",
            cleared: r.cleared,
            total: r.total,
            unheard: r.unheard,
            t1Gates: t[1].gates,
            t1Cleared: t[1].cleared,
            t1Acc: acc[1] ?? null,
            t2Gates: t[2].gates,
            t2Cleared: t[2].cleared,
            t2Acc: acc[2] ?? null,
            t3Gates: t[3].gates,
            t3Cleared: t[3].cleared,
            t3Acc: acc[3] ?? null,
            t4Gates: t[4].gates,
            t4Cleared: t[4].cleared,
            t4Acc: acc[4] ?? null,
          });
          setStep({ kind: "done", stats: r.stats });
        },
      })
      .then((game) => {
        if (!current()) {
          game.stop();
          return;
        }
        stopRef.current = () => {
          window.clearInterval(poll);
          game.stop();
        };
        poll = window.setInterval(() => setHud(game.snapshot()), 100);
      })
      .catch((err: unknown) => {
        window.clearInterval(poll);
        if (!current()) return;
        const kind = mini.micErrorKind(err);
        trackTry(kind === "permission-denied" ? "mic_denied" : "error");
        setStep({ kind: "error", message: mini.micErrorCopy(kind) });
      });
  };

  /** Leave the run at any point: mic off, back to the recorded demo. */
  const exit = () => {
    attemptRef.current++;
    stopRef.current?.();
    stopRef.current = null;
    setHud(null);
    trackTry("exited", { stage: step.kind === "playing" ? "playing" : "preparing" });
    setStep({ kind: "demo" });
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
          <div className="sky-try-over">
            <DemoGameOver
              stats={step.stats}
              onSignup={() => {
                captureGameEvent({ type: "tool_cta_click", tool: "try-now", placement: "demo_gameover_signup" });
                go("play", "try_now_done");
              }}
              onRetry={() => {
                captureGameEvent({ type: "tool_cta_click", tool: "try-now", placement: "demo_gameover_retry" });
                void open();
              }}
            />
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
        {live || step.kind === "preparing" ? (
          <button className="sky-btn sky-btn-ghost sky-btn-small" onClick={exit}>
            Exit demo
          </button>
        ) : (
          brand.demoCaption
        )}
      </figcaption>
    </figure>
  );
}
