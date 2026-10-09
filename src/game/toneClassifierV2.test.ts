import { describe, expect, it } from "vitest";
import sample from "../../fixtures/contours/jane-textbook-sample.json";
import { classifyToneV2, toneFeatures } from "./toneClassifierV2.ts";
import type { Contour } from "./contours.ts";

const contourOf = (points: { tMs: number; chao: number }[]): Contour => ({
  points,
  startedAtMs: 0,
  endedAtMs: points[points.length - 1].tMs,
});

const shape = (fn: (t: number) => number, ms = 800): Contour =>
  contourOf(Array.from({ length: 40 }, (_, k) => ({ tMs: (k / 39) * ms, chao: fn(k / 39) })));

describe("classifyToneV2", () => {
  it("reads a high flat line as Tone 1", () => {
    expect(classifyToneV2(shape(() => 4.5))?.tone).toBe(1);
  });

  it("never reads a flat line under chao 3 as Tone 1", () => {
    expect(classifyToneV2(shape(() => 2.4))?.tone).not.toBe(1);
    expect(classifyToneV2(shape(() => 1.5))?.tone).not.toBe(1);
  });

  it("reads a fall from an early peak as Tone 4", () => {
    expect(classifyToneV2(shape((t) => (t < 0.15 ? 4.5 : 4.5 - 3.2 * ((t - 0.15) / 0.85))))?.tone).toBe(4);
  });

  it("reads an early shallow dip and long rise as Tone 2", () => {
    const r = classifyToneV2(shape((t) => (t < 0.3 ? 2.9 - 0.6 * (t / 0.3) : 2.3 + 2.6 * ((t - 0.3) / 0.7))));
    expect(r?.tone).toBe(2);
  });

  it("reads a fast fall, a held floor and a late quick rise as Tone 3", () => {
    const r = classifyToneV2(
      shape((t) => (t < 0.08 ? 3 - 25 * t : t < 0.8 ? 1 : 1 + 4 * ((t - 0.8) / 0.2))),
    );
    expect(r?.tone).toBe(3);
  });

  it("times the turn at the middle of the floor, not where it is first touched", () => {
    const f = toneFeatures(shape((t) => (t < 0.1 ? 3 - 20 * t : t < 0.7 ? 1 : 1 + 4 * ((t - 0.7) / 0.3))));
    expect(f!.turnTime).toBeGreaterThan(0.35);
  });

  it("names every one of Jane's textbook sample clips correctly", () => {
    const rows = sample.rows as unknown as { id: string; tones: number[]; durationS: number; contour: [number, number][] }[];
    for (const r of rows.filter((x) => x.tones.length === 1)) {
      const c = contourOf(r.contour.map(([t, chao]) => ({ tMs: t * r.durationS * 1000, chao })));
      expect(classifyToneV2(c)?.tone, r.id).toBe(r.tones[0]);
    }
  });
});
