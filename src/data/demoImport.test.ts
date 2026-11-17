import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_RUNS_KEY, parkDemoRun, readDemoRuns } from "../lib/demoRuns.ts";
import { loadOutbox } from "./runOutbox.ts";
import { dismissDemoNotice, importDemoRuns, isNewSince, pendingDemoNotice } from "./demoImport.ts";

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

const tone = (gates: number, accSum: number) => ({ gates, accSum, unheard: 0, best: 0.9 });
const park = (at: number, score = 500) =>
  parkDemoRun(
    {
      mode: "game",
      score,
      perTone: { 1: tone(2, 1.5), 2: tone(1, 0.9), 3: tone(0, 0), 4: tone(2, 1) },
      perCombo: {},
      wordIds: ["ma1", "ma2"],
    },
    at,
  );

describe("demo import (brief 50)", () => {
  const t0 = Date.now() - 60 * 60 * 1000;

  it("imports into an account created after the first parked round, one run per round, with its runId", () => {
    park(t0, 100);
    park(t0 + 1000, 200);
    park(t0 + 2000, 300);
    const parked = readDemoRuns();
    const n = importDemoRuns({ userId: "u1", createdAt: new Date(t0 + 5 * 60_000).toISOString() });
    expect(n).toBe(3);
    const out = loadOutbox();
    expect(out.map((i) => i.run.runId)).toEqual(parked.map((r) => r.runId));
    expect(out.every((i) => i.userId === "u1" && i.run.mode === "game" && i.run.outcome === "finished")).toBe(true);
    expect(out.map((i) => i.run.score)).toEqual([100, 200, 300]);
    expect(out[0].day).toBe(parked[0].day);
    expect(out[0].run.per_key["1"]).toMatchObject({ gates: 2, accSum: 1.5 });
    expect(out[0].run.gates).toBe(5);
    expect(map[DEMO_RUNS_KEY]).toBeUndefined();
    expect(pendingDemoNotice("u1")).toBe(3);
    expect(pendingDemoNotice("u2")).toBe(0);
  });

  it("a second call does nothing", () => {
    park(t0);
    importDemoRuns({ userId: "u1", createdAt: new Date(t0 + 60_000).toISOString() });
    expect(importDemoRuns({ userId: "u1", createdAt: new Date(t0 + 60_000).toISOString() })).toBe(0);
    expect(loadOutbox()).toHaveLength(1);
  });

  it("an existing account imports nothing, and the parked rounds are still cleared", () => {
    park(t0);
    const n = importDemoRuns({ userId: "u1", createdAt: new Date(t0 - 24 * 60 * 60_000).toISOString() });
    expect(n).toBe(0);
    expect(loadOutbox()).toEqual([]);
    expect(map[DEMO_RUNS_KEY]).toBeUndefined();
    expect(pendingDemoNotice("u1")).toBe(0);
  });

  it("an unknown creation time imports nothing", () => {
    park(t0);
    expect(importDemoRuns({ userId: "u1", createdAt: null })).toBe(0);
    expect(map[DEMO_RUNS_KEY]).toBeUndefined();
  });

  it("uses authMode's 10 s slack", () => {
    expect(isNewSince(new Date(t0 - 9_000).toISOString(), t0)).toBe(true);
    expect(isNewSince(new Date(t0 - 11_000).toISOString(), t0)).toBe(false);
  });

  it("the notice is shown once", () => {
    park(t0);
    importDemoRuns({ userId: "u1", createdAt: new Date(t0 + 1000).toISOString() });
    expect(pendingDemoNotice("u1")).toBe(1);
    dismissDemoNotice();
    expect(pendingDemoNotice("u1")).toBe(0);
  });

  it("never throws on blocked storage", () => {
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
    expect(importDemoRuns({ userId: "u1", createdAt: new Date().toISOString() })).toBe(0);
    expect(pendingDemoNotice("u1")).toBe(0);
    expect(() => dismissDemoNotice()).not.toThrow();
  });
});
