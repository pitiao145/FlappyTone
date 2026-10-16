/**
 * The "Alishan" theme (brief 08): dawn above the sea of clouds, indigo
 * cypress walls that rise out of the clouds and melt into mist.
 *
 * Same structure as tarokoTheme.ts: design values in design px at H = 809,
 * backdrop layers are tiled offscreen bands built once per (W, H, DPR) and
 * blitted at `(worldX × k) mod tileW`, every shape periodic in its tile.
 *
 * Walls paint inside the exact wall polygons. The body fades into mist at
 * the bottom, so the outline is painted last at full opacity: it is what
 * the player reads as the edge.
 */

import { tuning, type Tuning } from "../game/tuning.ts";
import { ALISHAN as AL } from "./palette.ts";
import { deviceTransform, tileAcross, type AnyCanvas } from "./pixelTheme.ts";
import type { GridStyle } from "./scene.ts";
import { appendSmooth, bottomWallPath, topWallPath, type Pt } from "./smoothPath.ts";
import { makeCanvas, rng, stops, wrapped, type Ctx2D } from "./tarokoTheme.ts";

const DESIGN_H = 809;

export const ALISHAN_GRID: GridStyle = {
  strokeRgb: AL.gridRgb,
  alpha: 0.24,
  restAlpha: 0.5,
  lineWidth: 1,
  dash: [],
  labelRgb: "255, 248, 238",
  labelAlpha: 1,
  labelRestAlpha: 1,
  labelStroke: AL.gridLabelStroke,
  labelStrokeWidth: 3,
};

// ------------------------------------------------------------- pure shapes

/** Cloud sea bands: baseline (fraction of H), amplitude and wavelength (design px). */
export const CLOUD_BANDS: ReadonlyArray<{ base: number; amp: number; wave: number; phase: number }> = [
  { base: 0.692, amp: 14, wave: 130, phase: 0.3 },
  { base: 0.75, amp: 16, wave: 145, phase: 2.2 },
  { base: 0.82, amp: 17, wave: 115, phase: 4.1 },
  { base: 0.897, amp: 15, wave: 150, phase: 1.3 },
  { base: 0.96, amp: 14, wave: 110, phase: 5.0 },
];

/** Whole wave cycles in a tile, so the band is periodic. */
export function cloudCycles(tileW: number, waveLogical: number): number {
  return Math.max(1, Math.round(tileW / waveLogical));
}

/**
 * A cloud band's top edge at `x`, in logical px. A main wave plus a slower
 * swell (both integer cycles per tile), rounded crests. Never above
 * `base - amp`, never below `base + amp`.
 */
export function cloudWaveY(x: number, tileW: number, base: number, amp: number, cycles: number, phase: number): number {
  const a = (2 * Math.PI * cycles * x) / tileW + phase;
  const swell = Math.sin((2 * Math.PI * Math.max(1, Math.round(cycles / 3)) * x) / tileW + phase * 1.7);
  // 1 − 2|sin| gives round crests between soft troughs; range −1..1 with the swell.
  const v = 0.75 * (1 - 2 * Math.abs(Math.sin(a / 2))) + 0.25 * swell;
  return base - amp * v;
}

/** Periodic distance from x to c inside a tile, as a fraction of the tile. */
function periodicDist(x: number, c: number, tileW: number): number {
  let d = Math.abs(x - c) / tileW;
  d -= Math.floor(d);
  return Math.min(d, 1 - d);
}

/**
 * The Yushan range: one tall massif per tile (centred at 0.5 tile) over a
 * lower rolling ridge. Fraction of H. Periodic in the tile.
 */
export function massifY(x: number, tileW: number, near: boolean): number {
  const u = (2 * Math.PI * x) / tileW;
  if (near) {
    const roll = 0.5 + 0.3 * Math.sin(5 * u + 0.8) + 0.2 * Math.sin(11 * u + 2.3);
    const bump = Math.exp(-((periodicDist(x, tileW * 0.62, tileW) / 0.06) ** 2));
    return 0.705 - 0.04 * roll - 0.035 * bump;
  }
  const roll = 0.5 + 0.35 * Math.sin(4 * u + 1.1) + 0.15 * Math.sin(9 * u + 0.4);
  const bump = Math.exp(-((periodicDist(x, tileW * 0.5, tileW) / 0.08) ** 2));
  return 0.68 - 0.04 * roll - 0.08 * bump;
}

