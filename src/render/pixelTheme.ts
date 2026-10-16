/**
 * The "Pixel Flappy" theme (brief 06): a Taiwan pixel-art parallax backdrop
 * and mountain-textured gate walls.
 *
 * Two halves. The builders (`build*`, `wallMask`) are pure: they paint an
 * `Art` — one art pixel per array cell — and never touch a canvas, so they
 * run under the tests. The blitters turn an `Art` into an offscreen canvas
 * once and, per frame, only `drawImage` it, nearest-neighbour, at the device
 * cell scale.
 *
 * The cell is fixed in DEVICE pixels (`deviceCell`), and its logical size is
 * that divided by the DPR. A cell picked in logical px first would land on a
 * fractional device size at DPR 2.625, and rounding it would drift the walls
 * off the collision edge by ~1 device px per row. This way every cell is a
 * square, integer number of device pixels and the wall rows still sit on the
 * exact logical edge the collision reads.
 */

import { tuning } from "../game/tuning.ts";

type LayerName = "clouds" | "far" | "near" | "skyline" | "lowland";

const PARALLAX_FIELD = {
  clouds: "pixelKClouds",
  far: "pixelKFar",
  near: "pixelKNear",
  skyline: "pixelKSkyline",
  lowland: "pixelKLowland",
} as const;
import { PIXEL_FLAPPY as PF } from "./palette.ts";

// ---------------------------------------------------------------- art grid

/** An RGBA pixel grid, one entry per art pixel. */
export interface Art {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function makeArt(w: number, h: number): Art {
  return { w, h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) };
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint one art pixel, alpha-composited over what is there. Out of range is ignored. */
export function plot(art: Art, x: number, y: number, hex: string, alpha = 1): void {
  if (x < 0 || y < 0 || x >= art.w || y >= art.h) return;
  const i = (y * art.w + x) * 4;
  const [r, g, b] = hexRgb(hex);
  const d = art.data;
  const da = d[i + 3] / 255;
  const oa = alpha + da * (1 - alpha);
  if (oa <= 0) return;
  d[i] = (r * alpha + d[i] * da * (1 - alpha)) / oa;
  d[i + 1] = (g * alpha + d[i + 1] * da * (1 - alpha)) / oa;
  d[i + 2] = (b * alpha + d[i + 2] * da * (1 - alpha)) / oa;
  d[i + 3] = oa * 255;
}

function fillCells(art: Art, x0: number, y0: number, w: number, h: number, hex: string, alpha = 1): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) plot(art, x, y, hex, alpha);
}

/** `[r, g, b, a]` at an art pixel. For tests. */
export function pixelAt(art: Art, x: number, y: number): [number, number, number, number] {
  const i = (y * art.w + x) * 4;
  return [art.data[i], art.data[i + 1], art.data[i + 2], art.data[i + 3]];
}

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

// ------------------------------------------------------------------- cells

/** The art pixel size in device px: square and integer at any DPR. */
export function deviceCell(height: number, dpr: number): number {
  const div = tuning().pixelCellDivisor;
  return Math.max(Math.round(2 * dpr), Math.round((height * dpr) / div), 1);
}

/** Art row of a height fraction. */
function rowOf(frac: number, height: number, cell: number): number {
  return Math.round((frac * height) / cell);
}

// --------------------------------------------------------------- builders

/**
 * A stepped ridge silhouette, periodic over `w`: a sum of sines whose
 * frequencies are whole cycles per tile, so column 0 and column `w` are the
 * same height and the wrap has no seam.
 */
export function buildRidge(
  w: number,
  rows: number,
  topRow: number,
  bottomRow: number,
  hex: string,
  harmonics: ReadonlyArray<[cycles: number, amp: number, phase: number]>,
): Art {
  const art = makeArt(w, rows);
  const total = harmonics.reduce((s, [, a]) => s + a, 0) || 1;
  for (let x = 0; x < w; x++) {
    let v = 0;
    for (const [c, a, p] of harmonics) v += a * Math.sin((2 * Math.PI * c * x) / w + p);
    const n = (v / total + 1) / 2; // 0..1
    const top = Math.round(bottomRow - n * (bottomRow - topRow));
    for (let y = top; y < rows; y++) plot(art, x, y, hex);
  }
  return art;
}

