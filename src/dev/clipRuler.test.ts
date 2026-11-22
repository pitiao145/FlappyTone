import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JANE_RULER, rulerFor, rulerReference, shapeOnRuler } from "./clipRuler.ts";
import { decodeWav } from "./wav.ts";

const load = (f: string) => decodeWav(new Uint8Array(readFileSync(`fixtures/captures/${f}`)));

describe("clipRuler (process-clips --one-ruler, brief 51)", () => {
  it("has Jane's brief 43 ruler and none for an unmeasured voice", () => {
    expect(rulerFor("jane")).toBe(JANE_RULER);
    expect(JANE_RULER).toMatchObject({ middleHz: 197.4, upSemitones: 5.75, downSemitones: 7.25 });
    expect(rulerFor("mark")).toBeNull();
  });

  it("writes the same meta.reference as golive-shapes", () => {
    expect(rulerReference(JANE_RULER, "s1")).toEqual({
      session: "s1",
      f0Center: 197.4,
      rangeSemitones: 6.5,
      upSemitones: 5.75,
      downSemitones: 7.25,
    });
  });

  it("shapes a first tone level, a fourth tone falling, on the ruler", () => {
    const t1 = load("jane_ma1.wav");
    const s1 = shapeOnRuler(t1.samples, t1.sampleRate, JANE_RULER, 1, 1);
    // Level. The capture is an older sitting said at spoken height (like the
    // 30 older first-tone words), so it sits at 3.4, not near 5: pinned here
    // so a change to the ruler path shows up.
    expect(s1.polyline.length).toBe(2);
    expect(s1.polyline[0][1]).toBe(s1.polyline[1][1]);
    expect(s1.polyline[0][1]).toBeCloseTo(3.403, 2);
    const t4 = load("jane_ma4.wav");
    const s4 = shapeOnRuler(t4.samples, t4.sampleRate, JANE_RULER, 4, 1);
    expect(s4.polyline[0][1] - s4.polyline.at(-1)![1]).toBeGreaterThan(2);
    for (const s of [s1, s4]) {
      for (const [t, c] of s.contour) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(5);
      }
      expect(s.durationMs).toBeGreaterThan(200);
      expect(s.clipMs).toBeGreaterThanOrEqual(s.onsetMs + s.durationMs - 1);
    }
  });
});