// ----------------------------------------------------------- band canvases

type KKey =
  | "alishanKStreaks"
  | "alishanKRange"
  | "alishanKCypress"
  | "alishanKCloud1"
  | "alishanKCloud2"
  | "alishanKCloud3"
  | "alishanKCloud4"
  | "alishanKCloud5";

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

function paintStreaks(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(808);
  const sizes: ReadonlyArray<[number, number]> = [
    [54, 5],
    [40, 4],
    [30, 3.5],
    [46, 4.5],
  ];
  ctx.fillStyle = `rgba(${AL.streakRgb}, 0.38)`;
  sizes.forEach(([rx, ry], i) => {
    const cx = ((i + 0.2 + r() * 0.6) / sizes.length) * tileW;
    const cy = (0.31 + r() * 0.23) * height;
    wrapped(tileW, (dx) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, (rx * s) / 2, (ry * s) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function paintRange(ctx: Ctx2D, tileW: number, height: number): void {
  const bottom = 0.74 * height;
  for (const [near, colour] of [
    [false, AL.rangeFar],
    [true, AL.rangeNear],
  ] as const) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    const step = 3;
    for (let x = 0; x <= tileW + step; x += step) {
      const xx = Math.min(x, tileW);
      ctx.lineTo(xx, massifY(xx, tileW, near) * height);
    }
    ctx.lineTo(tileW, bottom);
    ctx.closePath();
    ctx.fill();
  }
}

/** A three-tier conifer, base centre at (cx, by), design px × s. */
function paintTree(ctx: Ctx2D, cx: number, by: number, s: number): void {
  const w = 14 * s;
  const h = 30 * s;
  const tiers = [
    [0, 0.45, 1],
    [0.25, 0.75, 0.8],
    [0.5, 1, 0.55],
  ] as const;
  for (const [t0, t1, ww] of tiers) {
    const yb = by - h * t0;
    const yt = by - h * t1;
    ctx.beginPath();
    ctx.moveTo(cx - (w * ww) / 2, yb);
    ctx.lineTo(cx, yt);
    ctx.lineTo(cx + (w * ww) / 2, yb);
    ctx.closePath();
    ctx.fill();
  }
}

function paintCypress(ctx: Ctx2D, tileW: number, s: number, height: number): void {
  const r = rng(1808);
  ctx.fillStyle = AL.cypress;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.15 + r() * 0.7) / n) * tileW;
    const by = (0.695 + r() * 0.01) * height;
    const scale = s * (0.7 + r() * 0.5);
    // A small group: a lead tree and one or two smaller ones.
    const group = 1 + Math.floor(r() * 3);
    for (let j = 0; j < group; j++) {
      const off = (j === 0 ? 0 : (j === 1 ? -1 : 1) * (9 + r() * 4)) * scale;
      const sc = j === 0 ? scale : scale * 0.72;
      wrapped(tileW, (dx) => paintTree(ctx, cx + off + dx, by, sc));
    }
  }
}

function paintCloudBand(
  ctx: Ctx2D,
  tileW: number,
  s: number,
  height: number,
  i: number,
): void {
  const b = CLOUD_BANDS[i];
  const cycles = cloudCycles(tileW, b.wave * s);
  const base = b.base * height;
  const amp = b.amp * s;
  const step = 2;
  const edge = () => {
    for (let x = 0; x <= tileW + step; x += step) {
      const xx = Math.min(x, tileW);
      ctx.lineTo(xx, cloudWaveY(xx, tileW, base, amp, cycles, b.phase));
    }
  };
  ctx.fillStyle = AL.clouds[i];
  ctx.beginPath();
  ctx.moveTo(0, height);
  edge();
  ctx.lineTo(tileW, height);
  ctx.closePath();
  ctx.fill();
  if (i === 0) {
    ctx.strokeStyle = `rgba(${AL.cloudHighlightRgb}, 0.9)`;
    ctx.lineWidth = Math.max(2 * s, 1);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, cloudWaveY(0, tileW, base, amp, cycles, b.phase));
    edge();
    ctx.stroke();
  }
}