const CLOUD_ROWS: ReadonlyArray<[number, number]> = [
  [5, 11],
  [2, 15],
  [0, 18],
  [1, 17],
];

export function buildClouds(w: number, rows: number, height: number, cell: number): Art {
  const art = makeArt(w, rows);
  const spots: ReadonlyArray<[number, number, number]> = [
    [0.06, 0.27, 1],
    [0.42, 0.37, 0.9],
    [0.72, 0.31, 1],
  ];
  for (const [fx, fy, alpha] of spots) {
    const x0 = Math.round(fx * w);
    const y0 = rowOf(fy, height, cell);
    CLOUD_ROWS.forEach(([a, b], r) => {
      const hex = r === CLOUD_ROWS.length - 1 ? PF.cloudShade : PF.cloud;
      // Wrap inside the tile, so a cloud near the end is never cut off.
      for (let x = a; x < b; x++) plot(art, (x0 + x) % w, y0 + r, hex, alpha);
    });
  }
  return art;
}

/**
 * Taipei 101, base centred on `cx`, standing on `baseRow` (exclusive). 6 wide
 * at the base, 53 tall: a 4-row podium, 8 pagoda sections (4 body rows that
 * flare out by one cell at the top, then a belt), a stepped taper, a spire.
 */
export function drawTaipei101(art: Art, cx: number, baseRow: number): void {
  let y = baseRow;
  const left = cx - 3;
  const body = (w: number, rowsN: number): void => {
    const x0 = cx - w / 2;
    for (let r = 0; r < rowsN; r++) {
      y -= 1;
      for (let x = 0; x < w; x++) plot(art, x0 + x, y, x < w / 2 ? PF.towerLit : PF.towerShade);
      // Faint window grid on the body.
      for (let x = 1; x < w - 1; x += 2) if (r % 2 === 0) plot(art, x0 + x, y, PF.window, 0.45);
    }
  };
  body(6, 4); // podium
  for (let s = 0; s < 8; s++) {
    body(6, 2);
    body(8, 2);
    y -= 1;
    fillCells(art, left, y, 6, 1, PF.towerBelt);
  }
  body(4, 3); // taper
  body(2, 2);
  fillCells(art, cx - 1, y - 4, 2, 4, PF.towerBelt); // spire
}

/** Rows Taipei 101 occupies, so tests can pin its height. */
export const TAIPEI_101_ROWS = 4 + 8 * 5 + 3 + 2 + 4;

export function buildSkyline(w: number, rows: number, height: number, cell: number): Art {
  const art = makeArt(w, rows);
  const base = rowOf(0.868, height, cell);
  const rand = rng(101);
  const towerX = Math.round(w * 0.62);
  let x = 4;
  while (x < w - 10) {
    // Keep clear of the tower so its silhouette reads on its own.
    if (Math.abs(x - towerX) < 12) {
      x = towerX + 12;
      continue;
    }
    const n = 3 + Math.floor(rand() * 2);
    for (let b = 0; b < n && x < w - 6; b++) {
      const bw = 3 + Math.floor(rand() * 3);
      const bh = 5 + Math.floor(rand() * 7);
      fillCells(art, x, base - bh, bw, bh, PF.skyline);
      for (let wy = base - bh + 1; wy < base - 1; wy += 2)
        for (let wx = x + 1; wx < x + bw - 1; wx += 2) plot(art, wx, wy, PF.window, 0.85);
      x += bw;
    }
    x += 6 + Math.floor(rand() * 10);
  }
  drawTaipei101(art, towerX, base);
  return art;
}

