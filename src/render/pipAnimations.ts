/**
 * Standalone Pip animations for UI chrome (loading states and the like) — pure
 * per-frame canvas draw functions, no React, no game state. Each takes the 2D
 * context, the (square) CSS-pixel canvas edge, and a time `t` in ms, and draws
 * one frame of the bird. The React side (`src/ui/bird/PipCanvas.tsx`) owns the
 * canvas, the DPR transform, the clear, and the rAF loop; these just draw.
 *
 * They reuse `drawPip` from `scene.ts`, so the bird here is byte-for-byte the
 * one the game flies — add a new animation by adding a function here and a thin
 * wrapper component beside `SpinningPip`.
 */
import { chaoToY, drawPip, pipBodyCenterOffset, pipHeightFrac } from "./scene.ts";

/** Body radius as a fraction of the canvas edge; leaves room for the spin arc. */
export const PIP_R_FRAC = 0.2;
/** One full spin, in ms — "quite fast". */
export const PIP_SPIN_MS = 850;
/** One excited hop, in ms — a quick spring up and fall back. */
export const PIP_HOP_MS = 560;
/** Hop height as a fraction of the canvas edge. */
export const PIP_HOP_FRAC = 0.16;

/** The drawPip `height` that sizes the body to `frac` of a `size`-px canvas. */
function pipHeightFor(size: number, frac = PIP_R_FRAC): number {
  return (size * frac) / pipHeightFrac(size);
}

/**
 * The Pip spinning about its own body centre.
 *
 * `drawPip`'s `angle` pivots about the beak-tip anchor, so to spin about the
 * body we pivot at the canvas centre, rotate, then shift the beak tip back by
 * `pipBodyCenterOffset` (and cancel drawPip's own chao→y translate). Only the
 * beak tip orbits; the body stays put. See `pipBodyCenterOffset`.
 */
export function drawSpinningPip(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
): void {
  const height = pipHeightFor(size);
  const bodyOffset = pipBodyCenterOffset(height, size);
  const centre = size / 2;
  const angle = ((t % PIP_SPIN_MS) / PIP_SPIN_MS) * Math.PI * 2;

  ctx.save();
  ctx.translate(centre, centre);
  ctx.rotate(angle);
  ctx.translate(-bodyOffset, -chaoToY(3, height));
  drawPip(ctx, height, 3, 0, 0, "flying", true, t, Infinity, false, size);
  ctx.restore();
}

/**
 * The Pip hopping up and down, excited — a celebratory idle for the tutorial's
 * success screen.
 *
 * A parabolic hop (`4f(1-f)`, peaking at mid-cycle) lifts the body up and eases
 * it back down each `PIP_HOP_MS`. The "success" state re-fires drawPip's green
 * ring and scale-pop once per hop (`stateAgeMs` reset each cycle), so every
 * bounce bursts a little. Same pivot maths as `drawSpinningPip` minus the
 * rotation: pivot at the canvas centre, cancel drawPip's own chao→y translate,
 * then shift the beak tip back by `pipBodyCenterOffset` so the body stays put.
 */
export function drawJumpingPip(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
): void {
  const height = pipHeightFor(size);
  const bodyOffset = pipBodyCenterOffset(height, size);
  const centre = size / 2;

  const cycleMs = t % PIP_HOP_MS;
  const f = cycleMs / PIP_HOP_MS;
  const hop = 4 * f * (1 - f); // 0 at the ground, 1 at the apex
  const lift = hop * PIP_HOP_FRAC * size;

  ctx.save();
  ctx.translate(centre, centre - lift);
  ctx.translate(-bodyOffset, -chaoToY(3, height));
  drawPip(ctx, height, 3, 0, 0, "success", true, t, cycleMs, false, size);
  ctx.restore();
}
