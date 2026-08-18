/**
 * The tone visualiser's renderer: a stationary panel where x is
 * time-since-the-utterance-began rather than world position.
 *
 * That is the whole difference from the game's world renderer, and it is the
 * point: with the world held still, two attempts at the same tone land on top
 * of each other and on top of the target, so the *shape* is comparable. Pure
 * function of its scene — see src/game/contours.ts for the data.
 */

import { corridorChaoAt,
  shapeForTone, shapeForWord, type Tone } from "../game/gates.ts";
import type { Contour } from "../game/contours.ts";
import type { Word } from "../game/words.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawDot } from "./scene.ts";
import { rgba } from "./palette.ts";

export interface VisualiserScene {
  /** Target contour ghosted across the panel, or null for free play. */
  tone: Tone | null;
  /**
   * The specific word to trace, or null to fall back to the tone's generic
   * shape. Lets the target match exactly what the game flies for that word
   * rather than the idealised tone-mark corridor.
   */
  word: Word | null;
  /** The utterance in progress. */
  live: Contour | null;
  /** Previous attempts, oldest first — drawn fainter the older they are. */
  finished: readonly Contour[];
  /** Milliseconds spanned by the full canvas width. */
  spanMs: number;
  /** Where the dot sits right now, in chao. */
  chao: number;
  voiced: boolean;
  /**
   * Combined accuracy across every attempt at the current word, or null when
   * no word is selected (free play, or a tone with nothing tapped yet) or no
   * attempt has finished. Resets whenever the word changes — see
   * Visualiser.tsx's `wordStatsRef`.
   */
  accuracy: { value: number; attempts: number } | null;
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

  if (scene.accuracy) drawAccuracy(ctx, width, height, scene.accuracy);
}

/**
 * Combined accuracy for the current word, top-right. Colour tiers reuse the
 * same 85%/60% cut points the game's perfect/good/ok outcomes use, purely as
 * a familiar green/amber/red banding — the number itself is `visualAccuracy`
 * (visualAccuracy.ts), not the game's own `scoreGate`. A small "ACCURACY"
 * label sits above it: without one, a bare "82%" with no axis or units on
 * screen reads as an unexplained number.
 */
function drawAccuracy(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accuracy: { value: number; attempts: number },
): void {
  const pct = Math.round(accuracy.value * 100);
  const token = accuracy.value >= 0.85 ? "good" : accuracy.value >= 0.6 ? "gateOk" : "danger";
  const x = width * (1 - PAD_FRAC);
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  ctx.font = `600 ${Math.round(height * 0.014)}px system-ui, sans-serif`;
  ctx.fillStyle = rgba("grid", 0.75);
  ctx.fillText("ACCURACY", x, height * 0.02);

  ctx.font = `700 ${Math.round(height * 0.034)}px system-ui, sans-serif`;
  ctx.fillStyle = rgba(token, 0.92);
  ctx.fillText(`${pct}%`, x, height * 0.02 + height * 0.024);

  ctx.font = `${Math.round(height * 0.016)}px system-ui, sans-serif`;
  ctx.fillStyle = rgba("grid", 0.8);
  ctx.fillText(
    accuracy.attempts === 1 ? "1 try" : `${accuracy.attempts} tries`,
    x,
    height * 0.02 + height * 0.024 + height * 0.04,
  );
  ctx.restore();
}

/**
 * The target contour, dashed — guidance, not an obstacle. Drawn on the same
 * time axis as the player's own trace (real milliseconds, not a 0-1 fraction
 * of the panel), so it moves at the recording's actual pace instead of being
 * stretched across the whole `spanMs` window.
 *
 * Stops exactly at the shape's own duration and draws nothing after — it
 * does not hold a flat line out to fill the rest of the panel. That matches
 * the live game exactly: a gate's on-screen width is `scrollSpeed *
 * shape.durationS` (see `widthPx` in `gates.ts`'s `makeGate`), so the
 * corridor a player is actually scored against never extends past the clip's
 * own length either. An earlier version of this held the final chao out to
 * `spanMs`, which asked the player to sustain the last note for no reason —
 * `spanMs` only exists so multiple attempts share one panel width, it isn't
 * part of the tone.
 */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: VisualiserScene,
): void {
  const tone = scene.tone;
  if (tone === null) return;
  const shape = scene.word ? shapeForWord(scene.word) : shapeForTone(tone);
  const durationMs = shape.durationS * 1000;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = rgba("demo", 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= TARGET_STEPS; i++) {
    const shapeT = i / TARGET_STEPS;
    const x = xFor(shapeT * durationMs, scene.spanMs, width);
    const y = chaoToY(corridorChaoAt(shape, shapeT), height);
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
  ctx.strokeStyle = rgba("accent", alpha);
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