export function buildLowland(w: number, rows: number, height: number, cell: number): Art {
  const art = makeArt(w, rows);
  const top = rowOf(0.868, height, cell);
  fillCells(art, 0, top, w, rows - top, PF.lowland);
  fillCells(art, 0, top, w, 1, PF.lowlandEdge);
  const rand = rng(7);
  for (let i = 0; i < Math.round(w / 8); i++) {
    const tx = Math.floor(rand() * (w - 2));
    const ty = top + 2 + Math.floor(rand() * Math.max(1, rows - top - 3));
    fillCells(art, tx, ty, 2, 1, PF.tuft);
  }
  return art;
}

/** The ground strip, its own rows only (row 0 = its top). Notches every 4 cells. */
export function buildGround(w: number, rows: number): Art {
  const art = makeArt(w, rows);
  fillCells(art, 0, 0, w, 1, PF.grassHi);
  fillCells(art, 0, 1, w, 1, PF.grass);
  fillCells(art, 0, 2, w, rows - 2, PF.sand);
  for (let x = 0; x < w; x += 4) {
    plot(art, x, 0, PF.grassNotch);
    plot(art, x, 1, PF.grassNotch);
  }
  return art;
}

export function buildSun(): Art {
  const art = makeArt(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const dx = x - 3.5;
      const dy = y - 3.5;
      if (dx * dx + dy * dy <= 16.5) plot(art, x, y, PF.sun);
    }
  return art;
}

/** The forest tile's plus-shaped tree blobs, (col, row) in a 6x6 cell tile. */
export const FOREST_CELLS: ReadonlyArray<[number, number]> = [
  [1, 0], [0, 1], [1, 1], [2, 1], [1, 2],
  [4, 3], [3, 4], [4, 4], [5, 4], [4, 5],
];
const FOREST = new Set(FOREST_CELLS.map(([c, r]) => `${c},${r}`));

// ------------------------------------------------------------------- walls

/**
 * One gate's walls as art: `w` columns of one cell each, `rows` rows of the
 * whole canvas. `topRows[i]` cells of wall at the top of column i,
 * `bottomStart[i]` the first wall row at the bottom.
 */
export interface WallMask {
  art: Art;
  topRows: number[];
  bottomStart: number[];
}

/**
 * Wall depth per column, snapped toward the channel. Each column takes the
 * channel-most edge across its whole span (both ends and every sample in
 * between), then rounds outward into the channel: the drawn wall can be up to
 * a cell fatter than the true one, never thinner, so the bird never dies
 * without visibly touching.
 *
 * `top`/`bottom` are the corridor edges in gate-local logical x, screen y.
 */
export function wallColumns(
  top: ReadonlyArray<{ x: number; y: number }>,
  bottom: ReadonlyArray<{ x: number; y: number }>,
  widthPx: number,
  cellPx: number,
  rows: number,
): { topRows: number[]; bottomStart: number[] } {
  const cols = Math.max(1, Math.ceil(widthPx / cellPx - 1e-9));
  const topRows: number[] = [];
  const bottomStart: number[] = [];
  const at = (edge: ReadonlyArray<{ x: number; y: number }>, x: number): number => {
    if (x <= edge[0].x) return edge[0].y;
    for (let i = 1; i < edge.length; i++) {
      if (x <= edge[i].x) {
        const a = edge[i - 1];
        const b = edge[i];
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        return a.y + t * (b.y - a.y);
      }
    }
    return edge[edge.length - 1].y;
  };
  for (let c = 0; c < cols; c++) {
    const xa = c * cellPx;
    const xb = Math.min(widthPx, (c + 1) * cellPx);
    let topY = Math.max(at(top, xa), at(top, xb));
    let botY = Math.min(at(bottom, xa), at(bottom, xb));
    for (const p of top) if (p.x > xa && p.x < xb) topY = Math.max(topY, p.y);
    for (const p of bottom) if (p.x > xa && p.x < xb) botY = Math.min(botY, p.y);
    topRows.push(Math.min(rows, Math.max(0, Math.ceil(topY / cellPx - 1e-9))));
    bottomStart.push(Math.min(rows, Math.max(0, Math.floor(botY / cellPx + 1e-9))));
  }
  return { topRows, bottomStart };
}

