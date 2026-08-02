import { useEffect, useRef, useState } from "react";
import { playToneCue } from "../audio/reference.ts";
import { getMicSession, setFrameSink, stopMic } from "../audio/session.ts";
import { TONE_INFO } from "../game/gates.ts";
import { Run, type RunMode, type RunSnapshot } from "../game/run.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { drawWorld } from "../render/world.ts";

/** HUD refresh rate. React never renders per frame — the rAF loop owns the canvas. */
const HUD_HZ = 4;
/** PRD §9: the reference cue plays this long before the gate arrives. */
const CUE_LEAD_MS = 300;
/** msUntil jumping up by more than this means `upcoming` moved to the next gate. */
const NEW_GATE_JUMP_MS = 50;
/** How long the "couldn't hear that" toast stays up. */
const TOAST_MS = 1200;

interface Props {
  mode: RunMode;
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
  onOver: (snapshot: RunSnapshot) => void;
  onQuit: () => void;
}

export function Game({
  mode,
  settings,
  canvasWidth,
  canvasHeight,
  onOver,
  onQuit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<RunSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  /** Set by the effect so the pause overlay's tap can restart the loop. */
  const resumeRef = useRef<() => void>(() => {});
  const [unheard, setUnheard] = useState(false);
  const onOverRef = useRef(onOver);
  useEffect(() => {
    onOverRef.current = onOver;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d");
    if (!canvas || !ctx2d) return;

    const run = new Run({ mode, width: canvas.width });
    let tracker: PitchTracker | null = null;
    let rafId = 0;
    let running = true;
    let finished = false;
    let lastT = performance.now();
    // Cue bookkeeping: fire once per gate as msUntil falls through the lead.
    let cued = false;
    let prevMsUntil = Infinity;

    // The mic is already open — Title opened it inside the click gesture.
    setFrameSink((frame, sampleRate) => {
      tracker ??= new PitchTracker({
        sampleRate,
        f0Center: settings.f0Center,
        noiseFloor: settings.noiseFloor,
        rangeSemitones: settings.rangeSemitones,
      });
      run.tickAudio(tracker.push(frame), performance.now());
    });

    const tick = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      run.tickFrame(dt, now);
      const snap = run.snapshot();
      drawWorld(ctx2d, canvas.width, canvas.height, snap);

      const msUntil = snap.upcoming?.msUntil ?? Infinity;
      if (msUntil > prevMsUntil + NEW_GATE_JUMP_MS) cued = false;
      prevMsUntil = msUntil;
      if (!cued && snap.upcoming && msUntil <= CUE_LEAD_MS) {
        cued = true;
        const audio = getMicSession()?.ctx;
        // Same context the mic runs on, so it is already gesture-resumed.
        if (audio && audio.state === "running") {
          playToneCue(
            audio,
            snap.upcoming.tone,
            settings.f0Center,
            settings.rangeSemitones,
          );
        }
      }

      if (snap.over && !finished) {
        finished = true;
        running = false;
        setFrameSink(null);
        stopMic();
        onOverRef.current(snap);
        return;
      }
      if (running) rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    };
    resumeRef.current = () => {
      const audio = getMicSession()?.ctx;
      // resume() is called from the overlay's click handler — iOS needs that.
      if (audio && audio.state === "suspended") void audio.resume();
      setPaused(false);
      if (!finished) start();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      running = false;
      cancelAnimationFrame(rafId);
      void getMicSession()?.ctx.suspend();
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const hudTimer = setInterval(() => {
      const snap = run.snapshot();
      setHud(snap);
      setUnheard(
        snap.lastOutcome?.outcome === "unheard" &&
          performance.now() - snap.lastOutcome.atMs < TOAST_MS,
      );
    }, 1000 / HUD_HZ);
    start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(hudTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameSink(null);
    };
  }, [mode, settings]);

  const upcomingTone = hud?.upcoming?.tone ?? hud?.activeGate?.tone ?? null;
  const info = upcomingTone === null ? null : TONE_INFO[upcomingTone];

  return (
    <div className="screen game-screen">
      <div className="stage">
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />

        <div className="hud">
          <div className="hud-top">
            <span className="score">{hud?.score ?? 0}</span>
            {mode === "game" && (
              <span className="hearts">
                {"♥".repeat(Math.max(0, hud?.hearts ?? 3))}
              </span>
            )}
            {mode === "game" && (hud?.comboMult ?? 1) > 1 && (
              <span className="combo">×{hud?.comboMult}</span>
            )}
          </div>

          {info && upcomingTone !== null && (
            <div className="hud-syllable">
              <span className="syllable">{info.pinyin}</span>
              <span className="hanzi">{info.hanzi}</span>
              <span className="tone-num">({upcomingTone})</span>
              {mode === "tutorial" && <span className="cue">{info.cue}</span>}
            </div>
          )}

          {unheard && <div className="toast">couldn't hear that</div>}
          {hud?.noisy && <div className="hint">it's noisy in here</div>}
        </div>

        <button className="mic-stop" onClick={onQuit} title="End the run">
          ■ quit
        </button>

        {paused && (
          <div className="overlay" onClick={() => resumeRef.current()}>
            <p>paused — tap to continue</p>
          </div>
        )}
      </div>
    </div>
  );
}
