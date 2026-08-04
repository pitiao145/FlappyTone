/**
 * Canvas backing-store sizing. The one place in render/ that touches the DOM;
 * everything else here is a pure function of game state.
 *
 * The game draws in a fixed 420x747 logical space (see App.tsx) and CSS
 * stretches the element to the container. Without a density-scaled backing
 * store the browser upscales that bitmap, which is exactly the wrong look for
 * a portrait phone game (PRD §4) — soft text, soft grid lines, soft trail.
 */

/**
 * Above this the extra pixels stop being visible and only cost fill rate.
 * iPhones report 3; some Android devices report more.
 */
export const MAX_DPR = 3;

export interface BackingSize {
  width: number;
  height: number;
  dpr: number;
}

/** Device-pixel dimensions for a canvas drawn in `cssW` x `cssH` logical px. */
export function backingSize(cssW: number, cssH: number, dpr: number): BackingSize {
  const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, MAX_DPR) : 1;
  return {
    width: Math.round(cssW * scale),
    height: Math.round(cssH * scale),
    dpr: scale,
  };
}

/**
 * Point a 2D context at a density-scaled backing store, then scale the context
 * so all drawing code keeps working in logical pixels. Safe to call per frame:
 * it only resizes when the density actually changed, but always reapplies the
 * transform, since assigning canvas.width resets context state.
 */
export function scaleForDpr(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height, dpr } = backingSize(
    cssW,
    cssH,
    typeof window === "undefined" ? 1 : window.devicePixelRatio,
  );
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
