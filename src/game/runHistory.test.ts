import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  lifetimeToneStats,
  loadRunHistory,
  recordRun,
  type RunHistoryStore,
} from "./runHistory.ts";
import { applyGate, newRunStats } from "./scoring.ts";
import type { RunSnapshot } from "./run.ts";

function fakeSnapshot(score: number, wordIds: string[], build: (s: ReturnType<typeof newRunStats>) => ReturnType<typeof newRunStats>): RunSnapshot {
  const stats = build(newRunStats());
  return { stats: { ...stats, score }, wordIds } as unknown as RunSnapshot;
}

let storageMap: Record<string, string>;

beforeEach(() => {
  storageMap = {};
  vi.stubGlobal(
    "localStorage",
    {
      getItem: (key: string) => storageMap[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMap[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMap[key];
      },
    } as Storage
  );
});

describe("recordRun / lifetimePerTone", () => {
  it("accumulates lifetime per-tone stats across multiple runs", () => {
    const snap1 = fakeSnapshot(300, ["w1"], (s) => applyGate(s, 1, "perfect", 1));
    recordRun(snap1, "finished");

    const snap2 = fakeSnapshot(150, ["w2"], (s) => applyGate(s, 1, "good", 0.7));
    const store = recordRun(snap2, "finished");

    const t1 = lifetimeToneStats(store).find((t) => t.tone === 1)!;
    expect(t1.attempts).toBe(2);
    expect(t1.accSum).toBeCloseTo(1.7);
    expect(t1.best).toBe(1);
    expect(t1.unheard).toBe(0);
  });

  it("does not count unheard gates toward attempts/accSum but tracks them separately", () => {
    const snap = fakeSnapshot(0, [], (s) => applyGate(s, 2, "unheard", 0));
    const store = recordRun(snap, "finished");
    const t2 = lifetimeToneStats(store).find((t) => t.tone === 2)!;
    expect(t2.attempts).toBe(0);
    expect(t2.unheard).toBe(1);
    expect(t2.best).toBe(0);
  });

  it("seeds lifetimePerTone from lastRuns for a store saved before this field existed", () => {
    const legacyStore = {
      totalRuns: 1,
      bestScore: 300,
      totalGates: 1,
      wordIds: ["w1"],
      lastRuns: [
        {
          atISO: new Date().toISOString(),
          score: 300,
          gates: 1,
          outcome: "finished",
          perTone: {
            1: { gates: 1, accSum: 0.9, unheard: 0 },
            2: { gates: 0, accSum: 0, unheard: 0 },
            3: { gates: 0, accSum: 0, unheard: 1 },
            4: { gates: 0, accSum: 0, unheard: 0 },
          },
        },
      ],
      // lifetimePerTone intentionally absent
    };
    localStorage.setItem("toneflap.history.v1", JSON.stringify(legacyStore));

    const loaded = loadRunHistory();
    const t1 = lifetimeToneStats(loaded).find((t) => t.tone === 1)!;
    expect(t1.attempts).toBe(1);
    expect(t1.accSum).toBeCloseTo(0.9);
    expect(t1.best).toBe(0); // never measured before this change
    const t3 = lifetimeToneStats(loaded).find((t) => t.tone === 3)!;
    expect(t3.unheard).toBe(1);
  });

  it("loads a store that already has lifetimePerTone unchanged", () => {
    const store: RunHistoryStore = {
      totalRuns: 0,
      bestScore: 0,
      totalGates: 0,
      wordIds: [],
      lastRuns: [],
      lifetimePerTone: {
        1: { attempts: 5, unheard: 1, accSum: 4, best: 0.95 },
        2: { attempts: 0, unheard: 0, accSum: 0, best: 0 },
        3: { attempts: 0, unheard: 0, accSum: 0, best: 0 },
        4: { attempts: 0, unheard: 0, accSum: 0, best: 0 },
      },
    };
    localStorage.setItem("toneflap.history.v1", JSON.stringify(store));
    const loaded = loadRunHistory();
    expect(loaded.lifetimePerTone[1].best).toBe(0.95);
  });
});
