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
