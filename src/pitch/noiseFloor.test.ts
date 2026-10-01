import { describe, expect, it } from "vitest";
import { NoiseFloorTracker } from "./math.ts";
import { PitchTracker } from "./PitchTracker.ts";

const SR = 44100;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
function noiseFrame(r: () => number, amp: number): Float32Array {
  return Float32Array.from({ length: 2048 }, () => amp * r());
}
/** A buzzy 200 Hz tone (harmonics, like a voice) plus noise. */
function voiceFrame(r: () => number, amp: number, noise: number, t0: number): Float32Array {
  return Float32Array.from({ length: 2048 }, (_, i) => {
    const t = (t0 + i) / SR;
    let v = 0;
    for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * 200 * k * t) / k;
    return amp * v + noise * r();
  });
}

describe("NoiseFloorTracker", () => {
  it("reads a low percentile of the window and forgets old frames", () => {
    const n = new NoiseFloorTracker(10, 0.1);
    for (let i = 1; i <= 10; i++) n.push(i);
    expect(n.estimate()).toBe(2);
    for (let i = 0; i < 10; i++) n.push(100);
    expect(n.estimate()).toBe(100);
  });
});

describe("PitchTracker adaptive floor", () => {
  it("is off by default: loud stationary noise still reaches clarity alone", () => {
    const t = new PitchTracker({ sampleRate: SR });
    expect(t.getEffectiveNoiseFloor()).toBe(t.getConfig().noiseFloor);
  });

  it("raises the gate to the room and keeps a voice well above it", () => {
    const r = rng(1);
    const t = new PitchTracker({ sampleRate: SR, f0Center: 200, adaptiveGateOverNoise: 2 });
    for (let i = 0; i < 100; i++) t.push(noiseFrame(r, 0.1));
    expect(t.getEffectiveNoiseFloor()).toBeGreaterThan(0.03);
    let voiced = 0;
    for (let i = 0; i < 20; i++) if (t.push(voiceFrame(r, 0.3, 0.1, i * 1024)).voiced) voiced++;
    expect(voiced).toBeGreaterThanOrEqual(18);
  });

  it("a tracker that hears the voice first does not gate it out", () => {
    const r = rng(2);
    const t = new PitchTracker({ sampleRate: SR, f0Center: 200, adaptiveGateOverNoise: 2 });
    let voiced = 0;
    for (let i = 0; i < 40; i++) if (t.push(voiceFrame(r, 0.3, 0.01, i * 1024)).voiced) voiced++;
    expect(voiced).toBeGreaterThanOrEqual(38);
  });

  it("never drops the gate below the calibrated floor", () => {
    const t = new PitchTracker({ sampleRate: SR, noiseFloor: 0.01, adaptiveGateOverNoise: 2 });
    for (let i = 0; i < 50; i++) t.push(new Float32Array(2048));
    expect(t.getEffectiveNoiseFloor()).toBe(0.01);
  });
});

describe("adaptive seed", () => {
  it("starts from a carried room estimate instead of the calibrated floor", () => {
    const t = new PitchTracker({ sampleRate: SR, noiseFloor: 0.002, adaptiveGateOverNoise: 2, adaptiveSeedRms: 0.05 });
    t.push(new Float32Array(2048));
    expect(t.getEffectiveNoiseFloor()).toBeCloseTo((0.05 * 2) / 3, 5);
  });
});
