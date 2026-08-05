import { useEffect, useRef, useState } from "react";
import {
  cueDurationMsFor,
  isCueAudible,
  loadReferenceClips,
  playToneCue,
} from "../audio/reference.ts";
import { getMicSession, setFrameSink, stopMic } from "../audio/session.ts";
import { GATE_LOG_ENABLED, saveGateLog } from "../dev/gateLog.ts";
import { TONE_INFO } from "../game/gates.ts";
import { Run, type RunMode, type RunSnapshot } from "../game/run.ts";
import type { GateOutcome, UnheardHint } from "../game/scoring.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadPace,
  type CalibrationSettings,
} from "../game/settings.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawWorld } from "../render/world.ts";

/** HUD refresh rate. React never renders per frame — the rAF loop owns the canvas. */
const HUD_HZ = 4;
/** "Your turn" flashes while the active gate is in its first stretch. */
const YOUR_TURN_MAX_T = 0.5;
/** How long the "couldn't hear that" toast stays up. */
const TOAST_MS = 1200;

/** What the HUD reacts to when a gate resolves. */
interface OutcomeFlash {
  outcome: GateOutcome;
  points: number;
  hint: UnheardHint | null;
  /** Resolve time, used as a React key so repeats re-trigger the animation. */
  atMs: number;
}

/**
 * The hint shown when a gate goes unheard.
 *
 * PRD §6: this is the path where the app says it is unsure rather than scoring
 * the player wrong, and it must never read as a punishment. Saying *what* was
 * unclear turns the one moment of doubt into the one moment that teaches.
 */
const HINT_TEXT: Record<UnheardHint, string> = {
  louder: "say it a bit louder",
  longer: "hold it a little longer",
  generic: "didn't catch that",
};

/** Only the last few gates fit on screen; the full log lives on the end screen. */
const GATE_LOG_ON_SCREEN = 4;

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
  /**
   * The last resolved gate, pushed once when it resolves rather than polled.
   *
   * The HUD samples at HUD_HZ (4), which is fine for score and hearts but
   * would land a reaction up to 250ms after the thing it is reacting to. This
   * fires from the rAF loop instead — once per gate, so it is still an event,
   * not a per-frame render.
   */
  const [flash, setFlash] = useState<OutcomeFlash | null>(null);
  const onOverRef = useRef(onOver);
  useEffect(() => {
    onOverRef.current = onOver;
  });

  // Retire the reaction on a timer rather than by comparing clocks during
  // render — render must stay pure, and the CSS animations own the timing
  // anyway. A new gate replaces `flash`, which restarts this.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Logical drawing space stays canvasWidth x canvasHeight; only the backing
    // store is density-scaled, so gameplay geometry is unchanged.
    const ctx2d = canvas ? scaleForDpr(canvas, canvasWidth, canvasHeight) : null;
    if (!canvas || !ctx2d) return;

    // Game remounts per run, so this picks up the latest saved pace.
    const run = new Run({
      mode,
      width: canvasWidth,
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
    /** Resolve time of the gate the HUD has already reacted to. */
    let lastFlashedAtMs = -Infinity;

    // The mic is already open — Title opened it inside the click gesture.
    setFrameSink((frame, sampleRate) => {
      // Deaf while the game itself is talking — the cue would drive the dot.
      if (isCueAudible()) return;
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
      drawWorld(ctx2d, canvasWidth, canvasHeight, snap);

      // One setState per resolved gate, not per frame — the rAF loop stays
      // the owner of the canvas, React just hears about outcomes.
      const resolved = snap.lastOutcome;
      if (resolved && resolved.atMs !== lastFlashedAtMs) {
        lastFlashedAtMs = resolved.atMs;
        // Sync the numbers on the same beat. Otherwise the heart that just
        // broke is still counted by the polled HUD for up to 250ms, and the
        // score lands visibly after the gate that earned it.
        setHud(snap);
        setFlash({
          outcome: resolved.outcome,
          points: resolved.points,
          hint: resolved.hint,
          atMs: resolved.atMs,
        });
      }

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
        saveGateLog(snap.gateLog, snap.missedUtterances);
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
        // Mirrored every tick, not just at game over, so quitting mid-run or
        // closing the tab still leaves the numbers behind.
        saveGateLog(snap.gateLog, snap.missedUtterances);
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
  }, [mode, settings, canvasWidth, canvasHeight]);

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

  const showPoints = flash !== null && flash.points > 0;
  const showHint = flash?.outcome === "unheard";
  const breaking = flash?.outcome === "collision";
  const hearts = Math.max(0, hud?.hearts ?? 3);

  return (
    <div className="screen game-screen">
      <div className="stage">
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />

        <div className="hud">
          <div className="hud-top">
            <span className="score">
              {hud?.score ?? 0}
              {showPoints && (
                <span key={flash!.atMs} className="points-pop">
                  +{flash!.points}
                </span>
              )}
            </span>
            {mode === "game" && (
              <span className="hearts">
                {Array.from({ length: hearts }, (_, i) => (
                  <span key={i} className="heart">
                    ♥
                  </span>
                ))}
                {/* The heart just lost, shown mid-break then gone. Without it
                    a collision simply removed a glyph, which read as nothing. */}
                {breaking && (
                  <span key={flash!.atMs} className="heart breaking">
                    ♥
                  </span>
                )}
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

          {showHint && (
            <div key={flash!.atMs} className="toast unheard-toast">
              {HINT_TEXT[flash!.hint ?? "generic"]}
            </div>
          )}
          {hud?.noisy && <div className="hint">it's noisy in here</div>}

          {GATE_LOG_ENABLED && hud && (
            <div className="gate-log">
              <div>
                unheard{" "}
                {hud.gateLog.filter((g) => g.outcome === "unheard").length}/
                {hud.gateLog.length} · missed early {hud.missedUtterances}
              </div>
              {hud.gateLog
                .slice(-GATE_LOG_ON_SCREEN)
                .reverse()
                .map((g) => (
                  <div key={g.atMs}>
                    T{g.tone} {g.outcome} · {g.voiced}/{g.samples} (
                    {Math.round(g.voicedFraction * 100)}%) ·{" "}
                    {Math.round(g.utteranceMs)}ms
                    {g.seeded > 0 ? ` · +${g.seeded} early` : ""}
                  </div>
                ))}
            </div>
          )}
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
