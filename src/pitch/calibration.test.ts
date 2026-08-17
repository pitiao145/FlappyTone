import { describe, expect, it } from "vitest";
import {
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_SEMITONES_MIN,
  RANGE_UP_SEMITONES_MIN,
  computeF0Center,
  computeNoiseFloor,
  computeRangeHalves,
  computeRangeHalvesFromExtremes,
  computeRangeSemitones,
  NOISE_FLOOR_MIN,
  median,
  REACH_TO_TONE_SPACE_UP,
  REACH_TO_TONE_SPACE_DOWN,
} from "./calibration.ts";
import { semitonesToChao } from "./math.ts";

describe("median", () => {
  it("finds the middle element of an odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5, 3, 7, 2, 8])).toBe(5);
  });

  it("averages the two middle elements of an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
  });

  it("handles a single-element array", () => {
    expect(median([42])).toBe(42);
  });

  it("throws on an empty array", () => {
    expect(() => median([])).toThrow("median of empty array");
  });
});

describe("computeNoiseFloor", () => {
  it("returns NOISE_FLOOR_MIN for an empty array", () => {
    expect(computeNoiseFloor([])).toBe(NOISE_FLOOR_MIN);
  });

  it("returns the median of typical RMS values", () => {
    const frames = [0.001, 0.0005, 0.0008, 0.0012, 0.0006];
    const result = computeNoiseFloor(frames);
    expect(result).toBeCloseTo(0.0008);
  });

  it("floors at NOISE_FLOOR_MIN even with small values", () => {
    const frames = [1e-6, 1e-7, 1e-8];
    const result = computeNoiseFloor(frames);
    expect(result).toBe(NOISE_FLOOR_MIN);
  });

  it("uses median when it exceeds the floor", () => {
    const frames = [0.0005, 0.0002, 0.0001];
    const result = computeNoiseFloor(frames);
    expect(result).toBeCloseTo(0.0002);
  });
});

describe("computeF0Center", () => {
  it("returns the median of voiced f0s when there are at least 10 samples", () => {
    const voicedF0s = [100, 110, 105, 115, 95, 120, 100, 105, 110, 100];
    const result = computeF0Center(voicedF0s);
    expect(result).toBeCloseTo(105);
  });

  it("returns null when there are fewer than 10 samples", () => {
    expect(computeF0Center([100, 105, 110, 115])).toBeNull();
    expect(computeF0Center([])).toBeNull();
    expect(computeF0Center([100])).toBeNull();
  });

  it("returns null for exactly 9 samples", () => {
    const voicedF0s = Array.from({ length: 9 }, () => 100);
    expect(computeF0Center(voicedF0s)).toBeNull();
  });

  it("returns a value for exactly 10 samples", () => {
    const voicedF0s = Array.from({ length: 10 }, () => 100);
    expect(computeF0Center(voicedF0s)).toBe(100);
  });
});

describe("computeRangeSemitones", () => {
  /** A ramp of `n` values spread evenly across [lo, hi]. */
  const ramp = (lo: number, hi: number, n = 100) =>
    Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

  it("returns half the p10–p90 span of the speaker's excursion", () => {
    // -5..+4.9 ramp: p10 ≈ -4, p90 ≈ +4, so the board should span ±4.
    expect(computeRangeSemitones(ramp(-5, 4.9))).toBeCloseTo(4, 1);
  });

  it("ignores a wild outlier frame", () => {
    // One octave-error frame must not stretch the whole board. This is why the
    // span is taken between percentiles rather than min and max.
    const withGlitch = [...ramp(-5, 4.9), 50];
    expect(computeRangeSemitones(withGlitch)).toBeCloseTo(4, 0);
  });

  it("rounds to the half-semitone the slider uses", () => {
    const r = computeRangeSemitones(ramp(-5, 4.9));
    expect((r! * 2) % 1).toBe(0);
  });

  it("returns null for a capture too sparse to trust", () => {
    expect(computeRangeSemitones([0, 1, 2])).toBeNull();
  });

  it("never collapses the board for a monotone speaker", () => {
    expect(computeRangeSemitones(ramp(0, 0.05))).toBe(RANGE_SEMITONES_MIN);
  });

  it("never widens the board past what the tone marks stay legible in", () => {
    expect(computeRangeSemitones(ramp(-30, 30))).toBe(RANGE_SEMITONES_MAX);
  });
});

