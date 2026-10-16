/**
 * The "Tea terraces" theme (brief 09): Maokong tea hills in the morning, a
 * gondola line, the hazy Taipei basin with Taipei 101, and green hill walls
 * whose terrace lines echo the corridor edge.
 *
 * Same structure as tarokoTheme.ts / alishanTheme.ts: design values in
 * design px at H = 809, backdrop layers are tiled offscreen bands built once
 * per (W, H, DPR) and blitted at `(worldX × k) mod tileW`, every shape
 * periodic in its tile. The tea rows are a world-anchored pattern fill.
 *
 * Terrace lines are copies of the wall edge offset along the local edge
 * NORMAL (not shifted straight down as the board does: on a steep T4 fall a
 * vertical shift lays neighbouring lines on top of each other). They are
 * static per gate, so each offset line is built once as a Path2D in
 * gate-local x and only stroked per frame.
 */

import type { GateShape } from "../game/gates.ts";
import { tuning, type Tuning } from "../game/tuning.ts";
import { TEA_TERRACES as TT } from "./palette.ts";
import { deviceTransform, tileAcross, type AnyCanvas } from "./pixelTheme.ts";
import type { GridStyle } from "./scene.ts";
import { appendSmooth, bottomWallPath, topWallPath, type Pt } from "./smoothPath.ts";
import { makeCanvas, rng, stops, wrapped, type Ctx2D } from "./tarokoTheme.ts";

const DESIGN_H = 809;

export const TEA_TERRACES_GRID: GridStyle = {
  strokeRgb: TT.outlineRgb,
  alpha: 0.22,
  restAlpha: 0.5,
  lineWidth: 1,
  dash: [],
  labelRgb: "247, 241, 227",
  labelAlpha: 1,
  labelRestAlpha: 1,
  labelStroke: TT.outline,
  labelStrokeWidth: 3,
};

// ------------------------------------------------------------- pure shapes

/**
 * A rolling hill ridge at `x`, fraction of H, between `hi` (top) and `lo`.
 * Integer cycles per tile, so it is periodic.
 */
export function hillY(x: number, tileW: number, hi: number, lo: number, near: boolean): number {
  const u = (2 * Math.PI * x) / tileW;
  const v = near
    ? 0.5 + 0.32 * Math.sin(3 * u + 0.6) + 0.18 * Math.sin(7 * u + 2.0)
    : 0.5 + 0.3 * Math.sin(2 * u + 1.2) + 0.14 * Math.sin(5 * u + 0.3) + 0.06 * Math.sin(11 * u + 4.0);
  return lo - (lo - hi) * Math.min(1, Math.max(0, v));
}

/** Gondola spans per tile (pylons at each join). */
export const GONDOLA_SPANS = 3;

/** Pylon top height (fraction of H) of pylon `i`, periodic in the spans. */
export function pylonTop(i: number): number {
  const tops = [0.43, 0.5, 0.46];
  return tops[((i % tops.length) + tops.length) % tops.length];
}

/** The cable's y (fraction of H) at `x`: a sagging span between two pylons. */
export function cableY(x: number, tileW: number): number {
  const spanW = tileW / GONDOLA_SPANS;
  const xx = ((x % tileW) + tileW) % tileW;
  const i = Math.min(GONDOLA_SPANS - 1, Math.floor(xx / spanW));
  const f = (xx - i * spanW) / spanW;
  const a = pylonTop(i);
  const b = pylonTop((i + 1) % GONDOLA_SPANS);
  return a + (b - a) * f + 0.03 * 4 * f * (1 - f);
}

/** Taipei 101's sections, bottom up: [bottom width, top width, height] in design px. */
export const TOWER_SECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [60, 52, 30], // podium
  [33, 38, 33], // 8 flaring bulbs
  [33, 38, 33],
  [33, 38, 32],
  [33, 37, 32],
  [32, 36, 31],
  [32, 35, 31],
  [31, 34, 30],
  [30, 33, 30],
  [26, 20, 18], // 3 tapering stages
  [20, 12, 16],
  [12, 6, 14],
];

/** One tower per basin tile: its centre, as a fraction of the tile. */
export const TOWER_AT = 0.5;

/**
 * The polyline `pts` moved by `d` along its local normal, on the side given
 * by `down` (+y for the bottom wall, -y for the top). Ends are extended
 * horizontally by `ext` so a clip, not a gap, decides where a line stops.
 */
