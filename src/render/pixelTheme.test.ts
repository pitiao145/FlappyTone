import { describe, expect, it } from "vitest";
import {
  buildGround,
  buildLowland,
  buildRidge,
  buildSkyline,
  deviceCell,
  makeArt,
  pixelAt,
  drawTaipei101,
  TAIPEI_101_ROWS,
  wallColumns,
  wallDistance,
  wallMask,
  rimColor,
} from "./pixelTheme.ts";
import { PIXEL_FLAPPY } from "./palette.ts";

const H = 747;

describe("cells", () => {
  it("are a whole, square number of device px at DPR 1, 2, 2.625, 3", () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      const c = deviceCell(H, dpr);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(2);
    }
    expect(deviceCell(H, 1)).toBe(6);
  });
});

describe("layers tile without a seam", () => {
  // A seamless tile: the last column flows into the first, i.e. the column
  // past the end (computed by the same periodic function) equals column 0.
  it("ridges are periodic over the tile", () => {
    const w = 140;
    const harm: Array<[number, number, number]> = [[2, 1, 0.3], [5, 0.45, 1.7]];
    const a = buildRidge(w, 125, 76, 86, "#a6d8e8", harm);
    const b = buildRidge(w * 2, 125, 76, 86, "#a6d8e8", harm.map(([c, am, p]) => [c * 2, am, p]));
    for (let x = 0; x < w; x++)
      for (let y = 70; y < 90; y++) expect(pixelAt(b, x + w, y)).toEqual(pixelAt(a, x, y));
  });

  it("skyline buildings and lowland stay inside the tile", () => {
    const sky = buildSkyline(210, 125, H, 6);
    const low = buildLowland(70, 125, H, 6);
    for (let y = 0; y < 125; y++) {
      expect(pixelAt(sky, 0, y)[3]).toBe(0);
      expect(pixelAt(sky, sky.w - 1, y)[3]).toBe(0);
      expect(pixelAt(low, 0, y)[3]).toBe(pixelAt(low, low.w - 1, y)[3]);
    }
  });

  it("ground notches repeat every 4 cells", () => {
    const g = buildGround(64, 5);
    for (let x = 0; x < 60; x++) expect(pixelAt(g, x, 1)).toEqual(pixelAt(g, x + 4, 1));
  });
});

describe("Taipei 101", () => {
  it("is 53 cells tall and 6 wide at the base", () => {
    expect(TAIPEI_101_ROWS).toBe(53);
    const art = makeArt(20, 80);
    drawTaipei101(art, 10, 70);
    const filled = (y: number) => {
      let n = 0;
      for (let x = 0; x < 20; x++) if (pixelAt(art, x, y)[3] > 0) n++;
      return n;
    };
    expect(filled(69)).toBe(6);
    expect(filled(70 - 53)).toBeGreaterThan(0);
    expect(filled(70 - 54)).toBe(0);
  });
});

describe("wall mask", () => {
  const cell = 6;
  const rows = 125;
  // A sloping corridor: top edge falls from y=200 to y=300 across 120px.
  const top = Array.from({ length: 61 }, (_, i) => ({ x: i * 2, y: 200 + (i * 2 * 100) / 120 }));
  const bottom = top.map((p) => ({ x: p.x, y: p.y + 150 }));

  it("is never thinner than the true edge, and at most a cell fatter", () => {
    const { topRows, bottomStart } = wallColumns(top, bottom, 120, cell, rows);
    topRows.forEach((r, c) => {
      const xa = c * cell;
      const xb = Math.min(120, xa + cell);
      for (let x = xa; x <= xb; x += 0.5) {
        const trueTop = 200 + (x * 100) / 120;
        expect(r * cell).toBeGreaterThanOrEqual(trueTop - 1e-6);
        expect(r * cell - trueTop).toBeLessThan(cell * 2);
        expect(bottomStart[c] * cell).toBeLessThanOrEqual(trueTop + 150 + 1e-6);
      }
    });
  });

  it("rim bands hug the channel by 4-neighbour distance", () => {
    const topRows = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const bottomStart = topRows.map(() => 100);
    const dist = wallDistance(topRows, bottomStart, rows);
    const w = topRows.length;
    expect(dist[9 * w + 8]).toBe(1);
    expect(dist[8 * w + 8]).toBe(2);
    expect(dist[100 * w + 8]).toBe(1);
    expect(dist[10 * w + 8]).toBe(0);
    const art = wallMask(topRows, bottomStart, rows, 0).art;
    const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
    expect(pixelAt(art, 8, 9)).toEqual(hex(PIXEL_FLAPPY.rim[0]));
    expect(pixelAt(art, 8, 8)).toEqual(hex(PIXEL_FLAPPY.rim[1]));
    expect(pixelAt(art, 8, 50)[3]).toBe(0);
    // Fully opaque wall cells.
    expect(pixelAt(art, 8, 0)[3]).toBe(255);
    expect(rimColor(7)).toBeNull();
  });
});
