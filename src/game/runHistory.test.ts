import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheFromServer,
  comboAccuracyFromHistory,
  entriesFromRows,
  hasGuestProgress,
  lifetimeComboAccuracy,
  lifetimeTargetStats,
  lifetimeToneAccuracy,
  loadRunHistory,
  recordRun,
  STATS_VERSION,
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
    const snap1 = fakeSnapshot(300, ["w1"], (s) => applyGate(s, [1], "perfect", 1));
    recordRun(snap1, "finished");

    const snap2 = fakeSnapshot(150, ["w2"], (s) => applyGate(s, [1], "good", 0.7));
    const store = recordRun(snap2, "finished");

    const t1 = lifetimeTargetStats(store).find((t) => t.target === "1")!;
    expect(t1.attempts).toBe(2);
    expect(t1.accSum).toBeCloseTo(1.7);
    expect(t1.best).toBe(1);
    expect(t1.unheard).toBe(0);
  });

  it("does not count unheard gates toward attempts/accSum but tracks them separately", () => {
    const snap = fakeSnapshot(0, [], (s) => applyGate(s, [2], "unheard", 0));
    const store = recordRun(snap, "finished");
    const t2 = lifetimeTargetStats(store).find((t) => t.target === "2")!;
    expect(t2.attempts).toBe(0);
    expect(t2.unheard).toBe(1);
    expect(t2.best).toBe(0);
  });

  it("resets per-tone numbers from before tone accuracy, keeping runs, best score, gates and words", () => {
    // statsVersion absent = the old corridor-accuracy numbers. They must not
    // be mixed with tone accuracy, so they go; the counts stay.
    const legacyStore = {
      totalRuns: 7,
      bestScore: 2400,
      totalGates: 60,
      wordIds: ["w1", "w2"],
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
      lifetimePerTone: {
        1: { attempts: 40, unheard: 3, accSum: 30, best: 1 },
        2: { attempts: 5, unheard: 0, accSum: 2, best: 0.6 },
        3: { attempts: 0, unheard: 0, accSum: 0, best: 0 },
        4: { attempts: 0, unheard: 0, accSum: 0, best: 0 },
      },
    };
    localStorage.setItem("toneflap.history.v1", JSON.stringify(legacyStore));

    const loaded = loadRunHistory();
    expect(loaded.totalRuns).toBe(7);
    expect(loaded.bestScore).toBe(2400);
    expect(loaded.totalGates).toBe(60);
    expect(loaded.wordIds).toEqual(["w1", "w2"]);
    expect(loaded.lastRuns).toHaveLength(1);
    expect(loaded.lastRuns[0].score).toBe(300);
    for (const t of lifetimeTargetStats(loaded)) {
      expect(t).toMatchObject({ attempts: 0, unheard: 0, accSum: 0, best: 0 });
    }
    expect(loaded.lastRuns[0].perTone[1]).toEqual({ gates: 0, accSum: 0, unheard: 0 });
    // Saved, so the reset happens once rather than on every load.
    expect(JSON.parse(storageMap["toneflap.history.v1"]).statsVersion).toBe(STATS_VERSION);
  });

  it("loads a current-version store unchanged", () => {
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
      lifetimePerCombo: { "3-2": { attempts: 2, unheard: 0, accSum: 1.5, best: 0.8 } },
      statsVersion: STATS_VERSION,
    };
    localStorage.setItem("toneflap.history.v1", JSON.stringify(store));
    const loaded = loadRunHistory();
    expect(loaded.lifetimePerTone[1].best).toBe(0.95);
    expect(loaded.lifetimePerCombo["3-2"].attempts).toBe(2);
  });
});

describe("pair combos in history", () => {
  it("records a run's combos and accumulates them for life", () => {
    recordRun(fakeSnapshot(500, [], (s) => applyGate(applyGate(s, [3, 2], "perfect", 0.8), [3, 2], "good", 0.6)), "finished");
    const store = recordRun(fakeSnapshot(200, [], (s) => applyGate(s, [1, 4], "ok", 0.4)), "finished");

    expect(store.lifetimePerCombo["3-2"]).toEqual({ attempts: 2, unheard: 0, accSum: 1.4, best: 0.8 });
    expect(store.lifetimePerCombo["1-4"]).toEqual({ attempts: 1, unheard: 0, accSum: 0.4, best: 0.4 });
    // Pair gates never land in per-tone.
    expect(store.lifetimePerTone[3].attempts).toBe(0);
    // Measured pair gates count toward the run's gate total.
    expect(store.lastRuns[1].gates).toBe(2);

    expect(comboAccuracyFromHistory(store).map((c) => [c.key, Math.round(c.pct)])).toEqual([
      ["1-4", 40],
      ["3-2", 70],
    ]);
    expect(lifetimeComboAccuracy(store).map((c) => c.key)).toEqual(["1-4", "3-2"]);
    expect(lifetimeTargetStats(store).map((t) => t.target)).toEqual(["1", "2", "3", "4", "1-4", "3-2"]);
  });
});