/**
 * 4-neighbour distance, in cells, from each wall cell to the nearest open
 * (channel) cell. Columns outside the gate count as open, so the lit rim
 * also wraps the wall's end faces. 0 for open cells.
 */
export function wallDistance(
  topRows: readonly number[],
  bottomStart: readonly number[],
  rows: number,
): Int32Array {
  const w = topRows.length;
  const dist = new Int32Array(w * rows).fill(-1);
  const queue: number[] = [];
  const isWall = (c: number, r: number) => r < topRows[c] || r >= bottomStart[c];
  for (let c = 0; c < w; c++)
    for (let r = 0; r < rows; r++) {
      const i = r * w + c;
      if (!isWall(c, r)) {
        dist[i] = 0;
        queue.push(i);
      } else if (c === 0 || c === w - 1) {
        // Adjacent to an outside column: one step from open space.
        dist[i] = 1;
        queue.push(i);
      }
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const c = i % w;
    const r = (i - c) / w;
    const d = dist[i] + 1;
    const step = (cc: number, rr: number) => {
      if (cc < 0 || cc >= w || rr < 0 || rr >= rows) return;
      const j = rr * w + cc;
      if (dist[j] === -1) {
        dist[j] = d;
        queue.push(j);
      }
    };
    step(c - 1, r);
    step(c + 1, r);
    step(c, r - 1);
    step(c, r + 1);
  }
  return dist;
}

/** Rim colour for a wall cell's distance, or null for base + forest. */
export function rimColor(d: number): string | null {
  if (d === 1) return PF.rim[0];
  if (d === 2) return PF.rim[1];
  if (d >= 3 && d <= 4) return PF.rim[2];
  if (d >= 5 && d <= 6) return PF.rim[3];
  return null;
}

/**
 * Paints a gate's walls. `forestPhase` is the gate's world-x start in cells,
 * so the forest pattern is anchored in the world and scrolls with the wall.
 */
export function wallMask(
  topRows: number[],
  bottomStart: number[],
  rows: number,
  forestPhase: number,
): WallMask {
  const w = topRows.length;
  const art = makeArt(w, rows);
  const dist = wallDistance(topRows, bottomStart, rows);
  for (let c = 0; c < w; c++)
    for (let r = 0; r < rows; r++) {
      const d = dist[r * w + c];
      if (d <= 0) continue;
      const rim = rimColor(d);
      if (rim) {
        plot(art, c, r, rim);
        continue;
      }
      plot(art, c, r, PF.wallBase);
      const fc = (((c + forestPhase) % 6) + 6) % 6;
      if (FOREST.has(`${fc},${r % 6}`)) plot(art, c, r, PF.wallForest, 0.55);
    }
  return { art, topRows, bottomStart };
}