// --------------------------------------------------------------- backdrop

interface BackdropCache {
  key: string;
  streaks: Band;
  range: Band;
  cypress: Band;
  clouds: Band[];
}

let backdrop: BackdropCache | null = null;

const CLOUD_K: readonly KKey[] = [
  "alishanKCloud1",
  "alishanKCloud2",
  "alishanKCloud3",
  "alishanKCloud4",
  "alishanKCloud5",
];

function backdropFor(width: number, height: number, dpr: number, t: Tuning): BackdropCache {
  const key = `${width}|${height}|${dpr}|${t.alishanTileStreaks}|${t.alishanTileRange}|${t.alishanTileCypress}|${t.alishanTileClouds}`;
  if (backdrop && backdrop.key === key) return backdrop;
  const s = height / DESIGN_H;
  backdrop = {
    key,
    streaks: band(width, height, dpr, t.alishanTileStreaks, 0.29, 0.56, "alishanKStreaks", (ctx, w, sc) =>
      paintStreaks(ctx, w, sc, height),
    ),
    range: band(width, height, dpr, t.alishanTileRange, 0.55, 0.74, "alishanKRange", (ctx, w) =>
      paintRange(ctx, w, height),
    ),
    cypress: band(width, height, dpr, t.alishanTileCypress, 0.6, 0.71, "alishanKCypress", (ctx, w, sc) =>
      paintCypress(ctx, w, sc, height),
    ),
    clouds: CLOUD_BANDS.map((b, i) =>
      // Cropped: below the next band's lowest edge that band covers this one.
      band(
        width,
        height,
        dpr,
        t.alishanTileClouds,
        b.base - ((b.amp + 3) * s) / height,
        i + 1 < CLOUD_BANDS.length ? CLOUD_BANDS[i + 1].base + ((CLOUD_BANDS[i + 1].amp + 2) * s) / height : 1,
        CLOUD_K[i],
        (ctx, w, sc) =>
        paintCloudBand(ctx, w, sc, height, i),
      ),
    ),
  };
  return backdrop;
}

/** Layers 1–6. Call with the context's normal logical transform in place. */
export function drawAlishanBackdrop(
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
  ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, 0, height), AL.sky);
  ctx.fillRect(0, 0, width, height);
  // 2. Streak clouds.
  blit(cache.streaks);
  // 3. Sun, screen-fixed, half sunk behind the first cloud band.
  const sx = 0.84 * width;
  const sy = 0.682 * height;
  const glowR = 120 * s;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  glow.addColorStop(0, `rgba(${AL.sunGlowRgb}, 0.85)`);
  glow.addColorStop(1, `rgba(${AL.sunGlowRgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
  // 4–5. Yushan range and cypress.
  blit(cache.range);
  blit(cache.cypress);
  // Core disc after the range so the sun sits in front of the far ridges.
  ctx.fillStyle = AL.sunCore;
  ctx.beginPath();
  ctx.arc(sx, sy, 32 * s, 0, Math.PI * 2);
  ctx.fill();
  // 6. Cloud sea, far to near.
  for (const b of cache.clouds) blit(b);
}

// ------------------------------------------------------------------ walls

let treeTile: { key: string; canvas: AnyCanvas | null } | null = null;

/** The 22 × 34 design-px cypress tile, at device resolution. */
function treeTileFor(height: number, dpr: number): AnyCanvas | null {
  const scale = (height / DESIGN_H) * dpr;
  const w = Math.max(4, Math.round(22 * scale));
  const h = Math.max(6, Math.round(34 * scale));
  const key = `${w}|${h}`;
  if (!treeTile || treeTile.key !== key) {
    const made = makeCanvas(w, h);
    if (made && typeof Path2D !== "undefined") {
      const c = made.ctx;
      c.setTransform(w / 22, 0, 0, h / 34, 0, 0);
      c.fillStyle = AL.treeTexture;
      c.globalAlpha = 0.42;
      c.fill(new Path2D("M11,2 L6,13 H9 L4,24 H10 V31 H12 V24 H18 L13,13 H16 Z"));
      c.globalAlpha = 0.3;
      c.fill(new Path2D("M0,19 L-3,25 H0 L-2,31 H3 L1,25 H3 Z"));
      c.fill(new Path2D("M22,19 L19,25 H22 L20,31 H25 L23,25 H25 Z"));
    }
    treeTile = { key, canvas: made?.canvas ?? null };
  }
  return treeTile.canvas;
}

/** A soft horizontal band: alpha 0 → peak → 0 over `h` centred at `cy`. */
function softBand(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  cy: number,
  h: number,
  rgbStr: string,
  peak: number,
): void {
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  g.addColorStop(0, `rgba(${rgbStr}, 0)`);
  g.addColorStop(0.5, `rgba(${rgbStr}, ${peak})`);
  g.addColorStop(1, `rgba(${rgbStr}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x0, cy - h / 2, x1 - x0, h);
}

