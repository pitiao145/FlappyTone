/**
 * The tone visualiser's renderer: a stationary panel where x is
 * time-since-the-utterance-began rather than world position.
 *
 * That is the whole difference from the game's world renderer, and it is the
 * point: with the world held still, two attempts at the same tone land on top
 * of each other and on top of the target, so the *shape* is comparable. Pure
 * function of its scene — see src/game/contours.ts for the data.
 */

import { corridorChaoAt, type Tone } from "../game/gates.ts";
import type { Contour } from "../game/contours.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawDot } from "./scene.ts";

export interface VisualiserScene {
  /** Target contour ghosted across the panel, or null for free play. */
  tone: Tone | null;
  /** The utterance in progress. */
  live: Contour | null;
  /** Previous attempts, oldest first — drawn fainter the older they are. */
  finished: readonly Contour[];
  /** Milliseconds spanned by the full canvas width. */
  spanMs: number;
  /** Where the dot sits right now, in chao. */
  chao: number;
  voiced: boolean;
}

/** Samples used to trace the target contour. */
const TARGET_STEPS = 48;
/**
 * Points further apart in time than this are separate phonation and must not
 * be joined — the same honesty rule the game's trail follows. Only voiced
 * frames enter a contour, so a gap is missing data, not quiet data.
 */
const BREAK_MS = 70;

/** Left margin, so t=0 is not flush against the edge. */
const PAD_FRAC = 0.04;

function xFor(tMs: number, spanMs: number, width: number): number {
  const usable = width * (1 - 2 * PAD_FRAC);
  return width * PAD_FRAC + (Math.min(tMs, spanMs) / spanMs) * usable;
}

export function drawVisualiser(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: VisualiserScene,
): void {
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);
  drawChaoGrid(ctx, width, height);

  if (scene.tone !== null) drawTarget(ctx, width, height, scene);

  // Older attempts recede; the newest finished one is the one worth comparing.
  scene.finished.forEach((c, i) => {
    const age = scene.finished.length - i;
    drawContour(ctx, width, height, c, scene.spanMs, 0.42 / age, 2);
  });

  if (scene.live) {
    drawContour(ctx, width, height, scene.live, scene.spanMs, 0.95, 3.5);
  }

  const head = scene.live?.points.at(-1);
  const dotX = head
    ? xFor(head.tMs, scene.spanMs, width)
    : xFor(0, scene.spanMs, width);
  drawDot(ctx, width, height, scene.chao, dotX, scene.voiced, performance.now());
}

/**
 * The target contour, dashed — guidance, not an obstacle. Drawn over the same
 * span as the player's own trace so the two are directly comparable.
 */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: VisualiserScene,
): void {
  const tone = scene.tone;
  if (tone === null) return;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "rgba(235, 208, 170, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= TARGET_STEPS; i++) {
    const p = i / TARGET_STEPS;
    const x = xFor(p * scene.spanMs, scene.spanMs, width);
    const y = chaoToY(corridorChaoAt(tone, p), height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** One contour, stroked as-measured. Never smoothed into a shape it wasn't. */
function drawContour(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  contour: Contour,
  spanMs: number,
  alpha: number,
  lineWidth: number,
): void {
  const pts = contour.points;
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = `rgba(96, 205, 255, ${alpha})`;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let penDown = false;
  for (let i = 0; i < pts.length; i++) {
    const x = xFor(pts[i].tMs, spanMs, width);
    const y = chaoToY(pts[i].chao, height);
    const broken = i > 0 && pts[i].tMs - pts[i - 1].tMs > BREAK_MS;
    if (!penDown || broken) {
      ctx.moveTo(x, y);
      penDown = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}
