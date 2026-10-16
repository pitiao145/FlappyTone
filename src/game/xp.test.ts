import { describe, expect, it } from "vitest";
import { levelFor, levelThreshold, runXp, totalXp, xpFrom } from "./xp.ts";

const tone = (attempts: number, accSum: number) => ({ attempts, unheard: 0, accSum, best: 0 });
const runTone = (gates: number, accSum: number) => ({ gates, accSum, unheard: 0, mismatched: 0, mismatchedAs: {}, best: 0 });

describe("xp", () => {
  it("rewards accuracy far more than showing up", () => {
    expect(xpFrom(10, 0)).toBe(20);
    expect(xpFrom(10, 10)).toBe(100);
    expect(xpFrom(10, 9) - xpFrom(10, 5)).toBe(32);
  });

  it("sums single tones and pair combos", () => {
    const store = {
      lifetimePerTone: { 1: tone(10, 5), 2: tone(0, 0), 3: tone(0, 0), 4: tone(0, 0) },
      lifetimePerCombo: { "3-2": tone(5, 5) },
    };
    expect(totalXp(store)).toBe(xpFrom(15, 10));
  });

  it("a run's XP uses the same formula", () => {
    const perTone = { 1: runTone(4, 2), 2: runTone(0, 0), 3: runTone(0, 0), 4: runTone(0, 0) };
    expect(runXp({ perTone, perCombo: {} } as never)).toBe(xpFrom(4, 2));
  });

  it("levels: 1 at 0 XP, thresholds rise, progress fields add up", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(levelThreshold(2) - 1).level).toBe(1);
    expect(levelFor(levelThreshold(2)).level).toBe(2);
    const l = levelFor(1000);
    expect(l.intoLevel + l.toNext).toBe(l.levelSpan);
    for (let n = 2; n < 20; n++) expect(levelThreshold(n + 1) - levelThreshold(n)).toBeGreaterThan(levelThreshold(n) - levelThreshold(n - 1));
  });

  it("is stingy: a ~20-gate run at 70% is about 150 XP, under a level-3 climb", () => {
    expect(xpFrom(20, 14)).toBe(152);
    expect(levelThreshold(3)).toBeGreaterThan(700);
  });
});