export function offsetEdge(pts: readonly Pt[], d: number, down: boolean, ext = 0): Pt[] {
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: pts[0].x, y: pts[0].y + (down ? d : -d) }];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // Normal (−ty, tx) points +y when the edge runs left to right.
    let nx = -ty;
    let ny = tx;
    if ((ny > 0) !== down) {
      nx = -nx;
      ny = -ny;
    }
    out.push({ x: pts[i].x + nx * d, y: pts[i].y + ny * d });
  }
  if (ext > 0) {
    out.unshift({ x: out[0].x - ext, y: out[0].y });
    out.push({ x: out[out.length - 1].x + ext, y: out[out.length - 1].y });
  }
  return out;
}

/** Terrace lips: [d, alpha] in design px. */
export const LIPS: ReadonlyArray<readonly [number, number]> = [
  [14, 0.8],
  [35, 0.7],
  [56, 0.6],
  [77, 0.5],
  [98, 0.4],
  [119, 0.35],
  [140, 0.3],
  [161, 0.25],
  [182, 0.2],
];
/** Shadow lines, 7 px under each of the first five lips. */
export const SHADOWS: readonly number[] = [21, 42, 63, 84, 105];

// ----------------------------------------------------------- band canvases

type KKey = "teaKClouds" | "teaKFarHills" | "teaKNearHills" | "teaKGondola" | "teaKBasin";

interface Band {
  canvas: AnyCanvas | null;
  tileDev: number;
  yDev: number;
  hDev: number;
  k: KKey;
}

function band(
  width: number,
  height: number,
  dpr: number,
  tileMult: number,
  y0: number,
  y1: number,
  k: KKey,
  paint: (ctx: Ctx2D, tileW: number, s: number) => void,
): Band {
  const tileDev = Math.max(1, Math.round(width * tileMult * dpr));
  const yDev = Math.max(0, Math.floor(y0 * height * dpr));
  const hDev = Math.ceil(Math.min(1, y1) * height * dpr) - yDev;
  const made = makeCanvas(tileDev, hDev);
  if (made) {
    made.ctx.setTransform(dpr, 0, 0, dpr, 0, -yDev);
    paint(made.ctx, tileDev / dpr, height / DESIGN_H);
  }
  return { canvas: made?.canvas ?? null, tileDev, yDev, hDev, k };
}

function paintClouds(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(909);
  const ys = [0.31, 0.41, 0.48];
  ctx.fillStyle = `rgba(${TT.cloudRgb}, 0.9)`;
  ys.forEach((fy, i) => {
    const cx = ((i + 0.2 + r() * 0.6) / ys.length) * tileW;
    const cy = fy * height;
    const puffs: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 0, 30, 9],
      [-14, -6, 20, 10],
      [16, -3, 18, 7],
    ];
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      for (const [ox, oy, rx, ry] of puffs) {
        ctx.moveTo(cx + dx + ox * s + rx * s, cy + oy * s);
        ctx.ellipse(cx + dx + ox * s, cy + oy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    });
  });
}

