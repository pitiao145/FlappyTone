/**
 * The tone visualiser's renderer: a stationary panel where x is
 * time-since-the-utterance-began rather than world position.
 *
 * That is the whole difference from the game's world renderer, and it is the
 * point: with the world held still, two attempts at the same tone land on top
 * of each other and on top of the target, so the *shape* is comparable. Pure
 * function of its scene — see src/game/contours.ts for the data.
 *
 * The accuracy readout is a DOM element now (Visualiser.tsx's `.vis-accuracy`),
 * not drawn here — it lives in a real right-hand column alongside the canvas,
 * not overlaid on top of it, so it has no place in this draw path.
 */

import {
  applyCorridorWidth,
  corridorChaoAt,
  corridorToleranceAt,
  newDifficulty,
  shapeForTone,
  shapeForWord,
  toleranceChao,
  type CorridorWidth,
  type GateShape,
  type Tone,
} from "../game/gates.ts";
import type { Contour, TrailPoint } from "../game/contours.ts";
import { BRIDGE_MS } from "../game/visualiserCore.ts";
import { birdXFrac } from "../game/run.ts";
import type { Word } from "../game/words.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawPip } from "./scene.ts";
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
   * Free tab only: one line instead of stacked attempts. The bird starts at
   * the game's `birdXFrac`, moves right as you speak, then holds at
   * `SCROLL_HEAD_FRAC` while the line scrolls left behind it. Times are on
   * `PitchTrail`'s clock, which stops in silence — so does the scroll.
   */
  scroll?: { points: readonly TrailPoint[]; nowMs: number; originMs: number | null } | null;
  /**
   * With `scroll`: also draw the target (`tone`/`word`) as a fixed guide,
   * starting at the bird's rest point on the scroll's own time scale, so a
   * first attempt traces over it. The public tone visualizer sets it; the
   * app's Free tab does not.
   */
  scrollGuide?: boolean;
  /**
   * The player's corridor width setting, so the target band is as wide as
   * the corridor a run's first gate would be. Absent = "normal".
   */
  corridor?: CorridorWidth;
  /**
   * Draw the band behind the target line. Absent = shown (the public tone
   * visualizer has no toggle); the app's Visualiser passes the player's choice.
   */
  band?: boolean;
  /**
   * Dev only (brief 47, `ft.stretchPairs`): draw each finished attempt
   * stretched in time so it ends where the target ends. Drawing only; the
   * scoring never sees it. Set by Visualiser.tsx behind `import.meta.env.DEV`.
   */
  stretchToTarget?: boolean;
}

/** Samples used to trace the target contour. */
const TARGET_STEPS = 48;
/**
 * Points further apart in time than this are separate phonation and must not
 * be joined — the same honesty rule the game's trail follows. Only voiced
 * frames enter a contour, so a gap is missing data, not quiet data.
 */
const BREAK_MS = 70;


/** Where the bird sits on the scrolling trace, as a fraction of the width. */
const SCROLL_HEAD_FRAC = 0.72;

/** Right margin, so the trace doesn't run flush to the edge. */
const END_PAD_FRAC = 0.04;

/**
 * t=0's x position — the same `birdXFrac` fraction of the width the game's
 * own bird rests at (`src/game/tuning.ts`'s `birdXFrac`, read live via
 * `birdXFrac()` so a Lab tweak is reflected here too). Before this matched,
 * an idle dot (no live utterance, `xFor(0, ...)`) sat at a hardcoded 4% from
 * the left — visibly further left than where the game's bird actually
 * lives, reported as "stuck on the left side".
 */
