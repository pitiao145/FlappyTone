import { describe, expect, it } from "vitest";
import {
  averageInPeriod,
  averageUpTo,
  keysWithData,
  monthsAgo,
  SHAPE_POINTS,
  ShapeAccumulator,
  shapeKey,
  shapeOfUtterance,
  type ShapeRow,
} from "./playerShape.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import type { ContourPoint } from "./contours.ts";
import type { Tone } from "./gates.ts";

const ramp = (from: number, to: number, ms = 400, step = 10): ContourPoint[] =>
  Array.from({ length: ms / step + 1 }, (_, i) => ({ tMs: i * step, chao: from + ((to - from) * i * step) / ms }));
const row = (key: string, day: string, v: number, count: number): ShapeRow => ({
  key,
  day,
  sum: new Array(SHAPE_POINTS).fill(v * count),
  count,
});

describe("shapeKey", () => {
  it("uses tone_accuracy_stats' target format", () => {
    expect(shapeKey([2])).toBe("2");
    expect(shapeKey([3, 2])).toBe("3-2");
  });
  it("stores no neutral combo and nothing past two syllables", () => {
    expect(shapeKey([3, 0 as Tone])).toBeNull();
    expect(shapeKey([0 as Tone])).toBeNull();
    expect(shapeKey([1, 2, 3])).toBeNull();
  });
});

describe("shapeOfUtterance", () => {
  it("is on the same 61-point grid as Jane's averages", () => {
    expect(SHAPE_POINTS).toBe(AVERAGED_TONE_SHAPE[1].length);
    expect(shapeOfUtterance(ramp(1, 5))).toHaveLength(61);
  });
  it("is time-normalised: the same shape said slower gives the same line", () => {
    const a = shapeOfUtterance(ramp(1, 5, 400))!;
    const b = shapeOfUtterance(ramp(1, 5, 800))!;
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  });
  it("ends where the voice ends and keeps the direction", () => {
    const l = shapeOfUtterance(ramp(4.5, 1.2))!;
    expect(l[60]).toBeCloseTo(1.2, 6);
    expect(l[0]).toBeGreaterThan(l[60]);
  });
  it("has no shape for fewer than two points", () => {
    expect(shapeOfUtterance([{ tMs: 0, chao: 3 }])).toBeNull();
  });
});

describe("ShapeAccumulator", () => {
  it("sums per key and counts attempts", () => {
    const acc = new ShapeAccumulator();
    expect(acc.add([1], ramp(4, 4))).toBe(true);
    expect(acc.add([1], ramp(5, 5))).toBe(true);
    expect(acc.add([3, 2], ramp(2, 4))).toBe(true);
    const out = acc.drain();
    const t1 = out.find((b) => b.key === "1")!;
    expect(t1.count).toBe(2);
    t1.sum.forEach((v) => expect(v).toBeCloseTo(9, 6));
    expect(out.find((b) => b.key === "3-2")!.count).toBe(1);
  });
  it("skips neutral combos and empty utterances", () => {
    const acc = new ShapeAccumulator();
    expect(acc.add([3, 0 as Tone], ramp(2, 4))).toBe(false);
    expect(acc.add([2], [])).toBe(false);
    expect(acc.size).toBe(0);
  });
  it("drain empties it", () => {
    const acc = new ShapeAccumulator();
    acc.add([4], ramp(5, 1));
    acc.drain();
    expect(acc.drain()).toEqual([]);
  });
});

describe("averages", () => {
  const rows = [
    row("2", "2026-08-01", 2, 10), // August
    row("2", "2026-08-20", 3, 10),
    row("2", "2026-09-10", 4, 20), // September
    row("3", "2026-09-10", 1, 5),
  ];

  it("average up to a day weights by count, inclusive of that day", () => {
    expect(averageUpTo(rows, "2", "2026-08-20")).toEqual({
      line: new Array(61).fill(2.5),
      count: 20,
    });
    const all = averageUpTo(rows, "2", "2026-09-30")!;
    expect(all.count).toBe(40);
    expect(all.line[0]).toBeCloseTo((20 + 30 + 80) / 40, 9);
  });

  it("average in a period only uses rows in range", () => {
    const sep = averageInPeriod(rows, "2", "2026-09-01", "2026-09-30")!;
    expect(sep.count).toBe(20);
    expect(sep.line[30]).toBeCloseTo(4, 9);
  });

  it("is null when nothing is in range or the key has no data", () => {
    expect(averageUpTo(rows, "2", "2026-07-31")).toBeNull();
    expect(averageUpTo(rows, "4", "2026-09-30")).toBeNull();
  });

  it("keeps keys separate", () => {
    expect(averageUpTo(rows, "3", "2026-09-30")!.line[0]).toBeCloseTo(1, 9);
  });

  it("lists keys with data, tones before combos", () => {
    expect(keysWithData([...rows, row("3-2", "2026-09-10", 3, 1)])).toEqual(["2", "3", "3-2"]);
  });
});

describe("monthsAgo", () => {
  it("steps back whole months and clamps to the month's end", () => {
    expect(monthsAgo(1, new Date(2026, 8, 28))).toBe("2026-08-28");
    expect(monthsAgo(2, new Date(2026, 0, 15))).toBe("2025-11-15");
    expect(monthsAgo(1, new Date(2026, 2, 31))).toBe("2026-02-28");
  });
});
