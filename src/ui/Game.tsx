import { useEffect, useRef, useState } from "react";
import {
  cueDurationMsFor,
  loadReferenceClips,
  playToneCue,
} from "../audio/reference.ts";
import { getMicSession, setFrameSink, stopMic } from "../audio/session.ts";
import { TONE_INFO } from "../game/gates.ts";
import { Run, type RunMode, type RunSnapshot } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadPace,
  type CalibrationSettings,
} from "../game/settings.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { drawWorld } from "../render/world.ts";

/** HUD refresh rate. React never renders per frame — the rAF loop owns the canvas. */
const HUD_HZ = 4;
/** "Your turn" flashes while the active gate is in its first stretch. */
const YOUR_TURN_MAX_T = 0.5;
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

    // Game remounts per run, so this picks up the latest saved pace.
    const run = new Run({
      mode,
      width: canvas.width,
      pace: loadPace(),
      corridor: loadCorridorWidth(),
      cueStyle: loadCueStyle(),
      // Queried at cue time — clips finish loading after the Run exists.
      cueDurationMsFor,
    });
    {
      const audio = getMicSession()?.ctx;
      if (audio) void loadReferenceClips(audio);
    }
    let tracker: PitchTracker | null = null;
    let rafId = 0;
    let running = true;
    let finished = false;
    let lastT = performance.now();
    // The run decides when a cue fires (snapshot.cue); the host only plays
    // the audio, edge-triggered on the cued gate's stable xStart.
    let lastPlayedXStart = -Infinity;

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

      if (snap.cue && snap.cue.xStart > lastPlayedXStart) {
        lastPlayedXStart = snap.cue.xStart;
        const audio = getMicSession()?.ctx;
        // Same context the mic runs on, so it is already gesture-resumed.
        if (audio && audio.state === "running") {
          playToneCue(
            audio,
            snap.cue.tone,
            settings.f0Center,
            settings.rangeSemitones,
          );
        }
      }

      if (snap.over && !finished) {
        finished = true;
        running = false;
        clearInterval(hudTimer);
        setFrameSink(null);
        stopMic();
        onOverRef.current(snap);
        return;
      }
      if (running) rafId = requestAnimationFrame(tick);
    };

    let hudTimer = 0;
    const startHud = () => {
      hudTimer = setInterval(() => {
        const snap = run.snapshot();
        setHud(snap);
        setUnheard(
          snap.lastOutcome?.outcome === "unheard" &&
            performance.now() - snap.lastOutcome.atMs < TOAST_MS,
        );
      }, 1000 / HUD_HZ);
    };

    const start = () => {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
      startHud();
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
      clearInterval(hudTimer);
      void getMicSession()?.ctx.suspend();
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(hudTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameSink(null);
    };
  }, [mode, settings]);

  // Show the *active* gate's tone while flying it — showing the next gate's
  // tone mid-gate would teach the wrong contour (this matters most in the
  // tutorial, where the cue text is the lesson).
  const displayTone = hud?.activeGate?.tone ?? hud?.upcoming?.tone ?? null;
  const info = displayTone === null ? null : TONE_INFO[displayTone];

  // Listen → Your turn: "listen" spans the whole cue phase; "your turn" only
  // flashes over the active gate's first stretch, then clears the screen.
  const banner =
    hud?.phase === "listen"
      ? ("listen" as const)
      : hud?.phase === "active" &&
          (hud.activeGate?.t ?? 1) < YOUR_TURN_MAX_T
        ? ("your-turn" as const)
        : null;

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

          {info && displayTone !== null && (
            <div className="hud-syllable">
              <span className="syllable">{info.pinyin}</span>
              <span className="hanzi">{info.hanzi}</span>
              <span className="tone-num">({displayTone})</span>
              {mode === "tutorial" && <span className="cue">{info.cue}</span>}
            </div>
          )}

          {banner === "listen" && (
            <div className="phase-banner listen">🔊 listen…</div>
          )}
          {banner === "your-turn" && (
            <div className="phase-banner your-turn">your turn!</div>
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
            <button
              className="mic-stop"
              onClick={(e) => {
                e.stopPropagation();
                onQuit();
              }}
              title="End the run"
            >
              ■ quit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
