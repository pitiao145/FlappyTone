/**
 * Brief 45: the reader's one-ruler settings (`toneReaderRuler`), used only
 * when `playerRulerV2` is on. The old board's behaviour is pinned by
 * toneClassifierV2.test.ts with the flag off (the default).
 */
import { afterEach, describe, expect, it } from "vitest";
import { classifyToneV2, readerSettings } from "./toneClassifierV2.ts";
import type { Contour } from "./contours.ts";
import { DEFAULT_TUNING, resetTuning, setTuning, tuning } from "./tuning.ts";
import { averagedShapes, referenceFor } from "./toneAccuracy.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { AVERAGED_TONE_SHAPE_V2, DEFAULT_POLYLINES_V2 } from "./toneAveragesV2.ts";
import { shapeForTone } from "./gates.ts";

const shape = (fn: (t: number) => number, ms = 800): Contour => {
  const points = Array.from({ length: 40 }, (_, k) => ({ tMs: (k / 39) * ms, chao: fn(k / 39) }));
  return { points, startedAtMs: 0, endedAtMs: ms };
};
const ruler = () => setTuning({ playerRulerV2: true });
afterEach(() => resetTuning());

describe("reader settings by flag", () => {
  it("flag off: the old board's toneV2* fields, no ruler-only guards", () => {
    const r = readerSettings();
    expect(r.t1MinChao).toBe(DEFAULT_TUNING.toneV2T1MinChao);
    expect(r.t4MinPeakChao).toBe(DEFAULT_TUNING.toneV2T4MinPeakChao);
    expect(r.anchors).toBe(tuning().toneV2T23Anchors);
    expect(r.votes).toHaveLength(6);
    expect([r.t4MinFallChao, r.t23Stability, r.t2FloorChao, r.t1DecisiveMinChao, r.t4DecisiveMinPeakChao]).toEqual([null, null, null, null, null]);
    expect(r.t23ScoopNotDecisive).toBe(false);
  });
  it("flag on: the ruler set", () => {
    ruler();
    expect(readerSettings()).toBe(tuning().toneReaderRuler);
  });
});

describe("ruler reader: reads without height, never a heart from height alone", () => {
  it("reads a level line just under the middle as T1, but not decisive", () => {
    ruler();
    const r = classifyToneV2(shape(() => 2.7))!;
    expect(r.tone).toBe(1);
    expect(r.decisive).toBe(false);
    setTuning({ toneReaderRuler: { ...tuning().toneReaderRuler, t1DecisiveMinChao: null } });
    expect(classifyToneV2(shape(() => 2.7))!.decisive).toBe(true);
  });
  it("a level line on the floor is still never T1", () => {
    ruler();
    expect(classifyToneV2(shape(() => 1.2))?.tone).not.toBe(1);
  });
  it("a fall from the middle to the floor names T4 but cannot cost a heart", () => {
    ruler();
    const fall = shape((t) => (t < 0.3 ? 3 : Math.max(1, 3 - (t - 0.3) * 4)), 500);
    const r = classifyToneV2(fall)!;
    expect(r.tone).toBe(4);
    expect(r.decisive).toBe(false);
    setTuning({ toneReaderRuler: { ...tuning().toneReaderRuler, t4DecisiveMinPeakChao: null } });
    expect(classifyToneV2(fall)!.decisive).toBe(true);
  });
  it("a fall from the top is a decisive T4", () => {
    ruler();
    const r = classifyToneV2(shape((t) => (t < 0.2 ? 5 : Math.max(1, 5 - (t - 0.2) * 6)), 500))!;
    expect(r.tone).toBe(4);
    expect(r.decisive).toBe(true);
  });
  it("a T2 read whose dip runs off the bottom line is not decisive", () => {
    ruler();
    // Jane's textbook 找 zhǎo (a T3) on her one ruler with the voice 2 st
    // lower than calibrated: the dip sits on the bottom line for 320 ms and
    // the rest reads T2. Without the floor rule it was a decisive T2 (a heart).
    const zhao3Lower2: [number, number][] = [[0,1.89],[21,1.52],[43,1.21],[64,1.03],[85,1],[107,1],[128,1],[149,1],[171,1],[192,1],[213,1],[235,1],[256,1],[277,1],[299,1],[320,1],[341,1],[363,1],[384,1],[405,1],[427,1.1],[448,1.33],[469,1.55],[491,1.82],[512,2.07],[533,2.28],[555,2.72],[576,3.07],[597,3.53],[619,3.93],[640,4.12],[661,4.46]];
    const c: Contour = { points: zhao3Lower2.map(([tMs, chao]) => ({ tMs, chao })), startedAtMs: 0, endedAtMs: 661 };
    const r = classifyToneV2(c)!;
    expect(r.tone).toBe(2);
    expect(r.decisive).toBe(false);
    setTuning({ toneReaderRuler: { ...tuning().toneReaderRuler, t2FloorChao: null } });
    expect(classifyToneV2(c)!.decisive).toBe(true);
  });
});

describe("ruler reader: onset scoop", () => {
  it("a T2/T3 read after a skipped onset scoop cannot cost a heart (classifier-check's onset-swing shape)", () => {
    ruler();
    const t2 = AVERAGED_TONE_SHAPE_V2.textbook[2];
    const at = (t: number) => {
      const idx = t * (t2.length - 1);
      const i0 = Math.floor(idx);
      return t2[i0] + (t2[Math.min(t2.length - 1, i0 + 1)] - t2[i0]) * (idx - i0);
    };
    const points = [
      ...Array.from({ length: 6 }, (_, k) => ({ tMs: (k / 5) * 200, chao: 1 + (k / 5) * 4 })),
      ...Array.from({ length: 20 }, (_, k) => ({ tMs: 200 + (k / 19) * 800, chao: at(k / 19) })),
    ];
    const c: Contour = { points, startedAtMs: 0, endedAtMs: 1000 };
    expect(classifyToneV2(c)!.decisive).toBe(false);
    setTuning({ toneReaderRuler: { ...tuning().toneReaderRuler, t23ScoopNotDecisive: false } });
    expect(classifyToneV2(c)!.decisive).toBe(true);
  });
});

describe("one-ruler averages and default corridors behind the flag", () => {
  it("flag off: today's averages and corridors", () => {
    expect(averagedShapes().tone).toBe(AVERAGED_TONE_SHAPE);
    expect(referenceFor([2])).toBe(AVERAGED_TONE_SHAPE.textbook[2]);
    expect(shapeForTone(3).polyline).toEqual(DEFAULT_TUNING.polylines[3]);
  });
  it("flag on: the one-ruler averages and corridors", () => {
    ruler();
    expect(referenceFor([2], "natural")).toBe(AVERAGED_TONE_SHAPE_V2.natural[2]);
    expect(shapeForTone(3).polyline).toBe(DEFAULT_POLYLINES_V2[3]);
  });
  it("flag on: a Lab-edited corridor still wins", () => {
    ruler();
    const edited: [number, number][] = [[0, 2], [1, 4]];
    setTuning({ polylines: { ...tuning().polylines, 2: edited } });
    expect(shapeForTone(2).polyline).toEqual(edited);
  });
});