describe("computeRangeHalvesFromExtremes", () => {
  const many = (v: number, n = 40) => Array.from({ length: n }, () => v);

  it("takes each half from its own sweep", () => {
    expect(computeRangeHalvesFromExtremes(many(5), many(-5))).toEqual({
      up: 5,
      down: 3,
    });
  });

  it("puts the tone space inside the reach, not at its edge", () => {
    // The reported defect: chao 5 sat at the top of a comfortable "ahh", so
    // Tone 1 asked for a shout. A reach bounds the board; it is not the board.
    expect(computeRangeHalvesFromExtremes(many(10), many(-10))).toEqual({
      up: 10 * REACH_TO_TONE_SPACE_UP,
      down: 10 * REACH_TO_TONE_SPACE_DOWN,
    });
  });

  it("a sparse sweep yields null rather than a confident wrong answer", () => {
    expect(computeRangeHalvesFromExtremes([4, 4, 4], many(-4))).toBeNull();
    expect(computeRangeHalvesFromExtremes(many(4), [-4])).toBeNull();
  });

  it("clamps each half into the usable band", () => {
    expect(computeRangeHalvesFromExtremes(many(40), many(-40))).toEqual({
      up: RANGE_SEMITONES_MAX,
      down: RANGE_SEMITONES_MAX,
    });
    expect(computeRangeHalvesFromExtremes(many(0.2), many(-0.2))).toEqual({
      up: RANGE_UP_SEMITONES_MIN,
      down: RANGE_DOWN_SEMITONES_MIN,
    });
  });

  it("does not spend an upward reach on the downward half", () => {
    // The defect this replaced. Someone reaching 10 st up and 2 st down was
    // handed a symmetric +-6 board: their deepest note drew at chao 2.33 and
    // chao 1 asked for three times the excursion they had just demonstrated.
    // Each half now answers to the sweep that measured it.
    expect(computeRangeHalvesFromExtremes(many(10), many(-2))).toEqual({
      up: 10,
      down: RANGE_DOWN_SEMITONES_MIN,
    });
  });

  it("floors a speaker who never went below their centre", () => {
    // Not mirrored from the up half — floored. The board stays legible
    // without pretending they demonstrated a downward reach they did not.
    expect(computeRangeHalvesFromExtremes(many(8), many(0))).toEqual({
      up: 8,
      down: RANGE_DOWN_SEMITONES_MIN,
    });
  });

  it("never puts chao 1 past the deepest note the speaker demonstrated", () => {
    // A real measurement, 9 Aug 2026: +10.9 / -2.7 st. Unscaled, this board
    // made Tone 1 unreachable (chao 5 at +10 st) and drew an ordinary Tone 2
    // onset on the floor (chao 1 at -2.7). The floor still applies to the
    // scaled down half, and that is fine -- what must never happen is chao 1
    // landing below the 2.7 he actually reached, which is where the T3
    // corridor trough would become a wall.
    const many27 = Array.from({ length: 40 }, () => -2.7);
    const halves = computeRangeHalvesFromExtremes(many(10.9), many27)!;
    expect(halves).toEqual({ up: RANGE_SEMITONES_MAX, down: RANGE_DOWN_SEMITONES_MIN });
    expect(halves.down).toBeLessThanOrEqual(2.7);
  });

  it("ignores a single wild frame at either extreme", () => {
    const high = [...many(5, 39), 30];
    const low = [...many(-5, 39), -30];
    expect(computeRangeHalvesFromExtremes(high, low)).toEqual({
      up: 5,
      down: 3,
    });
  });

  it("reads a real T1 excursion much closer to chao 5 than the old shared scale did", () => {
    // The regression this split targets: a natural, correctly-produced Tone 1
    // (measured off fixtures/captures/jane_ma1.wav — clean f0 ~211-234 Hz
    // against her f0Center of 168 Hz, i.e. ~4-5.7 semitones above centre)
    // should draw much closer to the top of the board than the old shared
    // 0.6 scale allowed for a plausible "as high as comfortable" sweep.
    const plausibleSweepP90 = 6; // a moderate, not-maximal, comfortable reach
    const halves = computeRangeHalvesFromExtremes(
      many(plausibleSweepP90),
      many(-9),
    )!;
    const realT1Semitones = 5;
    const chao = semitonesToChao(realT1Semitones, halves.up, halves.down);
    // 4.5 isn't arbitrary: base corridor tolerance is baseToleranceH 0.11 of
    // a 4-chao-unit span, i.e. within ~0.44 chao — so this bar is "inside the
    // wall", not just "an improvement."
    expect(chao).toBeGreaterThanOrEqual(4.5);
  });
});

describe("computeRangeHalves", () => {
  const ramp = (lo: number, hi: number, n = 100) =>
    Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

  it("reads each half off its own trimmed extreme", () => {
    // A preview sitting mostly above centre: the up half is the one that grows.
    const halves = computeRangeHalves(ramp(-2, 10));
    expect(halves).not.toBeNull();
    expect(halves!.up).toBeGreaterThan(halves!.down);
  });

  it("is null on a capture too sparse to say anything", () => {
    expect(computeRangeHalves([1, 2, 3])).toBeNull();
  });

  it("is not scaled by the reach factor, unlike the sweeps", () => {
    // Deliberate, and the cross-check between the two paths: a preview is the
    // player producing tones, so it already measures a tone space. A sweep is
    // a reach. Scaling this one too would shrink the board twice.
    // p90 and p10 of this ramp are +-4.09 st; scaled they would be 2.5.
    expect(computeRangeHalves(ramp(-5, 5))).toEqual({ up: 4, down: 4 });
  });
});
