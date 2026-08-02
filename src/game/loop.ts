import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { drawScene, type TrailSample } from "../render/scene.ts";

const TRAIL_SECONDS = 1.5;
// PRD §5.3: hold the last position for 120ms of unvoiced (stop consonants,
// dropouts), then drift toward the centre line at 0.8 screen-heights/sec.
// Chao 1–5 spans 0.6H, so 0.8H/s = 0.8/0.6 * 4 ≈ 5.33 chao/s.
const GRACE_MS = 120;
const DRIFT_CHAO_PER_SEC = 5.33;
const REST_CHAO = 3;
// Render easing time constant: the drawn dot closes ~63% of the gap to the
// measured value in this many ms. Visual only — never touches scoring data.
const EASE_TAU_MS = 45;

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

export function handleFrame(frame: Float32Array, sampleRate: number): void {
  if (!state.tracker) {
    state.tracker = new PitchTracker({ sampleRate });
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