/**
 * One gate's cypress walls, inside the exact smooth wall polygons and
 * nowhere past [x0, x1]. The tree texture is anchored at `x0 - xStart` so
 * it scrolls 1:1 with the gate.
 */
export function drawAlishanWalls(args: {
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

  const tile = treeTileFor(height, dpr);
  let pattern: CanvasPattern | null = null;
  if (tile && typeof ctx.createPattern === "function") {
    pattern = ctx.createPattern(tile as CanvasImageSource, "repeat");
    if (pattern && typeof DOMMatrix !== "undefined" && typeof pattern.setTransform === "function") {
      const k = 1 / dpr;
      pattern.setTransform(new DOMMatrix().translate(x0 - xStart, 0).scale(k, k));
    }
  }

  const walls = [
    {
      edge: top,
      isBottom: false,
      path: () => topWallPath(ctx, top, x0, x1),
      grad: [0, 0.519 * height, AL.wallTop] as const,
    },
    {
      edge: bottom,
      isBottom: true,
      path: () => bottomWallPath(ctx, bottom, x0, x1, height),
      grad: [0.544 * height, height, AL.wallBottom] as const,
    },
  ];

  const strokeEdge = (edge: readonly Pt[]) => {
    ctx.beginPath();
    ctx.moveTo(edge[0].x, edge[0].y);
    appendSmooth(ctx, edge);
    ctx.stroke();
  };

  for (const { edge, isBottom, path, grad } of walls) {
    if (edge.length === 0) continue;
    ctx.save();
    path();
    ctx.clip();
    // 1. Base gradient, anchored in screen y.
    ctx.fillStyle = stops(ctx.createLinearGradient(0, grad[0], 0, grad[1]), grad[2]);
    ctx.fillRect(x0, 0, x1 - x0, height);
    // 2. Cypress texture.
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(x0, 0, x1 - x0, height);
    }
    // 3. Inner glow along the edge (only the inner half shows).
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = size(30);
    ctx.strokeStyle = isBottom ? `rgba(${AL.glowBottomRgb}, 0.5)` : `rgba(${AL.glowTopRgb}, 0.45)`;
    strokeEdge(edge);
    // 4. Mist.
    if (isBottom) {
      const m0 = 0.79 * height;
      const mist = ctx.createLinearGradient(0, m0, 0, height);
      mist.addColorStop(0, `rgba(${AL.mistRgb}, 0)`);
      mist.addColorStop(1, `rgba(${AL.mistRgb}, 0.95)`);
      ctx.fillStyle = mist;
      ctx.fillRect(x0, m0, x1 - x0, height - m0);
      softBand(ctx, x0, x1, 0.89 * height, 60 * s, AL.mistBandRgb, 0.4);
    } else {
      softBand(ctx, x0, x1, 0.23 * height, 60 * s, AL.mistBandRgb, 0.4);
    }
    ctx.restore();

    // 5. Outline and gold rim, last, full opacity, limited to [x0, x1].
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, height);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = AL.outline;
    ctx.lineWidth = size(3.2);
    strokeEdge(edge);
    ctx.strokeStyle = AL.rim;
    ctx.lineWidth = size(1.3);
    ctx.stroke();
    ctx.restore();
  }
}

/** Drops the caches. Tests use it; nothing else needs to. */
export function resetAlishanTheme(): void {
  backdrop = null;
  treeTile = null;
}
