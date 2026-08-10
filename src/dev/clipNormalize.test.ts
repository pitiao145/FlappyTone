import { describe, expect, it } from "vitest";
import {
  applyChaoMap,
  chaoMapFor,
  cohortSpan,
  pinnedFractionOf,
  polylineSpan,
} from "./clipNormalize.ts";
import { templateContour, type ContourPoint } from "./clipCut.ts";
import { DEFAULT_POLYLINES } from "../game/tuning.ts";

/** A contour sampled from a function, at the hop rate clipCut measures at. */
function contourOf(f: (t: number) => number, n = 40): ContourPoint[] {
  return Array.from({ length: n }, (_, i) => [i / (n - 1), f(i / (n - 1))] as ContourPoint);
}

describe("cohortSpan", () => {
  it("trims the extremes rather than taking min and max", () => {
    // 100 points at 3, plus one creak frame at 0.2 and one octave error at 9.
    const contours: ContourPoint[][] = [
      [
        ...Array.from({ length: 100 }, (_, i) => [i / 100, 3] as ContourPoint),
        [0.5, 0.2],
        [0.6, 9],
      ],
    ];
    const span = cohortSpan(contours);
    expect(span.low).toBe(3);
    expect(span.high).toBe(3);
  });

  it("pools across every clip of the cohort", () => {
    const span = cohortSpan([contourOf(() => 2), contourOf(() => 4)]);
    expect(span.low).toBeCloseTo(2, 5);
    expect(span.high).toBeCloseTo(4, 5);
  });
});

describe("chaoMapFor", () => {
  it("stretches a cohort onto its target span", () => {
    const map = chaoMapFor({ low: 2, high: 3 }, { low: 1.25, high: 5 });
    expect(map.a * 2 + map.b).toBeCloseTo(1.25, 5);
    expect(map.a * 3 + map.b).toBeCloseTo(5, 5);
  });

  it("offsets without scaling when the target is a level tone", () => {
    // T1's corridor is flat: there is no span to stretch onto, only a height.
    const map = chaoMapFor({ low: 2.9, high: 3.5 }, polylineSpan(DEFAULT_POLYLINES[1]));
    expect(map.a).toBe(1);
    expect(map.a * 3.2 + map.b).toBeCloseTo(4.584, 5);
  });

  it("offsets without scaling when the cohort itself is flat", () => {
    // Dividing by a zero spread would send every clip to ±Infinity.
    const map = chaoMapFor({ low: 3, high: 3 }, { low: 1, high: 5 });
    expect(map.a).toBe(1);
    expect(Number.isFinite(map.b)).toBe(true);
  });
});

describe("applyChaoMap", () => {
  it("clamps into the playable band", () => {
    const mapped = applyChaoMap(
      [
        [0, 0],
        [0.5, 3],
        [1, 9],
      ],
      { a: 1, b: 0 },
    );
    expect(mapped.map((p) => p[1])).toEqual([1, 3, 5]);
  });

  it("leaves the timeline untouched", () => {
    const contour = contourOf((t) => 2 + t);
    expect(applyChaoMap(contour, { a: 2, b: -1 }).map((p) => p[0])).toEqual(
      contour.map((p) => p[0]),
    );
  });
});

describe("pinnedFractionOf", () => {
  it("counts only the points against an edge", () => {
    expect(
      pinnedFractionOf([
        [0, 1],
        [0.5, 3],
        [1, 5],
      ]),
    ).toBeCloseTo(2 / 3, 5);
  });
});

describe("the whole placement, on tone-shaped cohorts", () => {
  /**
   * Jane's measured levels, in the wide measurement range: a T1 that sits just
   * above her mid, and a T4 whose plateau is far above it. Raw, a corridor
   * built from the first would sit mid-board — the defect this module exists
   * to fix.
   */
  const t1 = [contourOf(() => 3.2), contourOf(() => 3.35), contourOf(() => 3.05)];
  const t4 = [
    contourOf((t) => (t < 0.6 ? 4.2 : 4.2 - ((t - 0.6) / 0.3) * 1.9)),
    contourOf((t) => (t < 0.6 ? 4.0 : 4.0 - ((t - 0.6) / 0.3) * 1.8)),
  ];

  it("puts a level tone at the height the tone mark says, not where she sang it", () => {
    const map = chaoMapFor(cohortSpan(t1), polylineSpan(DEFAULT_POLYLINES[1]));
    for (const c of t1) {
      for (const [, chao] of applyChaoMap(c, map)) expect(chao).toBeGreaterThan(4.3);
    }
  });

  it("keeps the differences between words of the same tone", () => {
    const map = chaoMapFor(cohortSpan(t1), polylineSpan(DEFAULT_POLYLINES[1]));
    const [a, b] = [applyChaoMap(t1[0], map)[0][1], applyChaoMap(t1[1], map)[0][1]];
    expect(b - a).toBeCloseTo(0.15, 5);
  });

  it("keeps a T4 plateau flat and its cliff steep", () => {
    const map = chaoMapFor(cohortSpan(t4), polylineSpan(DEFAULT_POLYLINES[4]));
    const mapped = applyChaoMap(t4[0], map);
    const plateau = mapped.filter((p) => p[0] < 0.5).map((p) => p[1]);
    expect(Math.max(...plateau) - Math.min(...plateau)).toBeLessThan(0.05);
    expect(mapped[mapped.length - 1][1]).toBeLessThan(2);
  });

  it("survives templating with its shape intact", () => {
    // A slight rise through the "plateau" (real contours never hold an exact
    // tie) so the true maximum sits near where the fall begins, at t≈0.6.
    const rising = contourOf((t) =>
      t < 0.6 ? 4.0 + t * 0.1 : 4.06 - ((t - 0.6) / 0.3) * 1.8,
    );
    const map = chaoMapFor(cohortSpan(t4), polylineSpan(DEFAULT_POLYLINES[4]));
    const poly = templateContour(4, applyChaoMap(rising, map));
    expect(poly.length).toBe(3);
    expect(poly[0][0]).toBe(0);
    expect(poly[poly.length - 1][0]).toBe(1);
    // A plateau then a cliff: still high at 0.5, still low at the end.
    const at = (t: number) => {
      for (let i = 0; i < poly.length - 1; i++) {
        if (t >= poly[i][0] && t <= poly[i + 1][0]) {
          const f = (t - poly[i][0]) / (poly[i + 1][0] - poly[i][0] || 1);
          return poly[i][1] + f * (poly[i + 1][1] - poly[i][1]);
        }
      }
      return poly[poly.length - 1][1];
    };
    expect(at(0.5)).toBeGreaterThan(4);
    expect(at(1)).toBeLessThan(2);
  });
});