// ----------------------------------------------------------------- blitting

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function toCanvas(art: Art): AnyCanvas | null {
  if (art.w <= 0 || art.h <= 0) return null;
  let canvas: AnyCanvas;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(art.w, art.h);
  else if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = art.w;
    canvas.height = art.h;
  } else return null;
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;
  const img = ctx.createImageData(art.w, art.h);
  img.data.set(art.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The context's device-pixel transform, or the identity where unsupported. */
export function deviceTransform(ctx: CanvasRenderingContext2D): DOMMatrix | { a: number; d: number; e: number; f: number } {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  return m && typeof m.a === "number" ? m : { a: 1, d: 1, e: 0, f: 0 };
}

interface Layer {
  canvas: AnyCanvas | null;
  /** Tile width in device px. */
  tileDev: number;
  k: LayerName;
}

interface BackdropCache {
  key: string;
  cell: number;
  rows: number;
  layers: Layer[];
  sun: AnyCanvas | null;
  ground: AnyCanvas | null;
  groundTileDev: number;
  groundRow: number;
}

let backdrop: BackdropCache | null = null;

function backdropFor(width: number, height: number, dpr: number): BackdropCache {
  const t = tuning();
  const cell = deviceCell(height, dpr);
  const key = `${width}|${height}|${dpr}|${cell}|${t.pixelTileClouds}|${t.pixelTileRidges}|${t.pixelTileSkyline}`;
  if (backdrop && backdrop.key === key) return backdrop;

  const cl = cell / dpr; // logical size of a cell
  const rows = Math.ceil(height / cl);
  const tileCells = (mult: number) => Math.max(24, Math.round((width * mult) / cl));
  const layer = (art: Art, k: Layer["k"]): Layer => ({
    canvas: toCanvas(art),
    tileDev: art.w * cell,
    k,
  });

  const farW = tileCells(t.pixelTileRidges);
  const nearW = tileCells(t.pixelTileRidges);
  const groundRow = rowOf(0.967, height, cl);
  const groundArt = buildGround(64, Math.max(3, rows - groundRow + 1));
  backdrop = {
    key,
    cell,
    rows,
    layers: [
      layer(buildClouds(tileCells(t.pixelTileClouds), rows, height, cl), "clouds"),
      layer(
        buildRidge(farW, rows, rowOf(0.61, height, cl), rowOf(0.69, height, cl), PF.ridgeFar, [
          [2, 1, 0.3],
          [5, 0.45, 1.7],
          [11, 0.2, 4.1],
        ]),
        "far",
      ),
      layer(
        buildRidge(nearW, rows, rowOf(0.72, height, cl), rowOf(0.76, height, cl), PF.ridgeNear, [
          [1, 1, 2.2],
          [3, 0.4, 0.4],
        ]),
        "near",
      ),
      layer(buildSkyline(tileCells(t.pixelTileSkyline), rows, height, cl), "skyline"),
      layer(buildLowland(tileCells(1), rows, height, cl), "lowland"),
    ],
    sun: toCanvas(buildSun()),
    ground: toCanvas(groundArt),
    groundTileDev: groundArt.w * cell,
    groundRow,
  };
  return backdrop;
}

/** Repeat a tile across the canvas from a device-px offset. */
export function tileAcross(
  ctx: CanvasRenderingContext2D,
  img: AnyCanvas,
  tileDev: number,
  offsetDev: number,
  y: number,
  h: number,
  canvasW: number,
): void {
  if (tileDev <= 0) return;
  let x = -(((Math.round(offsetDev) % tileDev) + tileDev) % tileDev);
  for (; x < canvasW; x += tileDev) ctx.drawImage(img as CanvasImageSource, x, y, tileDev, h);
}

/**
 * Layers 1–8: sky bands, sun, clouds, ridges, skyline + Taipei 101, lowland.
 * Call with the context's normal logical transform in place.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldX: number,
): void {
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const cache = backdropFor(width, height, dpr);
  const cell = cache.cell;
  const canvasW = Math.round(width * dpr);
  const canvasH = Math.round(height * dpr);
  const cl = cell / dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // 1. Sky: flat bands, edges on cell rows.
  let y = 0;
  PF.sky.forEach((hex, i) => {
    const end = i < PF.skyStops.length ? rowOf(PF.skyStops[i], height, cl) * cell : canvasH;
    ctx.fillStyle = hex;
    ctx.fillRect(0, y, canvasW, end - y);
    y = end;
  });

  // 2. Sun, fixed in screen space.
  if (cache.sun) {
    const sx = Math.round((0.88 * width) / cl - 4) * cell;
    const sy = (rowOf(0.25, height, cl) - 4) * cell;
    ctx.drawImage(cache.sun as CanvasImageSource, sx, sy, 8 * cell, 8 * cell);
  }

  // 3–8. Parallax layers, farther = slower.
  const t = tuning();
  for (const layer of cache.layers) {
    if (!layer.canvas) continue;
    const factor = t[PARALLAX_FIELD[layer.k]];
    tileAcross(ctx, layer.canvas, layer.tileDev, worldX * factor * dpr, 0, cache.rows * cell, canvasW);
  }

  ctx.restore();
}

/** Layer 10: the ground strip, over the walls, streaming at full speed. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldX: number,
): void {
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const cache = backdropFor(width, height, dpr);
  const cell = cache.cell;
  if (!cache.ground) return;
  const canvasW = Math.round(width * dpr);
  const top = Math.round(cache.groundRow * cell + m.f);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const groundRows = Math.ceil((height * dpr - top) / cell) + 1;
  tileAcross(ctx, cache.ground, cache.groundTileDev, worldX * dpr - m.e, top, groundRows * cell, canvasW + Math.abs(m.e));
  // The cartoon outline above the grass, and the faint line at the sand's top.
  const line = Math.max(1, Math.round(3 * dpr));
  ctx.fillStyle = PF.outline;
  ctx.fillRect(0, top - Math.round(line / 2), canvasW, line);
  ctx.fillStyle = `rgba(${PF.outlineRgb}, 0.35)`;
  ctx.fillRect(0, top + 2 * cell - Math.round(line / 2), canvasW, line);
  ctx.restore();
}

interface WallCache {
  key: string;
  mask: WallMask;
  canvas: AnyCanvas | null;
  cell: number;
}

const wallCache = new WeakMap<object, WallCache>();

/**
 * A gate's pixel walls, painted inside [x0, x1] and nowhere else, fully
 * opaque, with a 3px outline along the stepped edge. `edges` are the gate's
 * corridor edges in screen coordinates (`corridorEdges`); `cacheOwner` is the
 * gate's shape object and `cacheKey` everything that would change its edges.
 */
export function drawPixelWalls(
  ctx: CanvasRenderingContext2D,
  height: number,
  x0: number,
  x1: number,
  xStart: number,
  edges: { top: ReadonlyArray<{ x: number; y: number }>; bottom: ReadonlyArray<{ x: number; y: number }> },
  cacheOwner: object,
  cacheKey: string,
): void {
  const m = deviceTransform(ctx);
  const dpr = m.a || 1;
  const cell = deviceCell(height, dpr);
  const cl = cell / dpr;
  const rows = Math.ceil(height / cl);
  const widthPx = x1 - x0;
  const phase = Math.round(xStart / cl);
  const key = `${cacheKey}|${height}|${dpr}|${cell}|${widthPx.toFixed(2)}|${phase}`;

  let entry = wallCache.get(cacheOwner);
  if (!entry || entry.key !== key) {
    const local = (edge: ReadonlyArray<{ x: number; y: number }>) =>
      edge.map((p) => ({ x: p.x - x0, y: p.y }));
    const { topRows, bottomStart } = wallColumns(local(edges.top), local(edges.bottom), widthPx, cl, rows);
    const mask = wallMask(topRows, bottomStart, rows, phase);
    entry = { key, mask, canvas: toCanvas(mask.art), cell };
    wallCache.set(cacheOwner, entry);
  }
  const { mask } = entry;

  ctx.save();
  // Nothing past x1 or before x0.
  ctx.beginPath();
  ctx.rect(x0, 0, widthPx, height);
  ctx.clip();

  if (entry.canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      entry.canvas as CanvasImageSource,
      Math.round(m.a * x0 + m.e),
      Math.round(m.f),
      mask.art.w * cell,
      rows * cell,
    );
    ctx.restore();
  }

  // Outline along the staircase, drawn as vector at device resolution.
  ctx.strokeStyle = PF.outline;
  ctx.lineWidth = 3;
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  const cols = mask.topRows.length;
  const colX = (c: number) => x0 + Math.min(widthPx, c * cl);
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  for (let c = 0; c < cols; c++) {
    const yy = mask.topRows[c] * cl;
    ctx.lineTo(colX(c), yy);
    ctx.lineTo(colX(c + 1), yy);
  }
  ctx.lineTo(x1, 0);
  ctx.moveTo(x0, height);
  for (let c = 0; c < cols; c++) {
    const yy = mask.bottomStart[c] * cl;
    ctx.lineTo(colX(c), yy);
    ctx.lineTo(colX(c + 1), yy);
  }
  ctx.lineTo(x1, height);
  ctx.stroke();
  ctx.restore();
}

/** Drops the backdrop cache. Tests use it; nothing else needs to. */
export function resetPixelTheme(): void {
  backdrop = null;
}
