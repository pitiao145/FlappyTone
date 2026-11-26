import { beforeEach, describe, expect, it, vi } from "vitest";
import { periodAccuracy, periodFor } from "./accuracyPeriod.ts";
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

describe("accuracy period (brief 05, weeks since brief 55)", () => {
  it("free reads the last 5; Pro reads a week", () => {
    expect(periodFor("free")).toBe("last5");
    expect(periodFor("guest")).toBe("last5");
    expect(periodFor("pro")).toBe("week");
  });

  it("free with zero runs shows the empty state, never a lifetime fallback", () => {
    cacheFromServer(
      {
        totalRuns: 40, bestScore: 1, totalGates: 40, wordIds: [], recent: [],
        perTarget: [{ target: "1", attempts: 40, unheard: 0, accSum: 30, best: 1 }],
      },
      "u1",
    );
    expect(periodAccuracy("last5", loadRunHistory(), null).empty).toBe(true);
  });

  it("last 5 reads only the 5 newest runs", () => {
    run(0); // the 6th oldest: dropped
    for (let i = 0; i < 5; i++) run(1);
    expect(periodAccuracy("last5", loadRunHistory(), null).tones[0].pct).toBe(100);
  });

  it("a week reads the fetched rows; null while loading reads empty", () => {
    const store = loadRunHistory();
    expect(periodAccuracy("week", store, null).empty).toBe(true);
    const rows = entriesFromRows(
      Array.from({ length: 8 }, (_, i) => ({
        played_at: String(i), score: 0, gates: 1, outcome: "finished" as const,
        per_key: { "2": { gates: 1, accSum: i < 4 ? 1 : 0 }, "3-2": { gates: 1, accSum: 1 } },
      })),
    );
    const a = periodAccuracy("week", store, rows);
    expect(a.tones[1]).toMatchObject({ gates: 8, pct: 50 });
    expect(a.combos.map((c) => c.key)).toEqual(["3-2"]);
  });
});
