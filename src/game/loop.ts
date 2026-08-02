import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { drawScene, type TrailSample } from "../render/scene.ts";

const TRAIL_SECONDS = 1.5;

// Mutable game state lives here, outside React. React reads it for the dev
// panel readout and mutates tracker config via the exported handles.
interface LoopState {
  tracker: PitchTracker | null;
  latest: PitchState;
  trail: TrailSample[];
  rafId: number;
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

  const tick = () => {
    drawScene(ctx, canvas.width, canvas.height, state.latest, state.trail, TRAIL_SECONDS);
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(state.rafId);
}
