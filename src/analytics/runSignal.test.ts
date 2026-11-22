import { describe, expect, it } from "vitest";
import { heardPctOf, noiseDbOf, runSignal } from "./runSignal.ts";
import { sanitizeGameProperties } from "./posthog.ts";
import type { AnalyticsEvent } from "./session.ts";

describe("runSignal (run_end noiseDb + heardPct, brief 51)", () => {
  it("turns the noise floor RMS into whole dB full scale", () => {
    expect(noiseDbOf(0.01)).toBe(-40);
    expect(noiseDbOf(0.001)).toBe(-60);
    expect(noiseDbOf(1)).toBe(0);
  });

  it("drops a floor with no dB", () => {
    for (const v of [0, -1, NaN, Infinity, null, undefined]) expect(noiseDbOf(v as number)).toBeUndefined();
  });

  it("heardPct is voiced over all in-gate frames, whole percent", () => {
    expect(heardPctOf([{ samples: 100, voiced: 80 }, { samples: 100, voiced: 40 }])).toBe(60);
    // Weighted by frames, not a mean of per-gate fractions.
    expect(heardPctOf([{ samples: 300, voiced: 300 }, { samples: 100, voiced: 0 }])).toBe(75);
  });

  it("heardPct is absent when no gate had frames", () => {
    expect(heardPctOf([])).toBeUndefined();
    expect(heardPctOf([{ samples: 0, voiced: 0 }])).toBeUndefined();
    expect(heardPctOf(null)).toBeUndefined();
  });

  it("never throws on bad input (hard rule 10)", () => {
    const bad = [null, { samples: NaN, voiced: 1 }, { samples: 10, voiced: 99 }] as never;
    expect(() => runSignal(bad, NaN)).not.toThrow();
    expect(runSignal(bad, NaN)).toEqual({ heardPct: 100 });
    const throwing = {
      [Symbol.iterator]() {
        throw new Error("boom");
      },
    };
    expect(() => runSignal(Object.assign([], throwing) as never, 0.01)).not.toThrow();
  });

  it("gives exactly the two numbers, nothing voice-derived", () => {
    const sig = runSignal([{ samples: 50, voiced: 25 }], 0.002);
    expect(sig).toEqual({ noiseDb: -54, heardPct: 50 });
    expect(Object.keys(sig).sort()).toEqual(["heardPct", "noiseDb"]);
  });

  it("run_end carries noiseDb and heardPct, and they survive sanitizing", () => {
    const ev: AnalyticsEvent = {
      type: "run_end",
      reason: "finished",
      gates: 2,
      score: 400,
      bestMult: 1,
      missedEarly: 0,
      voice: "jane",
      speechStyle: "textbook",
      ...runSignal([{ samples: 40, voiced: 30 }], 0.01),
    };
    const { type: _type, ...props } = ev;
    const sent = sanitizeGameProperties(props);
    expect(sent.noiseDb).toBe(-40);
    expect(sent.heardPct).toBe(75);
    // No voice-profile number: no Hz, centre, range or learned scale.
    const keys = Object.keys(sent);
    for (const k of keys) expect(k).not.toMatch(/f0|hz|center|centre|range|semitone|ruler|scale|grid|up|down/i);
    expect(keys.sort()).toEqual(
      ["bestMult", "gates", "heardPct", "missedEarly", "noiseDb", "reason", "score", "speechStyle", "voice"].sort(),
    );
  });
});
