/**
 * Brief 47 step 3, dev only: how evenly do mic frames reach the Visualiser?
 *
 * The Visualiser stamps each frame with `performance.now()` when the
 * worklet's message arrives. Frames are made every hop (1024 samples,
 * 21.3 ms at 48 kHz) but the main thread may receive them late or in bursts.
 * This records the gap between arrivals so we can see if that is real.
 *
 * In the dev console after ~30 s of the Visualiser open (speaking or not):
 *   __frameGaps.report()   // prints and returns the numbers
 *   __frameGaps.reset()
 *
 * Imported by Visualiser.tsx and called only behind `import.meta.env.DEV`,
 * so it stays out of `dist/` (hard rule 7).
 */

const HOP_SAMPLES = 1024;
/** A gap further than this from the hop time counts as "off". */
const OFF_MS = 10;
/** Brief 47's rule: over this share of gaps off → stamp by counted audio time. */
const OFF_SHARE_LIMIT = 0.05;
const MAX_GAPS = 20000;

export interface FrameGapReport {
  frames: number;
  hopMs: number;
  medianGapMs: number;
  p95GapMs: number;
  maxGapMs: number;
  /** Share of gaps more than 10 ms from the hop time. */
  offShare: number;
  /** Arrival clock minus counted audio clock at the last frame, ms. */
  driftMs: number;
  useCountedTime: boolean;
}

const gaps: number[] = [];
let last: number | null = null;
let first: number | null = null;
let frames = 0;
let hopMs = 0;

let installed = false;

/** Puts `__frameGaps` on window. Lazy, not top-level: no side effect on import. */
function install(): void {
  installed = true;
  if (typeof window === "undefined") return;
  (window as unknown as { __frameGaps?: unknown }).__frameGaps = {
    report: () => {
      const rep = frameGapReport();
      console.table(rep);
      return rep;
    },
    reset: resetFrameGaps,
  };
}

export function logFrameGap(nowMs: number, sampleRate: number): void {
  if (!installed) install();
  hopMs = (HOP_SAMPLES / sampleRate) * 1000;
  if (first === null) first = nowMs;
  if (last !== null && gaps.length < MAX_GAPS) gaps.push(nowMs - last);
  last = nowMs;
  frames += 1;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function frameGapReport(): FrameGapReport {
  const sorted = [...gaps].sort((a, b) => a - b);
  const off = gaps.filter((g) => Math.abs(g - hopMs) > OFF_MS).length;
  const offShare = gaps.length ? off / gaps.length : 0;
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    frames,
    hopMs: r(hopMs),
    medianGapMs: r(pct(sorted, 0.5)),
    p95GapMs: r(pct(sorted, 0.95)),
    maxGapMs: r(sorted.at(-1) ?? 0),
    offShare: Math.round(offShare * 1000) / 1000,
    driftMs: first !== null && last !== null ? r(last - first - (frames - 1) * hopMs) : 0,
    useCountedTime: offShare > OFF_SHARE_LIMIT,
  };
}

export function resetFrameGaps(): void {
  gaps.length = 0;
  last = null;
  first = null;
  frames = 0;
}
