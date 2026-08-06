import { rgba, rgbTuple, solid } from "./palette.ts";

/** The accent mixed `amount` of the way toward `toward` (255 = white, 0 = black). */
function mixAccent(amount: number, toward: number): string {
  return rgbTuple("accent")
    .map((c) => Math.round(c + (toward - c) * amount))
    .join(", ");
}

export interface TrailSample {
  chao: number;
  voiced: boolean;
  t: number;
  /**
   * Screen x, when the caller knows it. The game supplies this from world
   * space so the trace lines up with the corridor it was flown through; the
   * calibration preview has no world and lets it fall back to age-based
   * spacing.
   */
  x?: number;
  /** Distance off the corridor centre in units of tolerance; null outside a gate. */
  errRatio?: number | null;
}

export interface SceneSnapshot {
  /** Eased display position of the dot, in chao units */
  chao: number;
  /** Voiced, or within the unvoiced grace period — controls dot fill */
  voiced: boolean;
  trail: readonly TrailSample[];
  trailSeconds: number;
}

// PRD §5.1: y(chao) = 0.80H - ((chao - 1) / 4) * 0.60H
export function chaoToY(chao: number, height: number): number {
  return 0.8 * height - ((chao - 1) / 4) * 0.6 * height;
}

/** The scene's darkest value. Walls are cut from this — see world.ts. */
export const BACKDROP = solid("backdrop");

/**
 * Faint Chao 1–5 guide lines, with axis labels.
 *
 * These sit *behind* everything and must stay there. They were previously
 * drawn at 0.12 white, brighter than an approaching corridor wall (0.04) and
 * near-equal to an active one (0.10) — so the reference grid and the obstacle
 * read at the same value and neither one resolved. Guides recede; walls do not.
 */
