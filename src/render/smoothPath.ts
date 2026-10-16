export interface Pt {
  x: number;
  y: number;
}

/**
 * Appends a smoothed run of points to the current path — quadratics through
 * segment midpoints, each sample its own control point.
 *
 * The drawn wall must stay the wall the player hits, and it does: the curve
 * departs from the sampled polyline by at most half a segment, which at
 * world.ts's CORRIDOR_SAMPLE_PX is about one pixel. What it removes is the
 * faceting and the miter spikes at the polyline's corners, not the shape.
 *
 * Does not call beginPath or moveTo — the caller owns the path, because these
 * runs are stitched into closed wall polygons. Shared by every theme's walls
 * so the painted edge is the same curve in all of them.
 */
export function appendSmooth(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  if (pts.length === 0) return;
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(
      pts[i].x,
      pts[i].y,
      (pts[i].x + pts[i + 1].x) / 2,
      (pts[i].y + pts[i + 1].y) / 2,
    );
  }
  const last = pts[pts.length - 1];
  ctx.quadraticCurveTo(last.x, last.y, last.x, last.y);
}

/** The closed top-wall polygon: screen top, along the edge, back up. */
export function topWallPath(ctx: CanvasRenderingContext2D, top: readonly Pt[], x0: number, x1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  appendSmooth(ctx, top);
  ctx.lineTo(x1, 0);
  ctx.closePath();
}

/** The closed bottom-wall polygon: screen bottom, along the edge, back down. */
export function bottomWallPath(
  ctx: CanvasRenderingContext2D,
  bottom: readonly Pt[],
  x0: number,
  x1: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x0, height);
  appendSmooth(ctx, bottom);
  ctx.lineTo(x1, height);
  ctx.closePath();
}
