import { describe, expect, it } from "vitest";
import sample from "../../fixtures/contours/jane-textbook-sample.json";
import { classifyToneV2, toneFeatures } from "./toneClassifierV2.ts";
import type { Contour } from "./contours.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";

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

  it("reads a zigzag unlike any tone as none", () => {
    const zig = contourOf(Array.from({ length: 16 }, (_, k) => ({ tMs: (k / 15) * 800, chao: k % 2 ? 1 : 5 })));
    expect(classifyToneV2(zig)?.tone).toBe("none");
  });

  it("never takes a heart on the shape midway between Jane's T2 and T3 averages", () => {
    const mid = AVERAGED_TONE_SHAPE.textbook[2].map((v, i) => (v + AVERAGED_TONE_SHAPE.textbook[3][i]) / 2);
    const c = contourOf(mid.map((chao, i) => ({ tMs: (i / (mid.length - 1)) * 900, chao })));
    expect(classifyToneV2(c)?.decisive).toBe(false);
  });

  it("never reads a short flat fragment as Tone 1", () => {
    expect(classifyToneV2(shape(() => 5, 233))?.tone).not.toBe(1);
  });

  it("ignores a two-frame onset glitch when finding the low point", () => {
    // Pierre's 好 hǎo (10 Oct 2026): 1.6 1.09 1.01, then the real fall from 2.7.
    const f = toneFeatures(
      shape((t) => (t < 0.06 ? 1.05 : t < 0.15 ? 2.7 : t < 0.6 ? 1.93 : 1.93 + 3 * ((t - 0.6) / 0.4)), 858),
    );
    expect(f!.low).toBeGreaterThan(1.8);
  });

  it("reads a fall from an early peak as Tone 4", () => {
    expect(classifyToneV2(shape((t) => (t < 0.15 ? 4.5 : 4.5 - 3.2 * ((t - 0.15) / 0.85))))?.tone).toBe(4);
  });

  it("reads a fall from mid board as a falling-only Tone 3, never decisive", () => {
    const r = classifyToneV2(shape((t) => (t < 0.1 ? 3.4 : 3.4 - 2.2 * ((t - 0.1) / 0.9))));
    expect(r?.tone).toBe(3);
    expect(r?.decisive).toBe(false);
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

  // Traced from a visualiser screenshot (9 Oct 2026): x→time, y→chao.
  const traced = (xy: number[][], ms: number): Contour =>
    contourOf(
      xy.map(([x, y]) => ({
        tMs: ((x - xy[0][0]) / (xy[xy.length - 1][0] - xy[0][0])) * ms,
        chao: 5 - (y - 57) / 250,
      })),
    );
  const pierreT2 = [[193,372],[205,455],[212,505],[222,492],[240,530],[250,580],[265,595],[288,620],[300,650],[318,690],[338,750],[348,765],[365,768],[390,762],[405,758],[420,730],[432,695],[445,640],[460,560],[482,385],[492,350],[505,190],[512,125],[520,70],[535,58],[568,58]];
  const janeWordT2 = [[193,497],[230,560],[270,630],[310,700],[340,760],[365,783],[380,780],[400,740],[430,640],[460,520],[490,400],[520,270],[548,145]];

  it("does not read a mid-turning T2 with a steep rise as Tone 3", () => {
    for (const ms of [600, 900]) {
      expect(classifyToneV2(traced(pierreT2, ms))?.tone).toBe(2);
      expect(classifyToneV2(traced(janeWordT2, ms))?.tone).not.toBe(3);
    }
  });

  it("names every one of Jane's textbook sample clips correctly", () => {
    const rows = sample.rows as unknown as { id: string; tones: number[]; durationS: number; contour: [number, number][] }[];
    for (const r of rows.filter((x) => x.tones.length === 1)) {
      const c = contourOf(r.contour.map(([t, chao]) => ({ tMs: t * r.durationS * 1000, chao })));
      expect(classifyToneV2(c)?.tone, r.id).toBe(r.tones[0]);
    }
  });
});