function paintHills(ctx: Ctx2D, tileW: number, height: number, near: boolean, bottom: number): void {
  const hi = near ? 0.7 : 0.59;
  const lo = near ? 0.75 : 0.68;
  ctx.fillStyle = near ? TT.nearHills : TT.farHills;
  ctx.beginPath();
  ctx.moveTo(0, bottom * height);
  for (let x = 0; x <= tileW + 3; x += 3) {
    const xx = Math.min(x, tileW);
    ctx.lineTo(xx, hillY(xx, tileW, hi, lo, near) * height);
  }
  ctx.lineTo(tileW, bottom * height);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintGondola(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const spanW = tileW / GONDOLA_SPANS;
  const foot = 0.57 * height;
  // Pylons: a thin tapered tower with a cross arm.
  ctx.fillStyle = TT.pylon;
  for (let i = 0; i <= GONDOLA_SPANS; i++) {
    const x = i * spanW;
    const top = pylonTop(i % GONDOLA_SPANS) * height;
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      ctx.moveTo(x + dx - 1.2 * s, top);
      ctx.lineTo(x + dx + 1.2 * s, top);
      ctx.lineTo(x + dx + 3.5 * s, foot);
      ctx.lineTo(x + dx - 3.5 * s, foot);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + dx - 6 * s, top - 1 * s, 12 * s, 2 * s);
    });
  }
  // Cable.
  ctx.strokeStyle = TT.cable;
  ctx.lineWidth = 1.3 * s;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let x = 0; x <= tileW + 2; x += 2) {
    const xx = Math.min(x, tileW);
    if (x === 0) ctx.moveTo(xx, cableY(xx, tileW) * height);
    else ctx.lineTo(xx, cableY(xx, tileW) * height);
  }
  ctx.stroke();
  // Cabins: one or two per span, white and warm.
  const r = rng(1909);
  let c = 0;
  for (let i = 0; i < GONDOLA_SPANS; i++) {
    const count = i === 1 ? 1 : 2;
    for (let j = 0; j < count; j++) {
      const x = i * spanW + spanW * (count === 1 ? 0.5 : 0.3 + j * 0.4 + (r() - 0.5) * 0.08);
      const y = cableY(x, tileW) * height;
      const w = 14 * s;
      const h = 10 * s;
      ctx.strokeStyle = TT.pylon;
      ctx.lineWidth = Math.max(1 * s, 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 8 * s);
      ctx.stroke();
      roundRect(ctx, x - w / 2, y + 8 * s, w, h, 2.5 * s);
      ctx.fillStyle = TT.cabins[c++ % TT.cabins.length];
      ctx.fill();
      ctx.stroke();
    }
  }
}

function paintTower(ctx: Ctx2D, cx: number, s: number, height: number): void {
  const base = 0.853 * height;
  const total = 0.53 * height;
  const antennaH = 0.07 * height;
  const designSum = TOWER_SECTIONS.reduce((a, [, , h]) => a + h, 0);
  const hk = (total - antennaH) / designSum;
  let y = base;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1 * s, 0.5);
  TOWER_SECTIONS.forEach(([wb, wt, h], i) => {
    const y1 = y - h * hk;
    const bw = (wb * s) / 2;
    const tw = (wt * s) / 2;
    ctx.beginPath();
    ctx.moveTo(cx - bw, y);
    ctx.lineTo(cx + bw, y);
    ctx.lineTo(cx + tw, y1);
    ctx.lineTo(cx - tw, y1);
    ctx.closePath();
    ctx.fillStyle = TT.tower;
    ctx.fill();
    ctx.strokeStyle = TT.towerStroke;
    ctx.stroke();
    // Right half shaded on the 10 main sections (podium + bulbs + first stage).
    if (i < 10) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + bw, y);
      ctx.lineTo(cx + tw, y1);
      ctx.lineTo(cx, y1);
      ctx.closePath();
      ctx.fillStyle = `rgba(${TT.towerShadeRgb}, 0.55)`;
      ctx.fill();
    }
    y = y1;
  });
  ctx.strokeStyle = TT.towerStroke;
  ctx.lineWidth = 1.6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, base - total);
  ctx.stroke();
}

function paintBasin(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(2909);
  const baseY = 0.868 * height;
  ctx.fillStyle = TT.basin;
  // Two clusters of hazy blocks, away from the tower.
  for (const centre of [0.18, 0.78]) {
    const n = 7;
    let x = centre * tileW - 60 * s;
    for (let i = 0; i < n; i++) {
      const w = (16 + r() * 8) * s;
      const h = (34 + r() * 28) * s;
      const xx = x;
      wrapped(tileW, (dx) => ctx.fillRect(xx + dx, baseY - h, w, h + 2 * s));
      x += w + (r() * 3 - 1) * s;
    }
  }
  paintTower(ctx, TOWER_AT * tileW, s, height);
  // Haze over the basin and the tower's foot.
  const y0 = 0.692 * height;
  const y1 = 0.878 * height;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${TT.hazeRgb}, 0)`);
  g.addColorStop(1, `rgba(${TT.hazeRgb}, 0.88)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, tileW, y1 - y0);
}

// --------------------------------------------------------------- backdrop

interface BackdropCache {
  key: string;
  clouds: Band;
  hills: [Band, Band];
  gondola: Band;
  basin: Band;
  rows: AnyCanvas | null;
}

let backdrop: BackdropCache | null = null;

