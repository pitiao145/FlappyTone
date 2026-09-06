/**
 * `mergeAggregates` is the one function in the sync path that can destroy
 * something irreplaceable. Everything else fails loudly or fails safe; a merge
 * bug quietly returns a smaller number and a player's practice is gone with no
 * error anywhere. So it is pure, and it is tested directly.
 */
import { describe, expect, it } from "vitest";

import { EMPTY_AGGREGATES, mergeAggregates, type Aggregates } from "./account.ts";

function aggregates(over: Partial<Aggregates> = {}): Aggregates {
  return { ...EMPTY_AGGREGATES, ...over };
}

describe("mergeAggregates", () => {
  it("keeps the larger of every scalar", () => {
    const a = aggregates({ bestScore: 1200, totalRuns: 3, totalGates: 40, streakBest: 5 });
    const b = aggregates({ bestScore: 900, totalRuns: 11, totalGates: 12, streakBest: 2 });
    expect(mergeAggregates(a, b)).toMatchObject({
      bestScore: 1200,
      totalRuns: 11,
      totalGates: 40,
      streakBest: 5,
    });
  });

  it("is symmetric — neither side is privileged", () => {
    const a = aggregates({ bestScore: 1200, totalRuns: 3 });
    const b = aggregates({ bestScore: 900, totalRuns: 11 });
    expect(mergeAggregates(a, b)).toEqual(mergeAggregates(b, a));
  });

  it("unions tones present on only one side", () => {
    const a = aggregates({
      perTone: [{ tone: 1, attempts: 10, unheard: 1, accSum: 7, best: 0.9 }],
    });
    const b = aggregates({
      perTone: [{ tone: 3, attempts: 4, unheard: 0, accSum: 2, best: 0.5 }],
    });
    const merged = mergeAggregates(a, b);
    expect(merged.perTone.map((t) => t.tone)).toEqual([1, 3]);
  });

  it("merges a tone held by both, field by field", () => {
    const a = aggregates({
      perTone: [{ tone: 2, attempts: 20, unheard: 5, accSum: 14, best: 0.6 }],
    });
    const b = aggregates({
      perTone: [{ tone: 2, attempts: 8, unheard: 7, accSum: 18, best: 0.95 }],
    });
    expect(mergeAggregates(a, b).perTone[0]).toEqual({
      tone: 2,
      attempts: 20,
      unheard: 7,
      accSum: 18,
      best: 0.95,
    });
  });

  it("never returns less than either input — the property that actually matters", () => {
    const a = aggregates({
      bestScore: 500,
      totalRuns: 9,
      perTone: [{ tone: 4, attempts: 3, unheard: 0, accSum: 2, best: 0.7 }],
    });
    const merged = mergeAggregates(a, EMPTY_AGGREGATES);
    expect(merged.bestScore).toBeGreaterThanOrEqual(a.bestScore);
    expect(merged.totalRuns).toBeGreaterThanOrEqual(a.totalRuns);
    expect(merged.perTone[0].best).toBeGreaterThanOrEqual(a.perTone[0].best);
  });

  it("returns tones in a stable order regardless of input order", () => {
    const a = aggregates({
      perTone: [
        { tone: 4, attempts: 1, unheard: 0, accSum: 0, best: 0 },
        { tone: 1, attempts: 1, unheard: 0, accSum: 0, best: 0 },
      ],
    });
    expect(mergeAggregates(a, EMPTY_AGGREGATES).perTone.map((t) => t.tone)).toEqual([1, 4]);
  });
});
