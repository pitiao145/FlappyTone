import { describe, expect, it } from "vitest";
import {
  computeF0Center,
  computeNoiseFloor,
  NOISE_FLOOR_MIN,
  median,
} from "./calibration.ts";

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
