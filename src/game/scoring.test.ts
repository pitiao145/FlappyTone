import { describe, expect, it } from "vitest";
import {
  applyGate,
  comboAfter,
  multiplierFor,
  newRunStats,
  pointsFor,
  scoreGate,
  takeaway,
  toneBreakdown,
  type GateSample,
  type RunStats,
} from "./scoring.ts";
import type { Tone } from "./gates.ts";

function samples(
  n: number,
  voicedFrac: number,
  errOverTol: number,
): GateSample[] {
  const voicedCount = Math.round(n * voicedFrac);
  const out: GateSample[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      errChao: i < voicedCount ? errOverTol : 0,
      tolChao: 1,
      voiced: i < voicedCount,
    });
  }
  return out;
}

describe("scoreGate", () => {
  it("collision always wins, accuracy 0", () => {
    const result = scoreGate(samples(10, 1, 0), true);
    expect(result.outcome).toBe("collision");
    expect(result.accuracy).toBe(0);
  });

  it("collision beats unheard when both apply", () => {
    const result = scoreGate(samples(10, 0.1, 0), true);
    expect(result.outcome).toBe("collision");
  });

  it("unheard when voiced fraction < 0.6", () => {
    const result = scoreGate(samples(10, 0.5, 0), false);
    expect(result.outcome).toBe("unheard");
    expect(result.accuracy).toBe(0);
  });

  it("voiced fraction exactly 0.6 is not unheard", () => {
    const result = scoreGate(samples(10, 0.6, 0), false);
    expect(result.outcome).not.toBe("unheard");
  });

  it("perfect when accuracy >= 0.85", () => {
    // err/tol = 0 -> accuracy 1
    const result = scoreGate(samples(10, 1, 0), false);
    expect(result.outcome).toBe("perfect");
    expect(result.accuracy).toBeCloseTo(1);
  });

  it("good when accuracy in [0.60, 0.85)", () => {
    // err/tol = 0.3 -> accuracy 0.7
    const result = scoreGate(samples(10, 1, 0.3), false);
    expect(result.outcome).toBe("good");
    expect(result.accuracy).toBeCloseTo(0.7);
  });

  it("ok when accuracy below 0.60", () => {
    // err/tol = 0.5 -> accuracy 0.5
    const result = scoreGate(samples(10, 1, 0.5), false);
    expect(result.outcome).toBe("ok");
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it("accuracy is clamped to 0 when error exceeds tolerance", () => {
    const result = scoreGate(samples(10, 1, 2), false);
    expect(result.accuracy).toBe(0);
    expect(result.outcome).toBe("ok");
  });

  it("ignores unvoiced samples' error in the mean", () => {
    // 6 voiced with err/tol 0 (perfect signal), 4 unvoiced with huge err values
    const mixed: GateSample[] = [
      ...Array.from({ length: 6 }, () => ({
        errChao: 0,
        tolChao: 1,
        voiced: true,
      })),
      ...Array.from({ length: 4 }, () => ({
        errChao: 999,
        tolChao: 1,
        voiced: false,
      })),
    ];
    const result = scoreGate(mixed, false);
    expect(result.accuracy).toBeCloseTo(1);
    expect(result.outcome).toBe("perfect");
  });
});

describe("pointsFor", () => {
  it("300/150/50/0/0 base at multiplier x1", () => {
    expect(pointsFor("perfect", 0)).toBe(300);
    expect(pointsFor("good", 0)).toBe(150);
    expect(pointsFor("ok", 0)).toBe(50);
    expect(pointsFor("collision", 0)).toBe(0);
    expect(pointsFor("unheard", 0)).toBe(0);
  });

  it("scales with multiplier", () => {
    expect(pointsFor("perfect", 1)).toBe(450); // x1.5
    expect(pointsFor("perfect", 2)).toBe(600); // x2
    expect(pointsFor("perfect", 3)).toBe(900); // x3
    expect(pointsFor("perfect", 10)).toBe(900); // capped x3
  });

  it("unheard scores 0 regardless of combo", () => {
    expect(pointsFor("unheard", 3)).toBe(0);
  });
});

describe("multiplierFor", () => {
  it("maps combo count to multiplier", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(1)).toBe(1.5);
    expect(multiplierFor(2)).toBe(2);
    expect(multiplierFor(3)).toBe(3);
    expect(multiplierFor(4)).toBe(3);
  });
});

describe("comboAfter", () => {
  it("perfect and good increment combo", () => {
    expect(comboAfter("perfect", 0)).toBe(1);
    expect(comboAfter("good", 1)).toBe(2);
  });

  it("ok and collision reset combo to 0", () => {
    expect(comboAfter("ok", 3)).toBe(0);
    expect(comboAfter("collision", 3)).toBe(0);
  });

  it("unheard leaves combo unchanged", () => {
    expect(comboAfter("unheard", 2)).toBe(2);
    expect(comboAfter("unheard", 0)).toBe(0);
  });
});

