import { describe, expect, it } from "vitest";
import {
  MedianFilter,
  correctOctave,
  hzToSemitones,
  semitonesToChao,
} from "./math.ts";
import { PitchTracker } from "./PitchTracker.ts";

describe("hzToSemitones / semitonesToChao", () => {
  it("maps f0Center to chao 3", () => {
    expect(hzToSemitones(120, 120)).toBeCloseTo(0);
    expect(semitonesToChao(0)).toBeCloseTo(3);
  });

  it("maps +5 semitones to chao 5 and -5 to chao 1", () => {
    const up = 120 * Math.pow(2, 5 / 12);
    expect(semitonesToChao(hzToSemitones(up, 120))).toBeCloseTo(5);
    const down = 120 * Math.pow(2, -5 / 12);
    expect(semitonesToChao(hzToSemitones(down, 120))).toBeCloseTo(1);
  });

  it("maps ±2.5 semitones to chao 4 and 2", () => {
    expect(semitonesToChao(2.5)).toBeCloseTo(4);
    expect(semitonesToChao(-2.5)).toBeCloseTo(2);
  });

  it("clamps outside the 10-semitone range", () => {
    expect(semitonesToChao(12)).toBe(5);
    expect(semitonesToChao(-12)).toBe(1);
  });
});

describe("correctOctave", () => {
  it("snaps a 2x jump down", () => {
    expect(correctOctave(240, 121)).toBeCloseTo(120);
  });

  it("snaps a 0.5x jump up", () => {
    expect(correctOctave(61, 121)).toBeCloseTo(122);
  });

  it("leaves normal movement alone", () => {
    expect(correctOctave(140, 120)).toBe(140);
    expect(correctOctave(120, null)).toBe(120);
  });
});

describe("MedianFilter", () => {
  it("rejects a single-frame spike", () => {
    const f = new MedianFilter(5);
    f.push(100);
    f.push(101);
    f.push(300); // spike
    f.push(102);
    expect(f.push(103)).toBe(102);
  });
});

describe("PitchTracker on a synthetic sine", () => {
  const sampleRate = 44100;

  function sineFrame(freq: number, size = 2048, offset = 0): Float32Array {
    const frame = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      frame[i] = 0.5 * Math.sin((2 * Math.PI * freq * (i + offset)) / sampleRate);
    }
    return frame;
  }

  it("detects 220 Hz as voiced with chao above centre for f0Center=120", () => {
    const tracker = new PitchTracker({ sampleRate });
    let state = tracker.push(sineFrame(220));
    for (let k = 1; k < 6; k++) state = tracker.push(sineFrame(220, 2048, k * 2048));
    expect(state.voiced).toBe(true);
    expect(state.f0).toBeGreaterThan(215);
    expect(state.f0).toBeLessThan(225);
    expect(state.chao).toBe(5); // 220 Hz is ~10.5 st above 120 → clamped to 5
  });

  it("treats silence as unvoiced and holds smoothedChao", () => {
    const tracker = new PitchTracker({ sampleRate });
    const state = tracker.push(new Float32Array(2048));
    expect(state.voiced).toBe(false);
    expect(state.f0).toBeNull();
    expect(state.smoothedChao).toBe(3);
  });

  it("rejects out-of-band frequencies", () => {
    const tracker = new PitchTracker({ sampleRate });
    const state = tracker.push(sineFrame(1000));
    expect(state.voiced).toBe(false);
  });
});
