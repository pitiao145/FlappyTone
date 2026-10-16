/**
 * The "Taroko" theme (brief 07): a marble gorge, a turquoise river and the
 * Eternal Spring Shrine, drawn smooth (vector), not on a pixel grid.
 *
 * Design values are in design px at H = 809 (`D`): a position is
 * `v / 809 × H`, a size `v × H / 809`. X inside a tile scales with H too, so
 * layers keep their proportions on a wide desktop canvas.
 *
 * Backdrop layers are tiled offscreen canvases at device resolution, built
 * once per (W, H, DPR) and cropped to their own vertical band (a full-height
 * shrine tile at 3×W and DPR 3 would be ~34 MB). Per frame they are only
 * blitted at `(worldX × k) mod tileW`. Every ridge and scatter is periodic in
 * its tile, so the joins are seamless.
 *
 * Walls are painted inside the exact smooth wall polygons — the visible edge
 * is the collision edge — with a screen-anchored gradient, a strata pattern
 * anchored in world x, a green fringe and an outline with a warm rim.
 */

import { tuning } from "../game/tuning.ts";
import { TAROKO as TK } from "./palette.ts";
import { deviceTransform, tileAcross, type AnyCanvas } from "./pixelTheme.ts";
import type { GridStyle } from "./scene.ts";
import { appendSmooth, bottomWallPath, topWallPath, type Pt } from "./smoothPath.ts";

const DESIGN_H = 809;

export const TAROKO_GRID: GridStyle = {
  strokeRgb: TK.outlineRgb,
  alpha: 0.22,
  restAlpha: 0.5,
  lineWidth: 1,
  dash: [],
  labelRgb: "247, 241, 227",
  labelAlpha: 1,
  labelRestAlpha: 1,
  labelStroke: TK.outline,
  labelStrokeWidth: 3,
};

// ------------------------------------------------------------- pure shapes

/** Deterministic PRNG (mulberry32), so a layer looks the same every session. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [cycles per tile, weight, phase]. Integer cycles keep the ridge periodic. */
export type Harmonic = readonly [number, number, number];

export const FAR_HARMONICS: readonly Harmonic[] = [
  [2, 1, 0.4],
  [5, 0.4, 2.1],
  [9, 0.15, 4.0],
];
export const NEAR_HARMONICS: readonly Harmonic[] = [
  [1, 1, 1.9],
  [3, 0.35, 0.6],
];

/**
 * A ridge's height (as a fraction of H) at `x` in a tile `tileW` wide,
 * wandering between `lo` and `hi`. Periodic: ridgeY(0) === ridgeY(tileW).
 */
export function ridgeY(
  x: number,
  tileW: number,
  lo: number,
  hi: number,
  harmonics: readonly Harmonic[],
): number {
  let v = 0;
  let total = 0;
  for (const [n, w, p] of harmonics) {
    v += w * Math.sin((2 * Math.PI * n * x) / tileW + p);
    total += w;
  }
  const u = (v / total + 1) / 2; // 0..1
  return lo + u * (hi - lo);
}

// ----------------------------------------------------------- canvas setup

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx2D } | null {
  if (w <= 0 || h <= 0) return null;
  let canvas: AnyCanvas;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(w, h);
  else if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  } else return null;
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  return ctx ? { canvas, ctx } : null;
}

interface Band {
  canvas: AnyCanvas | null;
  /** Tile width in device px. */
  tileDev: number;
  /** Band top and height in device px. */
  yDev: number;
  hDev: number;
  k: "tarokoKClouds" | "tarokoKFar" | "tarokoKNear" | "tarokoKShrine" | "tarokoKRiverDetail";
}

/**
 * Build one band: a canvas `tileMult × W` wide covering [y0, y1] × H, with
 * `paint` called in LOGICAL px, origin at the band's top-left, and the tile's
 * logical width (an exact multiple of 1/dpr, so it tiles on device px).
 */
function band(
  width: number,
  height: number,
  dpr: number,
  tileMult: number,
  y0: number,
  y1: number,
  k: Band["k"],
  paint: (ctx: Ctx2D, tileW: number, s: number, yTop: number) => void,
): Band {
  const tileDev = Math.max(1, Math.round(width * tileMult * dpr));
  const yDev = Math.floor(y0 * height * dpr);
  const hDev = Math.ceil(y1 * height * dpr) - yDev;
  const made = makeCanvas(tileDev, hDev);
  if (made) {
    made.ctx.setTransform(dpr, 0, 0, dpr, 0, -yDev);
    paint(made.ctx, tileDev / dpr, height / DESIGN_H, 0);
  }
  return { canvas: made?.canvas ?? null, tileDev, yDev, hDev, k };
}

