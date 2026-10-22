import { describe, expect, it } from "vitest";
import {
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_UP_SEMITONES_MIN,
} from "../../pitch/calibration.ts";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { quickCalibration } from "./quickCal.ts";

const SR = 48000;
const HOP = 1024;
const FRAME = 2048;

/** Voiced f0s a real tracker reads from a synthetic voice gliding f0a → f0b. */
function f0sFromSynth(f0a: number, f0b: number, seconds: number): number[] {
  const tracker = new PitchTracker({ sampleRate: SR, f0Center: 168, noiseFloor: 0.0005 });
  const total = Math.floor(seconds * SR);
  const signal = new Float32Array(total);
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const f = f0a + ((f0b - f0a) * i) / total;
    phase += (2 * Math.PI * f) / SR;
    // A few harmonics, like a voice, not a pure sine.
    signal[i] = 0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
  }
  const out: number[] = [];
  for (let start = 0; start + FRAME <= total; start += HOP) {
    const p = tracker.push(signal.slice(start, start + FRAME));
    if (p.voiced && p.f0 !== null) out.push(p.f0);
  }
  return out;
}

const inBounds = (c: { rangeSemitones: number; rangeDownSemitones: number }) => {
  expect(c.rangeSemitones).toBeGreaterThanOrEqual(RANGE_UP_SEMITONES_MIN);
  expect(c.rangeSemitones).toBeLessThanOrEqual(RANGE_SEMITONES_MAX);
  expect(c.rangeDownSemitones).toBeGreaterThanOrEqual(RANGE_DOWN_SEMITONES_MIN);
  expect(c.rangeDownSemitones).toBeLessThanOrEqual(RANGE_SEMITONES_MAX);
};

describe("quickCalibration", () => {
  it("a female-range mā (240 Hz) and mǎ dip (180→150 Hz) give a sane board", () => {
    const high = f0sFromSynth(240, 242, 0.8);
    const low = f0sFromSynth(180, 150, 0.8);
    expect(high.length).toBeGreaterThan(10);
    const c = quickCalibration(high, low, 0.001)!;
    expect(c).not.toBeNull();
    expect(c.f0Center).toBeGreaterThan(160);
    expect(c.f0Center).toBeLessThan(240);
    inBounds(c);
  });

  it("a male-range voice (130 Hz level, 100→85 Hz low) gives a sane board", () => {
    const c = quickCalibration(f0sFromSynth(130, 131, 0.8), f0sFromSynth(100, 85, 0.8), 0.001)!;
    expect(c).not.toBeNull();
    expect(c.f0Center).toBeGreaterThan(85);
    expect(c.f0Center).toBeLessThan(130);
    inBounds(c);
  });

  it("an extreme spread is clamped to the calibration.ts bounds", () => {
    const c = quickCalibration(Array(30).fill(400), Array(30).fill(80), 0.001)!;
    inBounds(c);
    expect(c.rangeSemitones).toBe(RANGE_SEMITONES_MAX);
  });

  it("refuses two takes at the same height (a hum, or one tone twice)", () => {
    expect(quickCalibration(Array(30).fill(200), Array(30).fill(195), 0.001)).toBeNull();
  });

  it("refuses a take that is too short", () => {
    expect(quickCalibration(Array(5).fill(240), Array(30).fill(150), 0.001)).toBeNull();
  });
});