describe("newRunStats", () => {
  it("defaults to 3 hearts and zeroed per-tone stats", () => {
    const stats = newRunStats();
    expect(stats.hearts).toBe(3);
    expect(stats.score).toBe(0);
    expect(stats.bestMultiplier).toBe(1);
    for (const tone of [1, 2, 3, 4] as Tone[]) {
      expect(stats.perTone[tone]).toEqual({ gates: 0, accSum: 0, unheard: 0 });
    }
  });

  it("accepts a custom heart count", () => {
    expect(newRunStats(5).hearts).toBe(5);
  });
});

describe("applyGate", () => {
  it("mutate-free: does not modify the input stats object", () => {
    const stats = newRunStats();
    const before = JSON.stringify(stats);
    applyGate(stats, 1, "perfect", 1);
    expect(JSON.stringify(stats)).toBe(before);
  });

  it("perfect gate adds points, increments combo, tallies per-tone", () => {
    const stats = newRunStats();
    const next = applyGate(stats, 1, "perfect", 1);
    expect(next.score).toBe(300);
    expect(next.combo).toBe(1);
    expect(next.hearts).toBe(3);
    expect(next.perTone[1]).toEqual({ gates: 1, accSum: 1, unheard: 0 });
  });

  it("collision decrements hearts and does not count toward per-tone accuracy", () => {
    const stats = newRunStats();
    const next = applyGate(stats, 2, "collision", 0);
    expect(next.hearts).toBe(2);
    expect(next.combo).toBe(0);
    expect(next.score).toBe(0);
    expect(next.perTone[2]).toEqual({ gates: 1, accSum: 0, unheard: 0 });
  });

  it("unheard does not decrement hearts, does not reset combo, and is tallied separately", () => {
    const stats: RunStats = { ...newRunStats(), combo: 2 };
    const next = applyGate(stats, 3, "unheard", 0);
    expect(next.hearts).toBe(3);
    expect(next.combo).toBe(2);
    expect(next.score).toBe(0);
    expect(next.perTone[3]).toEqual({ gates: 0, accSum: 0, unheard: 1 });
  });

  it("tracks bestMultiplier across the run", () => {
    let stats: RunStats = newRunStats();
    stats = applyGate(stats, 1, "perfect", 1); // combo -> 1, mult applied was x1
    stats = applyGate(stats, 1, "perfect", 1); // combo -> 2, mult applied was x1.5
    stats = applyGate(stats, 1, "perfect", 1); // combo -> 3, mult applied was x2
    expect(stats.bestMultiplier).toBeGreaterThanOrEqual(2);
  });

  it("accumulates score using the multiplier in effect before this gate", () => {
    const stats: RunStats = { ...newRunStats(), combo: 1 };
    // combo is 1 going in -> multiplier x1.5 applies to this gate's points
    const next = applyGate(stats, 1, "perfect", 1);
    expect(next.score).toBe(450);
  });
});

describe("toneBreakdown", () => {
  it("reports pct null when a tone has zero scored gates", () => {
    const stats = newRunStats();
    const breakdown = toneBreakdown(stats);
    const t1 = breakdown.find((b) => b.tone === 1)!;
    expect(t1.pct).toBeNull();
    expect(t1.unheard).toBe(0);
  });

  it("computes average accuracy pct per tone, excluding unheard", () => {
    let stats: RunStats = newRunStats();
    stats = applyGate(stats, 1, "perfect", 1);
    stats = applyGate(stats, 1, "good", 0.7);
    stats = applyGate(stats, 1, "unheard", 0);
    const breakdown = toneBreakdown(stats);
    const t1 = breakdown.find((b) => b.tone === 1)!;
    expect(t1.pct).toBeCloseTo(85); // mean(1, 0.7) * 100
    expect(t1.unheard).toBe(1);
  });
});

describe("takeaway", () => {
  it("returns a generic message when no tone has >= 2 scored gates", () => {
    const stats = newRunStats();
    const breakdown = toneBreakdown(stats);
    expect(takeaway(breakdown)).toBe("Play a longer run for a per-tone read.");
  });

  it("names the worst tone with its cue among tones with >= 2 scored gates", () => {
    let stats: RunStats = newRunStats();
    // T1: two good scores, mean 0.9
    stats = applyGate(stats, 1, "perfect", 0.9);
    stats = applyGate(stats, 1, "perfect", 0.9);
    // T3: two low scores, mean 0.3 (worst)
    stats = applyGate(stats, 3, "ok", 0.3);
    stats = applyGate(stats, 3, "ok", 0.3);
    const breakdown = toneBreakdown(stats);
    expect(takeaway(breakdown)).toBe(
      "Tone 3 is your weak spot — it dips before it rises.",
    );
  });

  it("ignores tones with fewer than 2 scored gates when picking the worst", () => {
    let stats: RunStats = newRunStats();
    // T4: one very low score, but only 1 gate -> ignored
    stats = applyGate(stats, 4, "ok", 0.1);
    // T2: two mid scores -> only eligible tone
    stats = applyGate(stats, 2, "good", 0.7);
    stats = applyGate(stats, 2, "good", 0.7);
    const breakdown = toneBreakdown(stats);
    expect(takeaway(breakdown)).toBe(
      "Tone 2 is your weak spot — it rises, don't start too high.",
    );
  });
});
