/**
 * Fixture tests — the offline check that the pipeline actually tracks a real
 * voice. See docs/TESTING.md. These run the same PitchTracker the game uses.
 *
 * jane_ma*.wav are a native Taiwanese speaker recorded direct to an iPhone mic,
 * with audible wind in the room. jane_ma0_neutral is neutral tone (out of v1 scope) and
 * is kept as reference material only.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeWav } from "../dev/wav.ts";
import { PitchTracker } from "./PitchTracker.ts";
import type { PitchState } from "./types.ts";

const FRAME = 2048;
const HOP = 1024;
/** Pooled median voiced f0 across Jane's tone recordings. */
const JANE_F0_CENTER = 168;

interface Frame extends PitchState {
  t: number;
}

function track(file: string, f0Center: number): Frame[] {
  const { samples, sampleRate } = decodeWav(readFileSync(`fixtures/captures/${file}`));
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const out: Frame[] = [];
  for (let s = 0; s + FRAME <= samples.length; s += HOP) {
    out.push({ ...tracker.push(samples.subarray(s, s + FRAME)), t: s / sampleRate });
  }
  return out;
}

const between = (frames: Frame[], a: number, b: number) =>
  frames.filter((f) => f.t >= a && f.t < b);

describe("jane_ma4 — native Tone 4 fall", () => {
  const frames = track("jane_ma4.wav", JANE_F0_CENTER);

  it("stays deaf through the wind before she speaks", () => {
    // The first ~0.95s is room noise. Scoring it would be worse than useless.
    expect(between(frames, 0, 0.9).every((f) => !f.voiced)).toBe(true);
  });

  it("tracks the steep part of the fall instead of going deaf", () => {
    // 1.15–1.35s is where clarity collapses to 0.44–0.59 as the pitch slews.
    // The signal is at full vowel loudness throughout; dropping it is a bug.
    const fall = between(frames, 1.15, 1.36);
    const voiced = fall.filter((f) => f.voiced);
    expect(voiced.length).toBeGreaterThanOrEqual(8);
  });

  it("descends through the middle of the range rather than jumping the gap", () => {
    // A truncated fall reads as "high, then nothing, then low". A tracked one
    // passes through the middle. Require samples in the middle third.
    const fall = between(frames, 1.1, 1.5).filter((f) => f.voiced);
    const mid = fall.filter((f) => f.semitones !== null && f.semitones > -2 && f.semitones < 6);
    expect(mid.length).toBeGreaterThanOrEqual(3);
  });
});

describe("jane_ma3 — citation Tone 3", () => {
  const frames = track("jane_ma3.wav", JANE_F0_CENTER);

  it("shows a dip below the centre followed by a rise above it", () => {
    const voiced = frames.filter((f) => f.voiced && f.semitones !== null);
    const lowIdx = voiced.findIndex((f) => f.semitones! < -2);
    expect(lowIdx).toBeGreaterThanOrEqual(0);
    const after = voiced.slice(lowIdx);
    expect(Math.max(...after.map((f) => f.semitones!))).toBeGreaterThan(0);
  });
});

describe("jane_ma1 — level Tone 1", () => {
  const frames = track("jane_ma1.wav", JANE_F0_CENTER);

  it("holds a steady pitch without pinning to a clamp rail", () => {
    const voiced = frames.filter((f) => f.voiced && f.chao !== null);
    expect(voiced.length).toBeGreaterThanOrEqual(20);
    const chao = voiced.map((f) => f.chao!);
    // Not stuck on the ceiling: a pinned contour is unscoreable (PRD §10).
    expect(chao.filter((c) => c >= 4.99).length / chao.length).toBeLessThan(0.5);
    // And genuinely level.
    expect(Math.max(...chao) - Math.min(...chao)).toBeLessThan(1.5);
  });
});
