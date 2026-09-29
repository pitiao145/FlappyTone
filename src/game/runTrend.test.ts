import { describe, expect, it } from "vitest";
import { buildRunLogEntry, dailyTrend, trendKeys } from "./runTrend.ts";
import type { RunStats } from "./scoring.ts";

const tone = (gates: number, accSum: number) => ({ gates, accSum, unheard: 0, mismatched: 0, mismatchedAs: {}, best: 0 });
const stats = {
  score: 1234.4,
  perTone: { 1: tone(0, 0), 2: tone(3, 2.4), 3: tone(0, 0), 4: tone(1, 1.2) },
  perCombo: { "3-2": { gates: 1, accSum: 0.6, unheard: 0 } },
} as unknown as RunStats;

describe("buildRunLogEntry", () => {
  it("keys tones '1'..'4' and combos '3-2', skips unplayed keys, averages over scored gates", () => {
    const e = buildRunLogEntry(stats, "game", "quit");
    expect(Object.keys(e.per_key).sort()).toEqual(["2", "3-2", "4"]);
    expect(e.per_key["4"].accSum).toBe(1); // clamped to gates
    expect(e.gates).toBe(5);
    expect(e.score).toBe(1234);
    expect(e.tone_acc).toBeCloseTo((2.4 + 1 + 0.6) / 5);
    expect(e.outcome).toBe("quit");
  });

  it("has null accuracy and no keys when nothing was scored", () => {
    const empty = { score: 0, perTone: { 1: tone(0, 0), 2: tone(0, 0), 3: tone(0, 0), 4: tone(0, 0) }, perCombo: {} } as unknown as RunStats;
    const e = buildRunLogEntry(empty, "drill", "restart");
    expect(e.tone_acc).toBeNull();
    expect(e.per_key).toEqual({});
    expect(e.gates).toBe(0);
  });
});

describe("dailyTrend", () => {
  const rows: { day: string; per_key: Record<string, { gates: number; accSum: number }> }[] = [
    { day: "2026-09-02", per_key: { "2": { gates: 1, accSum: 0.5 } } },
    { day: "2026-09-01", per_key: { "2": { gates: 3, accSum: 3 }, "3-2": { gates: 2, accSum: 1 } } },
    { day: "2026-09-01", per_key: { "2": { gates: 1, accSum: 0 } } },
  ];

  it("sums per day weighted by gates, oldest first", () => {
    const t = dailyTrend(rows).get("2")!;
    expect(t.map((p) => p.day)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(t[0]).toEqual({ day: "2026-09-01", accuracy: 3 / 4, gates: 4 });
    expect(t[1].accuracy).toBe(0.5);
  });

  it("only has keys with data, tones before combos", () => {
    expect(trendKeys(dailyTrend(rows))).toEqual(["2", "3-2"]);
    expect(dailyTrend([]).size).toBe(0);
  });
});
