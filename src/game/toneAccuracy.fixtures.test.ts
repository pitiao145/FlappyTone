/**
 * Tone accuracy on Jane's ground-truth captures, through the same PitchTracker
 * the game uses. Node-only (reads WAVs), so it is excluded from
 * tsconfig.app.json like src/pitch/fixtures.test.ts.
 *
 * These are tracked on the default range, not her calibrated board, so the
 * absolute numbers sit lower than in the game (her published ma2 clip, on her
 * calibrated board, scores 0.86 where this raw capture scores ~0.6). What
 * must hold regardless of calibration: the right tone wins, clearly.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeWav } from "../dev/wav.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { ContourPoint } from "./contours.ts";
import type { Tone } from "./gates.ts";
import { longestUtterance, toneAccuracy } from "./toneAccuracy.ts";

const JANE_F0_CENTER = 168;

function utteranceOf(file: string): ContourPoint[] {
  const { samples, sampleRate } = decodeWav(readFileSync(`fixtures/captures/${file}`));
  const tracker = new PitchTracker({ sampleRate, f0Center: JANE_F0_CENTER });
  const points: ContourPoint[] = [];
  for (let s = 0; s + 2048 <= samples.length; s += 1024) {
    const state = tracker.push(samples.subarray(s, s + 2048));
    if (state.voiced) points.push({ tMs: (s / sampleRate) * 1000, chao: state.smoothedChao });
  }
  return longestUtterance(points, 150);
}

describe("toneAccuracy — jane_ma*.wav through the real pitch pipeline", () => {
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    it(`jane_ma${tone}: Tone ${tone} scores highest, by a clear margin`, () => {
      const u = utteranceOf(`jane_ma${tone}.wav`);
      const right = toneAccuracy(u, [tone])!;
      expect(right).toBeGreaterThan(0.55);
      for (const other of [1, 2, 3, 4] as Tone[]) {
        if (other === tone) continue;
        expect(right - toneAccuracy(u, [other])!).toBeGreaterThan(0.2);
      }
    });
  }
});
