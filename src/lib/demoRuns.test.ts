import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_RUN_TTL_MS, DEMO_RUNS_KEY, clearDemoRuns, parkDemoRun, readDemoRuns } from "./demoRuns.ts";

let map: Record<string, string>;
beforeEach(() => {
  map = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map[k] ?? null,
    setItem: (k: string, v: string) => {
      map[k] = v;
    },
    removeItem: (k: string) => {
      delete map[k];
    },
  } as Storage);
});

const tone = (gates: number, accSum: number) => ({ gates, accSum, unheard: 0, best: gates ? accSum / gates : 0, mismatched: 0 });
const round = (score: number) => ({
  mode: "game" as const,
  score,
  perTone: { 1: tone(2, 1.6), 2: tone(0, 0), 3: tone(1, 0.5), 4: tone(2, 1) },
  perCombo: {},
  wordIds: ["ma1", "ma3"],
});

describe("demo rounds parking (brief 50)", () => {
  it("parks a round with a uuid, the local day and raw numbers only", () => {
    const now = new Date(2026, 10, 17, 9, 30).getTime();
    parkDemoRun(round(1240.4), now);
    const [r] = readDemoRuns(now);
    expect(r.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.day).toBe("2026-11-17");
    expect(r.score).toBe(1240);
    expect(r.perTone["1"]).toEqual({ gates: 2, accSum: 1.6, unheard: 0, best: 0.8 });
    expect(r.wordIds).toEqual(["ma1", "ma3"]);
    expect(r.at).toBe(now);
  });

  it("keeps the latest 5", () => {
    const t0 = Date.now();
    for (let i = 1; i <= 7; i++) parkDemoRun(round(i), t0 + i);
    const runs = readDemoRuns(t0 + 10);
    expect(runs.map((r) => r.score)).toEqual([3, 4, 5, 6, 7]);
    expect(JSON.parse(map[DEMO_RUNS_KEY])).toHaveLength(5);
  });

  it("drops rounds older than 24 h on read and on write", () => {
    const t0 = Date.now();
    parkDemoRun(round(1), t0);
    expect(readDemoRuns(t0 + DEMO_RUN_TTL_MS + 1)).toEqual([]);
    parkDemoRun(round(2), t0 + DEMO_RUN_TTL_MS + 1);
    const stored = JSON.parse(map[DEMO_RUNS_KEY]) as { score: number }[];
    expect(stored.map((r) => r.score)).toEqual([2]);
  });

  it("survives blocked storage: nothing parked, nothing thrown", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage);
    expect(() => parkDemoRun(round(1))).not.toThrow();
    expect(readDemoRuns()).toEqual([]);
    expect(() => clearDemoRuns()).not.toThrow();
  });

  it("ignores junk in the key", () => {
    map[DEMO_RUNS_KEY] = '[{"runId":1},"x",null]';
    expect(readDemoRuns()).toEqual([]);
    map[DEMO_RUNS_KEY] = "{not json";
    expect(readDemoRuns()).toEqual([]);
  });
});
