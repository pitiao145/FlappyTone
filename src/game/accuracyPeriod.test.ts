import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectivePeriod, periodAccuracy, periodAllowed } from "./accuracyPeriod.ts";
import { cacheFromServer, entriesFromRows, loadRunHistory, recordRun } from "./runHistory.ts";
import { applyGate, newRunStats } from "./scoring.ts";
import type { RunSnapshot } from "./run.ts";

beforeEach(() => {
  const m: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m[k] ?? null,
    setItem: (k: string, v: string) => {
      m[k] = v;
    },
    removeItem: (k: string) => {
      delete m[k];
    },
  } as Storage);
});

const run = (acc: number) =>
  recordRun({ stats: applyGate(newRunStats(), [1], "good", acc), wordIds: [] } as unknown as RunSnapshot, "finished");

describe("accuracy period (brief 05)", () => {
  it("free and guest only get the last 5; Pro gets all three", () => {
    for (const tier of ["guest", "free"] as const) {
      expect(periodAllowed(tier, "last5")).toBe(true);
      expect(periodAllowed(tier, "last50")).toBe(false);
      expect(periodAllowed(tier, "all")).toBe(false);
      expect(effectivePeriod(tier, "all")).toBe("last5");
    }
    expect(effectivePeriod("pro", "last50")).toBe("last50");
    expect(effectivePeriod("pro", "all")).toBe("all");
  });

  it("free with zero runs shows the empty state, never a lifetime fallback", () => {
    cacheFromServer(
      {
        totalRuns: 40, bestScore: 1, totalGates: 40, wordIds: [], recent: [],
        perTarget: [{ target: "1", attempts: 40, unheard: 0, accSum: 30, best: 1 }],
      },
      "u1",
    );
    const a = periodAccuracy("last5", loadRunHistory(), null);
    expect(a.empty).toBe(true);
    expect(periodAccuracy("all", loadRunHistory(), null).empty).toBe(false);
  });

  it("last 5 reads only the 5 newest runs", () => {
    run(0); // the 6th oldest: dropped
    for (let i = 0; i < 5; i++) run(1);
    expect(periodAccuracy("last5", loadRunHistory(), null).tones[0].pct).toBe(100);
  });

  it("last 50 reads the fetched rows; null while loading reads empty", () => {
    const store = loadRunHistory();
    expect(periodAccuracy("last50", store, null).empty).toBe(true);
    const rows = entriesFromRows(
      Array.from({ length: 50 }, (_, i) => ({
        played_at: String(i), score: 0, gates: 1, outcome: "finished" as const,
        per_key: { "2": { gates: 1, accSum: i < 25 ? 1 : 0 } },
      })),
    );
    const a = periodAccuracy("last50", store, rows);
    expect(a.tones[1]).toMatchObject({ gates: 50, pct: 50 });
  });

  it("all time reads the account's lifetime totals", () => {
    cacheFromServer(
      {
        totalRuns: 3, bestScore: 1, totalGates: 3, wordIds: [], recent: [],
        perTarget: [{ target: "3", attempts: 4, unheard: 0, accSum: 3, best: 1 }, { target: "3-2", attempts: 2, unheard: 0, accSum: 1, best: 1 }],
      },
      "u1",
    );
    const a = periodAccuracy("all", loadRunHistory(), null);
    expect(a.tones[2]).toMatchObject({ gates: 4, pct: 75 });
    expect(a.combos.map((c) => c.key)).toEqual(["3-2"]);
  });
});