function rowsTile(height: number, dpr: number): AnyCanvas | null {
  const scale = (height / DESIGN_H) * dpr;
  const w = Math.max(2, Math.round(24 * scale));
  const h = Math.max(2, Math.round(10 * scale));
  const made = makeCanvas(w, h);
  if (!made) return null;
  made.ctx.fillStyle = TT.rowsDark;
  made.ctx.fillRect(0, 0, w, h / 2);
  made.ctx.fillStyle = TT.rowsLight;
  made.ctx.fillRect(0, h / 2, w, h - h / 2);
  return made.canvas;
}

function backdropFor(width: number, height: number, dpr: number, t: Tuning): BackdropCache {
  const key = `${width}|${height}|${dpr}|${t.teaTileClouds}|${t.teaTileHills}|${t.teaTileGondola}|${t.teaTileBasin}`;
  if (backdrop && backdrop.key === key) return backdrop;
  const hillsBand = (near: boolean, k: KKey, y0: number, y1: number) =>
    band(width, height, dpr, t.teaTileHills, y0, y1, k, (ctx, w) => paintHills(ctx, w, height, near, y1));
  backdrop = {
    key,
    clouds: band(width, height, dpr, t.teaTileClouds, 0.28, 0.51, "teaKClouds", (ctx, w, s) =>
      paintClouds(ctx, w, s, height),
    ),
    hills: [hillsBand(false, "teaKFarHills", 0.58, 0.8), hillsBand(true, "teaKNearHills", 0.69, 0.88)],
    gondola: band(width, height, dpr, t.teaTileGondola, 0.4, 0.6, "teaKGondola", (ctx, w, s) =>
      paintGondola(ctx, w, s, height),
    ),
    basin: band(width, height, dpr, t.teaTileBasin, 0.3, 0.88, "teaKBasin", (ctx, w, s) =>
      paintBasin(ctx, w, s, height),
    ),
    rows: rowsTile(height, dpr),
  };
  return backdrop;
}