export function drawChaoGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.font = `${Math.round(height * 0.02)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (let chao = 1; chao <= 5; chao++) {
    const y = chaoToY(chao, height);
    // Chao 3 is the rest line the dot returns to — the one guide worth reading.
    const isRest = chao === 3;
    ctx.strokeStyle = isRest
      ? rgba("grid", 0.13)
      : rgba("grid", 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = rgba("grid", isRest ? 0.3 : 0.18);
    ctx.fillText(String(chao), 8, y);
  }
}

/** Ribbon thickness at the dot, and at the far end of its life. */
const TRAIL_WIDTH_FRAC = 0.019;
const TRAIL_TAIL_WIDTH_FRAC = 0.004;
/**
 * Samples further apart than this in time are separate utterances and must not
 * be joined.
 *
 * Only voiced frames enter the trail, so a silence leaves a hole in the data
 * rather than a run of quiet samples. Drawing straight through one would
 * invent a pitch path the player never produced — the ribbon has to break.
 * Roughly three analysis hops (~23ms each).
 */
const TRAIL_BREAK_MS = 70;

interface Point {
  x: number;
  y: number;
  /** 0 at the oldest end of the trail's life, 1 at the dot. */
  freshness: number;
  errRatio: number | null;
}

/**
 * Lay down a smoothed path through `pts` without stroking it — quadratics
 * through segment midpoints, with each sample as its own control point.
 *
 * Shared so the ignition of a cleared gate traces the same curve the live
 * trail drew. Stroking the raw polyline there instead would make the
 * celebration a visibly different shape from the thing being celebrated.
 */
export function traceSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) return;
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = {
      x: (pts[i].x + pts[i + 1].x) / 2,
      y: (pts[i].y + pts[i + 1].y) / 2,
    };
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
  }
  const last = pts[pts.length - 1];
  ctx.quadraticCurveTo(last.x, last.y, last.x, last.y);
}

/**
 * The player's trail, drawn as a tapered ribbon: newest at `dotX`, older
 * samples drifting left and thinning as they fade.
 *
 * PRD §8 calls this the one visual that matters — it is the player's own pitch
 * contour drawn live, and the most interesting thing in any clip. It used to
 * be one flat-sized dot per frame, which read as a nervous scribble rather
 * than a line.
 *
 * Curve fitting is a quadratic through segment midpoints. At ~43Hz and 220px/s
 * consecutive samples are about 5px apart, so the drawn line never departs
 * from the data by a visible amount: it is still their contour, drawn kindly
 * (spec B5). Nothing here idealises or snaps the shape.
 */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  trail: readonly TrailSample[],
  trailSeconds: number,
  dotX: number,
  nowMs: number,
): void {
  if (trail.length === 0) return;
  const lifetimeMs = trailSeconds * 1000;
  const pxPerMs = (width * 0.45) / lifetimeMs;

  // Split into strokes, breaking wherever the player stopped phonating.
  const strokes: Point[][] = [];
  let current: Point[] = [];
  let prevT: number | null = null;

  for (const sample of trail) {
    const age = nowMs - sample.t;
    const freshness = 1 - age / lifetimeMs;
    if (freshness <= 0) {
      prevT = sample.t;
      continue;
    }
    const x = sample.x ?? dotX - age * pxPerMs;
    if (x < -width * 0.1) {
      prevT = sample.t;
      continue;
    }
    if (prevT !== null && sample.t - prevT > TRAIL_BREAK_MS && current.length > 0) {
      strokes.push(current);
      current = [];
    }
    prevT = sample.t;
    current.push({
      x,
      y: chaoToY(sample.chao, height),
      freshness,
      errRatio: sample.errRatio ?? null,
    });
  }
  if (current.length > 0) strokes.push(current);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) drawRibbon(ctx, width, stroke);
  ctx.restore();
}

/**
 * Colour for a point: the trail's own blue when on the corridor centre,
 * warming toward amber as it approaches the wall.
 *
 * This is the drift made visible without any text — you can see which part of
 * your contour wandered. Outside a gate there is no corridor to be off, so it
 * stays blue.
 */
function trailColor(errRatio: number | null, alpha: number): string {
  if (errRatio === null) return rgba("accent", alpha);
  const t = Math.max(0, Math.min(1, errRatio));
  const [ar, ag, ab] = rgbTuple("accent");
  // Warm target: the wall's own amber. Not a token — it is the far end of a
  // gradient whose near end is the accent, and it has to stay legible against it.
  const r = Math.round(ar + (255 - ar) * t);
  const g = Math.round(ag + (180 - ag) * t);
  const b = Math.round(ab + (120 - ab) * t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * One unbroken stroke, drawn segment by segment so width, opacity and colour
 * can all vary along its length. Round caps make the pieces read as one
 * continuous ribbon.
 */
function drawRibbon(
  ctx: CanvasRenderingContext2D,
  width: number,
  pts: Point[],
): void {
  const maxW = width * TRAIL_WIDTH_FRAC;
  const minW = width * TRAIL_TAIL_WIDTH_FRAC;

  if (pts.length === 1) {
    const p = pts[0];
    ctx.fillStyle = trailColor(p.errRatio, 0.75 * p.freshness);
    ctx.beginPath();
    ctx.arc(p.x, p.y, minW, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const p = pts[i];
    // Quadratic through midpoints: the control point is the sample itself, so
    // the curve leans toward every measurement without overshooting it.
    const from =
      i === 1 ? prev : { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
    const to =
      i === pts.length - 1 ? p : { x: (p.x + pts[i + 1].x) / 2, y: (p.y + pts[i + 1].y) / 2 };

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(p.x, p.y, to.x, to.y);
    // Taper is eased rather than linear so the ribbon keeps presence for most
    // of its life and then thins away quickly at the tail.
    ctx.lineWidth = minW + (maxW - minW) * Math.pow(p.freshness, 0.7);
    ctx.strokeStyle = trailColor(p.errRatio, 0.8 * Math.pow(p.freshness, 0.8));
    ctx.stroke();
  }
}

/** Idle pulse period when unvoiced — a slow breath, not a blink. */
const PULSE_MS = 1600;

/**
 * The player's dot — the brightest, largest, most alive thing on screen, in
 * every state.
 *
 * It used to drop to a 45%-opacity hollow ring the moment the player stopped
 * phonating, which in real play is most of the time, while the *demo* dot was
 * drawn solid and glowing. For a game whose whole hook is "your voice is the
 * controller", the computer was the most prominent moving object on screen.
 *
 * The voiced/unvoiced distinction carries real information and is kept — but
 * expressed as intensity, not presence versus near-absence. Unvoiced, the dot
 * keeps its size and a solid core, loses its halo, and breathes: it reads as
 * waiting for you, not as gone.
 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chao: number,
  dotX: number,
  voiced: boolean,
  nowMs = 0,
): void {
  const dotY = chaoToY(chao, height);
  const r = width * 0.032;
  // 0 when unvoiced at the bottom of the breath, 1 when singing.
  const pulse = voiced
    ? 1
    : 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((nowMs / PULSE_MS) * Math.PI * 2));

  ctx.save();

  // Outer halo — the thing that makes it read as a light source rather than a
  // sticker. Present even when silent, just quieter.
  const haloR = r * (voiced ? 3.4 : 2.4);
  const halo = ctx.createRadialGradient(dotX, dotY, r * 0.4, dotX, dotY, haloR);
  halo.addColorStop(0, rgba("accent", 0.42 * pulse));
  halo.addColorStop(0.55, rgba("accent", 0.14 * pulse));
  halo.addColorStop(1, rgba("accent", 0));
  ctx.fillStyle = halo;
  ctx.fillRect(dotX - haloR, dotY - haloR, haloR * 2, haloR * 2);

  // Body: a filled disc in both states. Never a hollow ring.
  ctx.beginPath();
  ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
  // Both states are the accent: lifted toward white while voiced, pulled down
  // while silent. Derived rather than hard-coded so the dot follows a re-brand.
  ctx.fillStyle = voiced
    ? `rgba(${mixAccent(0.25, 255)}, 0.95)`
    : `rgba(${mixAccent(0.12, 0)}, ${0.5 + 0.18 * pulse})`;
  ctx.fill();

  // A white-hot core only while actually producing pitch — this is the single
  // cue that separates "singing" from "waiting", and it is enough.
  if (voiced) {
    ctx.beginPath();
    ctx.arc(dotX, dotY, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${mixAccent(0.92, 255)}, 0.98)`;
    ctx.fill();
  }

  // Crisp rim keeps the dot legible against a lit corridor as well as a dark wall.
  ctx.beginPath();
  ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${mixAccent(0.55, 255)}, ${voiced ? 0.9 : 0.4 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: SceneSnapshot,
): void {
  const { trail, trailSeconds } = snapshot;
  const now = performance.now();
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);

  drawChaoGrid(ctx, width, height);

  const dotX = width * 0.5;
  drawTrail(ctx, width, height, trail, trailSeconds, dotX, now);
  drawDot(ctx, width, height, snapshot.chao, dotX, snapshot.voiced, now);
}
