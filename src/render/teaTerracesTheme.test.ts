import { describe, expect, it } from "vitest";
import { cableY, GONDOLA_SPANS, hillY, offsetEdge, pylonTop, TOWER_AT } from "./teaTerracesTheme.ts";

describe("tea terraces backdrop", () => {
  const tileW = 840;

  it("hills and the gondola cable are periodic in their tile", () => {
    for (const near of [false, true]) {
      expect(hillY(0, tileW, 0.59, 0.68, near)).toBeCloseTo(hillY(tileW, tileW, 0.59, 0.68, near), 9);
    }
    expect(cableY(0, tileW)).toBeCloseTo(cableY(tileW - 1e-9, tileW), 6);
  });

  it("hills stay inside their ridge band", () => {
    for (let x = 0; x <= tileW; x += 3) {
      const y = hillY(x, tileW, 0.59, 0.68, false);
      expect(y).toBeGreaterThanOrEqual(0.59);
      expect(y).toBeLessThanOrEqual(0.68);
    }
  });

  it("the cable meets every pylon top", () => {
    for (let i = 0; i < GONDOLA_SPANS; i++) {
      expect(cableY((i * tileW) / GONDOLA_SPANS, tileW)).toBeCloseTo(pylonTop(i), 9);
    }
  });

  it("one Taipei 101 per tile", () => {
    expect([TOWER_AT].length).toBe(1);
    expect(TOWER_AT).toBeGreaterThan(0);
    expect(TOWER_AT).toBeLessThan(1);
  });
});

describe("terrace offset", () => {
  // A steep T4-like fall on a bottom edge.
  const edge = Array.from({ length: 41 }, (_, i) => ({ x: i * 5, y: 300 + 200 / (1 + Math.exp(-(i - 20) / 2)) }));

  it("moves each point d along the normal, into the wall", () => {
    for (const down of [true, false]) {
      const off = offsetEdge(edge, 21, down);
      off.forEach((p, i) => {
        expect(Math.hypot(p.x - edge[i].x, p.y - edge[i].y)).toBeCloseTo(21, 6);
        if (down) expect(p.y).toBeGreaterThan(edge[i].y);
        else expect(p.y).toBeLessThan(edge[i].y);
      });
    }
  });

  it("neighbouring terraces keep their spacing on a steep fall (vertical shift does not)", () => {
    const a = offsetEdge(edge, 14, true);
    const b = offsetEdge(edge, 35, true);
    // Distance from the middle (steepest) point of a to the nearest point of b.
    const p = a[20];
    const near = Math.min(...b.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    expect(near).toBeGreaterThan(15);
  });

  it("extends the ends horizontally so the clip decides where a line stops", () => {
    const off = offsetEdge(edge, 14, true, 40);
    expect(off.length).toBe(edge.length + 2);
    expect(off[0].x).toBeLessThan(edge[0].x - 30);
    expect(off[off.length - 1].x).toBeGreaterThan(edge[edge.length - 1].x + 30);
  });
});