/** Draw `fn` at x and at x ± tileW, so a shape across the join wraps. */
function wrapped(tileW: number, fn: (dx: number) => void): void {
  fn(-tileW);
  fn(0);
  fn(tileW);
}

function paintRidge(
  ctx: Ctx2D,
  tileW: number,
  height: number,
  lo: number,
  hi: number,
  harmonics: readonly Harmonic[],
  colour: string,
  bottom: number,
): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  const step = 3;
  for (let x = 0; x <= tileW + step; x += step) {
    const xx = Math.min(x, tileW);
    ctx.lineTo(xx, ridgeY(xx, tileW, lo, hi, harmonics) * height);
  }
  ctx.lineTo(tileW, bottom);
  ctx.closePath();
  ctx.fill();
}

function paintClouds(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(707);
  const sizes: ReadonlyArray<[number, number]> = [
    [48, 6],
    [36, 5],
    [52, 6],
    [26, 4],
  ];
  ctx.fillStyle = `rgba(255, 255, 255, 0.85)`;
  sizes.forEach(([rx, ry], i) => {
    const cx = ((i + 0.2 + r() * 0.6) / sizes.length) * tileW;
    const cy = (0.26 + r() * 0.2) * height;
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, rx * s, ry * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

/** The Eternal Spring Shrine on its bluff, centred at `cx`. Design px × s. */
export function paintShrine(ctx: Ctx2D, cx: number, s: number, height: number): void {
  const base = 0.865 * height;
  const crest = 0.72 * height;
  const half = 67 * s;
  const px = (v: number) => Math.max(v * s, 1);

  // Bluff: soft shoulders, flat-ish crest.
  ctx.fillStyle = TK.bluff;
  ctx.beginPath();
  ctx.moveTo(cx - half, base);
  ctx.bezierCurveTo(cx - half * 0.85, crest + 40 * s, cx - half * 0.7, crest, cx - half * 0.35, crest);
  ctx.lineTo(cx + half * 0.55, crest);
  ctx.bezierCurveTo(cx + half * 0.85, crest, cx + half * 0.95, crest + 30 * s, cx + half, base);
  ctx.closePath();
  ctx.fill();

  // Green crest line.
  ctx.strokeStyle = TK.bluffCrest;
  ctx.lineWidth = px(6);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.62, crest + 4 * s);
  ctx.bezierCurveTo(cx - half * 0.5, crest, cx - half * 0.4, crest, cx - half * 0.35, crest);
  ctx.lineTo(cx + half * 0.55, crest);
  ctx.bezierCurveTo(cx + half * 0.7, crest, cx + half * 0.8, crest + 2 * s, cx + half * 0.86, crest + 6 * s);
  ctx.stroke();

  // Waterfall at the far edge, crest to river.
  const wx = cx + half * 0.88;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineCap = "butt";
  ctx.lineWidth = px(5);
  ctx.beginPath();
  ctx.moveTo(wx, crest + 8 * s);
  ctx.lineTo(wx, base);
  ctx.stroke();
  ctx.lineWidth = px(1.5);
  for (const off of [-5.5, 5.5]) {
    ctx.beginPath();
    ctx.moveTo(wx + off * s, crest + 18 * s);
    ctx.lineTo(wx + off * s, base);
    ctx.stroke();
  }

  // Hall on the crest, slightly left of centre.
  const hx = cx - 8 * s;
  const hallTop = crest - 14 * s;
  ctx.fillStyle = TK.hall;
  ctx.fillRect(hx - 17 * s, hallTop, 34 * s, 14 * s);
  ctx.fillStyle = TK.post;
  for (const off of [-12, 0, 12]) ctx.fillRect(hx + off * s - px(2.4) / 2, hallTop, px(2.4), 14 * s);

  // Curved roof, 50 wide, 26 tall, eaves turned up at the tips.
  const eave = hallTop + 1 * s;
  const ridge = hallTop - 25 * s;
  ctx.fillStyle = TK.roof;
  ctx.strokeStyle = TK.roofEdge;
  ctx.lineWidth = px(0.9);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hx - 25 * s, eave - 4 * s);
  ctx.quadraticCurveTo(hx - 16 * s, eave, hx - 12 * s, ridge + 12 * s);
  ctx.quadraticCurveTo(hx - 6 * s, ridge, hx, ridge);
  ctx.quadraticCurveTo(hx + 6 * s, ridge, hx + 12 * s, ridge + 12 * s);
  ctx.quadraticCurveTo(hx + 16 * s, eave, hx + 25 * s, eave - 4 * s);
  ctx.quadraticCurveTo(hx, eave + 2 * s, hx - 25 * s, eave - 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Gold finial.
  ctx.fillStyle = TK.finial;
  ctx.beginPath();
  ctx.arc(hx, ridge - 2 * s, px(2.5), 0, Math.PI * 2);
  ctx.fill();
}

function paintRiverDetails(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(1907);
  const top = 0.865 * height;
  const depth = height - top;
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  const foam = 7;
  for (let i = 0; i < foam; i++) {
    const cx = ((i + r()) / foam) * tileW;
    const cy = top + (0.15 + r() * 0.75) * depth;
    const rx = (22 + r() * 12) * s;
    const ry = (3 + r() * 0.5) * s;
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.fillStyle = TK.boulder;
  for (let i = 0; i < 3; i++) {
    const cx = ((i + 0.3 + r() * 0.4) / 3) * tileW;
    const cy = top + (0.25 + r() * 0.6) * depth;
    const rx = (9 + r() * 5) * s;
    const ry = (4 + r() * 2) * s;
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// --------------------------------------------------------------- backdrop

interface BackdropCache {
  key: string;
  bands: Band[];
}

let backdrop: BackdropCache | null = null;

function backdropFor(width: number, height: number, dpr: number): BackdropCache {
  const t = tuning();
  const key = `${width}|${height}|${dpr}|${t.tarokoTileClouds}|${t.tarokoTileRidges}|${t.tarokoTileShrine}|${t.tarokoTileRiver}`;
  if (backdrop && backdrop.key === key) return backdrop;
  const ridgeBottom = 0.87 * height;
  backdrop = {
    key,
    bands: [
      band(width, height, dpr, t.tarokoTileClouds, 0.2, 0.5, "tarokoKClouds", (ctx, w, s) =>
        paintClouds(ctx, w, s, height),
      ),
      band(width, height, dpr, t.tarokoTileRidges, 0.56, 0.87, "tarokoKFar", (ctx, w) =>
        paintRidge(ctx, w, height, 0.57, 0.68, FAR_HARMONICS, TK.peakFar, ridgeBottom),
      ),
      band(width, height, dpr, t.tarokoTileRidges, 0.68, 0.87, "tarokoKNear", (ctx, w) =>
        paintRidge(ctx, w, height, 0.69, 0.75, NEAR_HARMONICS, TK.peakNear, ridgeBottom),
      ),
      band(width, height, dpr, t.tarokoTileShrine, 0.64, 0.87, "tarokoKShrine", (ctx, w, s) =>
        paintShrine(ctx, w * 0.5, s, height),
      ),
      band(width, height, dpr, t.tarokoTileRiver, 0.86, 1, "tarokoKRiverDetail", (ctx, w, s) =>
        paintRiverDetails(ctx, w, s, height),
      ),
    ],
  };
  return backdrop;
}

function stops(
  g: CanvasGradient,
  list: ReadonlyArray<readonly [number, string]>,
): CanvasGradient {
  for (const [at, c] of list) g.addColorStop(at, c);
  return g;
}

/** Layers 1–8. Call with the context's normal logical transform in place. */
export function drawTarokoBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldX: number,
): void {
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const cache = backdropFor(width, height, dpr);
  const canvasW = Math.round(width * dpr);
  const t = tuning();
  const [clouds, far, near, shrine, river] = cache.bands;

  const blit = (b: Band) => {
    if (!b.canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tileAcross(ctx, b.canvas, b.tileDev, worldX * t[b.k] * dpr, b.yDev, b.hDev, canvasW);
    ctx.restore();
  };

  // 1. Sky.
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, 0, height), TK.sky);
  ctx.fillRect(0, 0, width, height);
  // 2–4. Clouds, far and near peaks.
  blit(clouds);
  blit(far);
  blit(near);
  // 5. Haze over both ridge layers' feet.
  const hz0 = 0.667 * height;
  const hz1 = 0.816 * height;
  const haze = ctx.createLinearGradient(0, hz0, 0, hz1);
  haze.addColorStop(0, `rgba(${TK.hazeRgb}, 0)`);
  haze.addColorStop(1, `rgba(${TK.hazeRgb}, 0.8)`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, hz0, width, height * 0.87 - hz0);
  // 6. The shrine.
  blit(shrine);
  // 7. River: uniform across x, so its parallax is invisible and it is drawn
  //    screen-fixed; the details carry the motion.
  const rv0 = 0.865 * height;
  const river7 = ctx.createLinearGradient(0, rv0, 0, height);
  river7.addColorStop(0, TK.riverTop);
  river7.addColorStop(1, TK.riverBottom);
  ctx.fillStyle = river7;
  ctx.fillRect(0, rv0, width, height - rv0);
  // 8. Foam and boulders.
  blit(river);
}

// ------------------------------------------------------------------ walls

let strataTile: { key: string; canvas: AnyCanvas | null } | null = null;

/** The 64 × 16 design-px strata tile, at device resolution. */
function strataFor(height: number, dpr: number): { canvas: AnyCanvas | null; scale: number } {
  const scale = (height / DESIGN_H) * dpr; // device px per design px
  const w = Math.max(8, Math.round(64 * scale));
  const h = Math.max(2, Math.round(16 * scale));
  const key = `${w}|${h}`;
  if (!strataTile || strataTile.key !== key) {
    const made = makeCanvas(w, h);
    if (made) {
      const c = made.ctx;
      c.setTransform(w / 64, 0, 0, h / 16, 0, 0);
      const line = (y: number, colour: string, alpha: number) => {
        c.strokeStyle = colour;
        c.globalAlpha = alpha;
        c.lineWidth = 1.2;
        c.beginPath();
        for (let x = 0; x <= 64; x += 2) {
          const yy = y + 1.1 * Math.sin((2 * Math.PI * x) / 64);
          if (x === 0) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      };
      line(4, TK.strataLight, 0.32);
      line(11, TK.strataDark, 0.34);
    }
    strataTile = { key, canvas: made?.canvas ?? null };
  }
  return { canvas: strataTile.canvas, scale: w / 64 };
}

/**
 * One gate's marble walls, inside the exact smooth wall polygons and nowhere
 * past [x0, x1]. `xStart` is the gate's world x: the strata pattern is
 * offset by `x0 - xStart`, so the rock scrolls 1:1 with the gate.
 */
export function drawTarokoWalls(args: {
  ctx: CanvasRenderingContext2D;
  height: number;
  x0: number;
  x1: number;
  xStart: number;
  top: readonly Pt[];
  bottom: readonly Pt[];
}): void {
  const { ctx, height, x0, x1, xStart, top, bottom } = args;
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const s = height / DESIGN_H;
  const minPx = 1 / dpr;
  const size = (v: number) => Math.max(v * s, minPx);

  const strata = strataFor(height, dpr);
  let pattern: CanvasPattern | null = null;
  if (strata.canvas && typeof ctx.createPattern === "function") {
    pattern = ctx.createPattern(strata.canvas as CanvasImageSource, "repeat");
    if (pattern && typeof DOMMatrix !== "undefined" && typeof pattern.setTransform === "function") {
      // Tile is in device px; the context is in logical px. Anchor in world x,
      // tilt −7°.
      const k = 1 / dpr;
      pattern.setTransform(
        new DOMMatrix().translate(x0 - xStart, 0).rotate(-7).scale(k, k),
      );
    }
  }

  const walls: Array<{
    edge: readonly Pt[];
    path: () => void;
    grad: [number, number, ReadonlyArray<readonly [number, string]>];
  }> = [
    { edge: top, path: () => topWallPath(ctx, top, x0, x1), grad: [0, 0.519 * height, TK.wallTop] },
    {
      edge: bottom,
      path: () => bottomWallPath(ctx, bottom, x0, x1, height),
      grad: [0.544 * height, height, TK.wallBottom],
    },
  ];

  for (const { edge, path, grad } of walls) {
    if (edge.length === 0) continue;
    ctx.save();
    path();
    ctx.clip();

    // 1. Base gradient, anchored in screen y so neighbouring gates match.
    ctx.fillStyle = stops(ctx.createLinearGradient(0, grad[0], 0, grad[1]), grad[2]);
    ctx.fillRect(x0, 0, x1 - x0, height);
    // 2. Strata.
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(x0, 0, x1 - x0, height);
    }
    // 3. Green fringe along the channel edge (only the inner half shows).
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const strokeEdge = (w: number, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(edge[0].x, edge[0].y);
      appendSmooth(ctx, edge);
      ctx.stroke();
    };
    strokeEdge(size(34), "rgba(77, 138, 66, 0.45)");
    strokeEdge(size(14), "rgba(106, 163, 82, 0.85)");
    ctx.restore();

    // 4. Outline and warm rim, along the edge, limited to [x0, x1].
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, height);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = TK.outline;
    ctx.lineWidth = size(3.2);
    ctx.beginPath();
    ctx.moveTo(edge[0].x, edge[0].y);
    appendSmooth(ctx, edge);
    ctx.stroke();
    ctx.strokeStyle = TK.rim;
    ctx.lineWidth = size(1.2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Drops the caches. Tests use it; nothing else needs to. */
export function resetTarokoTheme(): void {
  backdrop = null;
  strataTile = null;
}