/** Layers 1–10. Call with the context's normal logical transform in place. */
export function drawTeaTerracesBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldX: number,
): void {
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const t = tuning();
  const cache = backdropFor(width, height, dpr, t);
  const canvasW = Math.round(width * dpr);
  const s = height / DESIGN_H;

  const blit = (b: Band) => {
    if (!b.canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tileAcross(ctx, b.canvas, b.tileDev, worldX * t[b.k] * dpr, b.yDev, b.hDev, canvasW);
    ctx.restore();
  };

  // 1. Sky.
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, 0, height), TT.sky);
  ctx.fillRect(0, 0, width, height);
  // 2. Sun, screen-fixed.
  const sx = 0.93 * width;
  const sy = 0.292 * height;
  const glowR = 46 * s;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  glow.addColorStop(0, `rgba(${TT.sunGlowRgb}, 0.9)`);
  glow.addColorStop(1, `rgba(${TT.sunGlowRgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
  ctx.fillStyle = TT.sunCore;
  ctx.beginPath();
  ctx.arc(sx, sy, 18 * s, 0, Math.PI * 2);
  ctx.fill();
  // 3–9.
  blit(cache.clouds);
  blit(cache.hills[0]);
  blit(cache.hills[1]);
  blit(cache.gondola);
  blit(cache.basin);
  // 10. Tea rows: base fill, then the stripe tile anchored in world x.
  const y0 = 0.865 * height;
  ctx.fillStyle = TT.rowsBase;
  ctx.fillRect(0, y0, width, height - y0);
  if (cache.rows && typeof ctx.createPattern === "function") {
    const pattern = ctx.createPattern(cache.rows as CanvasImageSource, "repeat");
    if (pattern) {
      if (typeof DOMMatrix !== "undefined" && typeof pattern.setTransform === "function") {
        const k = 1 / dpr;
        pattern.setTransform(new DOMMatrix().translate(-worldX * t.teaKRows, y0).rotate(-3).scale(k, k));
      }
      ctx.fillStyle = pattern;
      ctx.fillRect(0, y0, width, height - y0);
    }
  }
}

// ------------------------------------------------------------------ walls

interface TerracePaths {
  key: string;
  /** Per wall: lips then shadows, in gate-local x (origin at x0). */
  top: Path2D[];
  bottom: Path2D[];
}

const terraceCache = new WeakMap<GateShape, TerracePaths>();

function smoothPath2D(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  if (pts.length === 0) return p;
  p.moveTo(pts[0].x, pts[0].y);
  // appendSmooth only calls lineTo / quadraticCurveTo, which Path2D has.
  appendSmooth(p as unknown as CanvasRenderingContext2D, pts);
  return p;
}

function terracePaths(
  shape: GateShape,
  key: string,
  x0: number,
  top: readonly Pt[],
  bottom: readonly Pt[],
  s: number,
): TerracePaths {
  const hit = terraceCache.get(shape);
  if (hit && hit.key === key) return hit;
  const local = (pts: readonly Pt[]) => pts.map((p) => ({ x: p.x - x0, y: p.y }));
  const lt = local(top);
  const lb = local(bottom);
  const ext = 40 * s;
  const build = (pts: Pt[], down: boolean) => [
    ...LIPS.map(([d]) => smoothPath2D(offsetEdge(pts, d * s, down, ext))),
    ...SHADOWS.map((d) => smoothPath2D(offsetEdge(pts, d * s, down, ext))),
  ];
  const made = { key, top: build(lt, false), bottom: build(lb, true) };
  terraceCache.set(shape, made);
  return made;
}

/**
 * One gate's terraced walls, inside the exact smooth wall polygons and
 * nowhere past [x0, x1].
 */
export function drawTeaTerracesWalls(args: {
  ctx: CanvasRenderingContext2D;
  height: number;
  x0: number;
  x1: number;
  top: readonly Pt[];
  bottom: readonly Pt[];
  shape: GateShape;
  cacheKey: string;
}): void {
  const { ctx, height, x0, x1, top, bottom, shape, cacheKey } = args;
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const s = height / DESIGN_H;
  const minPx = 1 / dpr;
  const size = (v: number) => Math.max(v * s, minPx);

  const usePaths = typeof Path2D !== "undefined";
  const paths = usePaths
    ? terracePaths(shape, `${cacheKey}|${height}|${x1 - x0}`, x0, top, bottom, s)
    : null;

  const walls = [
    {
      edge: top,
      down: false,
      lines: paths?.top,
      path: () => topWallPath(ctx, top, x0, x1),
      grad: [0, 0.519 * height, TT.wallTop] as const,
    },
    {
      edge: bottom,
      down: true,
      lines: paths?.bottom,
      path: () => bottomWallPath(ctx, bottom, x0, x1, height),
      grad: [0.544 * height, height, TT.wallBottom] as const,
    },
  ];

  const strokeEdge = (edge: readonly Pt[]) => {
    ctx.beginPath();
    ctx.moveTo(edge[0].x, edge[0].y);
    appendSmooth(ctx, edge);
    ctx.stroke();
  };

  for (const { edge, down, lines, path, grad } of walls) {
    if (edge.length === 0) continue;
    ctx.save();
    path();
    ctx.clip();
    // 1. Base gradient, anchored in screen y.
    ctx.fillStyle = stops(ctx.createLinearGradient(0, grad[0], 0, grad[1]), grad[2]);
    ctx.fillRect(x0, 0, x1 - x0, height);
    // 2. Terrace lines: lips fade with depth, shadows under the first five.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const all: Array<{ d: number; colour: string; w: number }> = [
      ...LIPS.map(([d, a]) => ({ d, colour: hexA(TT.lip, a), w: 2 })),
      ...SHADOWS.map((d) => ({ d, colour: `rgba(${TT.shadowRgb}, 0.4)`, w: 1.4 })),
    ];
    if (lines) {
      ctx.translate(x0, 0);
      all.forEach(({ colour, w }, i) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = size(w);
        ctx.stroke(lines[i]);
      });
    } else {
      for (const { d, colour, w } of all) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = size(w);
        strokeEdge(offsetEdge(edge, d * s, down, 40 * s));
      }
    }
    ctx.restore();

    // 3. Outline and rim light, limited to [x0, x1].
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, height);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = TT.outline;
    ctx.lineWidth = size(3.2);
    strokeEdge(edge);
    ctx.strokeStyle = TT.rim;
    ctx.lineWidth = size(1.2);
    ctx.stroke();
    ctx.restore();
  }
}

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

/** Drops the backdrop cache. Tests use it; nothing else needs to. */
export function resetTeaTerracesTheme(): void {
  backdrop = null;
}