describe("lifetimeToneAccuracy", () => {
  it("computes accSum / attempts per tone", () => {
    const snap1 = fakeSnapshot(300, ["w1"], (s) => applyGate(s, [1], "perfect", 1));
    recordRun(snap1, "finished");
    const snap2 = fakeSnapshot(150, ["w2"], (s) => applyGate(s, [1], "good", 0.7));
    const store = recordRun(snap2, "finished");

    const t1 = lifetimeToneAccuracy(store).find((t) => t.tone === 1)!;
    expect(t1.gates).toBe(2);
    expect(t1.pct).toBeCloseTo(85); // (1 + 0.7) / 2 * 100
  });

  it("excludes unheard gates from the accuracy figure", () => {
    const snap = fakeSnapshot(0, [], (s) => applyGate(s, [2], "unheard", 0));
    const store = recordRun(snap, "finished");
    const t2 = lifetimeToneAccuracy(store).find((t) => t.tone === 2)!;
    expect(t2.gates).toBe(0);
    expect(t2.pct).toBeNull();
  });

  it("does not produce NaN for a tone with zero attempts", () => {
    const store = loadRunHistory();
    const t3 = lifetimeToneAccuracy(store).find((t) => t.tone === 3)!;
    expect(t3.pct).toBeNull();
    expect(Number.isNaN(t3.pct)).toBe(false);
  });
});

describe("cacheFromServer (brief 05: the account's server state replaces the cache)", () => {
  const server = {
    totalRuns: 20,
    bestScore: 900,
    totalGates: 80,
    wordIds: ["ma1b"],
    perTarget: [
      { target: "2", attempts: 9, unheard: 1, accSum: 7, best: 0.9 },
      { target: "3-2", attempts: 4, unheard: 0, accSum: 3, best: 0.85 },
    ],
    recent: [
      { played_at: "2026-10-13T10:00:00Z", score: 300, gates: 2, outcome: "quit" as const, per_key: { "2": { gates: 2, accSum: 1.6 } } },
    ],
  };

  it("replaces, never max-merges: a smaller server number wins over a bigger local one", () => {
    for (let i = 0; i < 30; i++) recordRun(fakeSnapshot(5000, ["w"], (s) => applyGate(s, [2], "good", 0.6)), "finished");
    const store = cacheFromServer(server, "u1");
    expect(store.totalRuns).toBe(20);
    expect(store.bestScore).toBe(900);
    expect(store.owner).toBe("u1");
    expect(store.lifetimePerTone[2]).toEqual({ attempts: 9, unheard: 1, accSum: 7, best: 0.9 });
    expect(store.lifetimePerTone[1].attempts).toBe(0);
    expect(store.lifetimePerCombo["3-2"].attempts).toBe(4);
    expect(store.lastRuns).toHaveLength(1);
    expect(store.lastRuns[0].perTone[2]).toEqual({ gates: 2, accSum: 1.6, unheard: 0 });
    expect(hasGuestProgress(store)).toBe(false);
  });

  it("recordRun keeps the owner, so an optimistic local run never turns the cache into guest data", () => {
    cacheFromServer(server, "u1");
    const store = recordRun(fakeSnapshot(1, [], (s) => s), "finished");
    expect(store.owner).toBe("u1");
    expect(hasGuestProgress(store)).toBe(false);
  });

  it("a guest store with runs is guest progress", () => {
    const store = recordRun(fakeSnapshot(1, [], (s) => s), "quit");
    expect(hasGuestProgress(store)).toBe(true);
  });

  it("entriesFromRows splits per_key into tones and combos", () => {
    const [e] = entriesFromRows([
      { played_at: "x", score: 1, gates: 3, outcome: "finished", per_key: { "1": { gates: 2, accSum: 1, unheard: 1 }, "3-2": { gates: 1, accSum: 0.5 } } },
    ]);
    expect(e.perTone[1]).toEqual({ gates: 2, accSum: 1, unheard: 1 });
    expect(e.perCombo).toEqual({ "3-2": { gates: 1, accSum: 0.5, unheard: 0 } });
  });
});