function xFor(tMs: number, spanMs: number, width: number): number {
  const startFrac = birdXFrac();
  const usable = width * (1 - END_PAD_FRAC - startFrac);
  return width * startFrac + (Math.min(tMs, spanMs) / spanMs) * usable;
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

  if (scene.scroll) {
    const { points, nowMs, originMs } = scene.scroll;
    const pxPerMs = (width * SCROLL_HEAD_FRAC) / scene.spanMs;
    const startX = width * birdXFrac();
    const headX = originMs === null
      ? startX
      : Math.min(width * SCROLL_HEAD_FRAC, startX + (nowMs - originMs) * pxPerMs);
    if (scene.scrollGuide && scene.tone !== null) {
      drawTarget(ctx, height, scene, (tMs) => startX + tMs * pxPerMs);
    }
    drawScrolling(ctx, height, points, nowMs, pxPerMs, headX);
    drawPip(ctx, height, scene.chao, headX, 0, "flying", scene.voiced, performance.now(), Infinity, true, width);
    return;
  }

  if (scene.tone !== null) drawTarget(ctx, height, scene, (tMs) => xFor(tMs, scene.spanMs, width));

  // Older attempts recede; the newest finished one is the one worth comparing.
  const stretchMs =
    scene.stretchToTarget && scene.tone !== null ? targetShape(scene).durationS * 1000 : null;
  scene.finished.forEach((c, i) => {
    const age = scene.finished.length - i;
    const drawn = stretchMs !== null ? stretchContour(c, stretchMs) : c;
    drawContour(ctx, width, height, drawn, scene.spanMs, 0.42 / age, 2);
  });

  if (scene.live) {
    drawContour(ctx, width, height, scene.live, scene.spanMs, 0.95, 3.5);
  }

  const head = scene.live?.points.at(-1);
  const dotX = head
    ? xFor(head.tMs, scene.spanMs, width)
    : xFor(0, scene.spanMs, width);
  // Pass canvas width so drawPip picks the mobile height fraction below 720px.
  drawPip(ctx, height, scene.chao, dotX, 0, "flying", scene.voiced, performance.now(), Infinity, true, width);
}

