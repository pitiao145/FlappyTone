import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState, PitchTrackerConfig } from "../pitch/types.ts";
import { drawScene, type TrailSample } from "../render/scene.ts";

// Dot dynamics live in dynamics.ts (a pure module) so run.ts can share them
// without pulling canvas code in. Re-exported here for existing importers.
import {
  DRIFT_CHAO_PER_SEC,
  EASE_TAU_MS,
  GRACE_MS,
  REST_CHAO,
  TRAIL_SECONDS,
} from "./dynamics.ts";

export { DRIFT_CHAO_PER_SEC, EASE_TAU_MS, GRACE_MS, REST_CHAO, TRAIL_SECONDS };

// Mutable game state lives here, outside React. React reads it for the dev
// panel readout and mutates tracker config via the exported handles.
interface LoopState {
  tracker: PitchTracker | null;
  latest: PitchState;
  trail: TrailSample[];
  rafId: number;
  /** Where the dot is heading: measured pitch, or centre after grace runs out */
  targetChao: number;
  /** Where the dot is drawn — eased toward targetChao every render frame */
  displayChao: number;
  lastVoicedAt: number;
}

const state: LoopState = {
  tracker: null,
  latest: {
    f0: null,
    clarity: 0,
    rms: 0,
    voiced: false,
    semitones: null,
    chao: null,
    smoothedChao: 3,
  },
  trail: [],
  rafId: 0,
  targetChao: REST_CHAO,
  displayChao: REST_CHAO,
  lastVoicedAt: -Infinity,
};

export function getLatestState(): PitchState {
  return state.latest;
}

export function getTracker(): PitchTracker | null {
  return state.tracker;
}

/**
 * Config applied to the preview tracker when it is (re)built — the player's
 * saved calibration, so the preview dot behaves exactly like the game's.
 * Calling this discards the current tracker so the next frame rebuilds it.
 */
let trackerOverrides: Partial<PitchTrackerConfig> = {};

export function configureTracker(cfg: Partial<PitchTrackerConfig>): void {
  trackerOverrides = cfg;
  state.tracker = null;
  state.trail = [];
  state.targetChao = REST_CHAO;
  state.displayChao = REST_CHAO;
  state.lastVoicedAt = -Infinity;
}

export function handleFrame(frame: Float32Array, sampleRate: number): void {
  if (!state.tracker) {
    state.tracker = new PitchTracker({ ...trackerOverrides, sampleRate });
  }
  state.latest = state.tracker.push(frame);
  // Only voiced frames join the trail — held/unvoiced samples painted a flat
  // grey smear that drowned the actual contour.
  if (state.latest.voiced) {
    state.targetChao = state.latest.smoothedChao;
    state.lastVoicedAt = performance.now();
    state.trail.push({
      chao: state.latest.smoothedChao,
      voiced: true,
      t: performance.now(),
    });
  }
  const cutoff = performance.now() - TRAIL_SECONDS * 1000;
  while (state.trail.length > 0 && state.trail[0].t < cutoff) {
    state.trail.shift();
  }
}

export function startLoop(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  let lastT = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(100, now - lastT);
    lastT = now;

    const inGrace = now - state.lastVoicedAt <= GRACE_MS;
    if (!state.latest.voiced && !inGrace) {
      const step = (DRIFT_CHAO_PER_SEC * dt) / 1000;
      const delta = REST_CHAO - state.targetChao;
      state.targetChao += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
    }
    state.displayChao +=
      (state.targetChao - state.displayChao) * (1 - Math.exp(-dt / EASE_TAU_MS));

    drawScene(ctx, canvas.width, canvas.height, {
      chao: state.displayChao,
      voiced: state.latest.voiced || inGrace,
      trail: state.trail,
      trailSeconds: TRAIL_SECONDS,
    });
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(state.rafId);
}