/**
 * The target: a soft band as wide as the game's corridor (brief 47), with the
 * contour dashed inside it — guidance, not an obstacle. Drawn on the same
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
  height: number,
  scene: VisualiserScene,
  /** Where a time on the shape's own clock lands on the canvas. */
  xAt: (tMs: number) => number,
): void {
  const tone = scene.tone;
  if (tone === null) return;
  const shape = targetShape(scene);
  const { tolChao, widenScale } = visualiserTolerance(scene.word ? scene.word.tones : [tone], scene.corridor);
  const band = targetBand(shape, tolChao, widenScale);
  const durationMs = shape.durationS * 1000;
  ctx.save();
  if (scene.band !== false) drawBand(ctx, height, band, durationMs, xAt);
  // The centre line, dashed — guidance, not an obstacle.
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = rgba("demo", 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  band.forEach((b, i) => {
    const x = xAt(b.t * durationMs);
    const y = chaoToY(b.centre, height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * The band: the corridor a run would fly for this word, same width and the
 * same widening on the slopes (`corridorToleranceAt`). "Inside" here means
 * what it means in the game.
 */
function drawBand(
  ctx: CanvasRenderingContext2D,
  height: number,
  band: readonly BandSample[],
  durationMs: number,
  xAt: (tMs: number) => number,
): void {
  ctx.fillStyle = rgba("demo", 0.16);
  ctx.beginPath();
  band.forEach((b, i) => {
    const x = xAt(b.t * durationMs);
    const y = chaoToY(b.centre + b.half, height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = band.length - 1; i >= 0; i--) {
    const b = band[i];
    ctx.lineTo(xAt(b.t * durationMs), chaoToY(b.centre - b.half, height));
  }
  ctx.closePath();
  ctx.fill();
}

function targetShape(scene: VisualiserScene): GateShape {
  return scene.word ? shapeForWord(scene.word) : shapeForTone(scene.tone ?? 1);
}

/**
 * The tolerance a run's first gate gets for these tones: base difficulty (no
 * ramp yet), the player's corridor width, the per-tone factor. The same three
 * steps `Run` takes (`newDifficulty` → `applyCorridorWidth` → `makeGate`'s
 * `toleranceChao`), so the band cannot drift from the game's corridor.
 */
export function visualiserTolerance(
  tones: (Tone | 0)[],
  corridor: CorridorWidth = "normal",
): { tolChao: number; widenScale: number } {
  const d = applyCorridorWidth(newDifficulty(), corridor);
  return { tolChao: toleranceChao(tones, d.toleranceH), widenScale: d.widenScale ?? 1 };
}

export interface BandSample {
  /** 0–1 on the shape's own clock. */
  t: number;
  centre: number;
  /** Half-width in chao: `corridorToleranceAt` at this t. */
  half: number;
}

/** The target band, sampled: centre line and half-width, as the game draws its corridor. */
export function targetBand(
  shape: GateShape,
  tolChao: number,
  widenScale = 1,
  steps = TARGET_STEPS,
): BandSample[] {
  const out: BandSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      t,
      centre: corridorChaoAt(shape, t),
      half: corridorToleranceAt(shape, t, tolChao, widenScale),
    });
  }
  return out;
}

/**
 * Dev only: the attempt rescaled in time so its last point lands at
 * `targetMs`. Returns the contour unchanged when it has under two points.
 */
export function stretchContour(contour: Contour, targetMs: number): Contour {
  const pts = contour.points;
  if (pts.length < 2) return contour;
  const t0 = pts[0].tMs;
  const len = pts[pts.length - 1].tMs - t0;
  if (len <= 0) return contour;
  const k = targetMs / len;
  return { ...contour, points: pts.map((p) => ({ ...p, tMs: (p.tMs - t0) * k })) };
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
  // Short silences inside the attempt get a faint dashed bridge, as in Free
  // mode; collected here and stroked after the solid line.
  const bridges: [number, number, number, number][] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < pts.length; i++) {
    const x = xFor(pts[i].tMs, spanMs, width);
    const y = chaoToY(pts[i].chao, height);
    const gap = i > 0 ? pts[i].tMs - pts[i - 1].tMs : 0;
    if (i === 0 || gap > BREAK_MS) {
      if (i > 0 && gap <= BRIDGE_MS) bridges.push([px, py, x, y]);
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    px = x;
    py = y;
  }
  ctx.stroke();
  if (bridges.length > 0) {
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = rgba("accent", alpha * 0.4);
    ctx.lineWidth = Math.max(1, lineWidth * 0.55);
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of bridges) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export type ScrollSegment = { kind: "voice" | "bridge"; points: { x: number; y: number }[] };

/**
 * Splits the trail into what to stroke: solid runs of voice, dashed bridges
 * over short silences, nothing over long ones. Pure, so it is testable
 * without a canvas. x moves left `pxPerMs` per ms of age on the trail clock.
 */
export function scrollSegments(
  points: readonly TrailPoint[],
  nowMs: number,
  pxPerMs: number,
  headX: number,
  height: number,
): ScrollSegment[] {
  const segs: ScrollSegment[] = [];
  let run: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = { x: headX - (nowMs - points[i].atMs) * pxPerMs, y: chaoToY(points[i].chao, height) };
    const gap = i > 0 ? points[i].atMs - points[i - 1].atMs : 0;
    if (i > 0 && gap > BREAK_MS) {
      if (run.length > 1) segs.push({ kind: "voice", points: run });
      if (gap <= BRIDGE_MS) segs.push({ kind: "bridge", points: [run[run.length - 1], p] });
      run = [];
    }
    run.push(p);
  }
  if (run.length > 1) segs.push({ kind: "voice", points: run });
  return segs;
}

function drawScrolling(
  ctx: CanvasRenderingContext2D,
  height: number,
  points: readonly TrailPoint[],
  nowMs: number,
  pxPerMs: number,
  headX: number,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const seg of scrollSegments(points, nowMs, pxPerMs, headX, height)) {
    if (seg.kind === "bridge") {
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = rgba("accent", 0.35);
      ctx.lineWidth = 2;
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba("accent", 0.95);
      ctx.lineWidth = 3.5;
    }
    ctx.beginPath();
    seg.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}
