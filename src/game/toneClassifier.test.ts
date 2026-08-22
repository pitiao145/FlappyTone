import { describe, expect, it } from "vitest";
import { classifyTone } from "./toneClassifier.ts";
import type { Tone } from "./gates.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import type { Contour, ContourPoint } from "./contours.ts";

const TONES: Tone[] = [1, 2, 3, 4];

/** Linear lookup into a fixed, evenly-spaced-over-[0,1] shape array. */
function chaoAtT(shape: number[], t: number): number {
  const idx = t * (shape.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(shape.length - 1, i0 + 1);
  const frac = idx - i0;
  return shape[i0] + (shape[i1] - shape[i0]) * frac;
}

/**
 * Builds a synthetic contour by sampling a tone's own baked average shape
 * (`AVERAGED_TONE_SHAPE` — the classifier's actual templates) — so "the real
 * T3 shape" isn't hand-copied here, it's read from the same generated file
 * the classifier itself reads.
 *
 * `amplitudeScale` compresses the shape around its own mean (1 = untouched,
 * 0.3 = a shallow/quiet attempt) — for proving correlation-based matching is
 * scale-invariant.
 */
function contourFromTone(
  tone: Tone,
  durationMs: number,
  amplitudeScale = 1,
  n = 20,
): Contour {
  const shape = AVERAGED_TONE_SHAPE[tone];
  const raw = Array.from({ length: n }, (_, k) => chaoAtT(shape, k / (n - 1)));
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const points: ContourPoint[] = raw.map((chao, k) => ({
    tMs: (k / (n - 1)) * durationMs,
    chao: mean + (chao - mean) * amplitudeScale,
  }));
  return { points, startedAtMs: 0, endedAtMs: durationMs };
}

function flatContour(chao: number, n = 10, durationMs = 500): Contour {
  return {
    points: Array.from({ length: n }, (_, k) => ({
      tMs: (k / (n - 1)) * durationMs,
      chao,
    })),
    startedAtMs: 0,
    endedAtMs: durationMs,
  };
}

describe("classifyTone", () => {
  it("returns null for fewer than 2 points", () => {
    expect(classifyTone({ points: [], startedAtMs: 0, endedAtMs: 0 })).toBeNull();
    expect(
      classifyTone({
        points: [{ tMs: 0, chao: 3 }],
        startedAtMs: 0,
        endedAtMs: 0,
      }),
    ).toBeNull();
  });

  it("self-classifies each canonical tone shape", () => {
    for (const tone of TONES) {
      const result = classifyTone(contourFromTone(tone, 800));
      expect(result).not.toBeNull();
      expect(result!.tone).toBe(tone);
    }
  });

  it("classifies a flat contour as T1, whatever its level", () => {
    expect(classifyTone(flatContour(4.5))?.tone).toBe(1);
    expect(classifyTone(flatContour(2))?.tone).toBe(1);
  });

  it("still classifies correctly when said twice as slowly", () => {
    for (const tone of [2, 3, 4] as Tone[]) {
      const result = classifyTone(contourFromTone(tone, 1600));
      expect(result?.tone).toBe(tone);
    }
  });

  it("still classifies correctly when said twice as fast", () => {
    for (const tone of [2, 3, 4] as Tone[]) {
      const result = classifyTone(contourFromTone(tone, 400));
      expect(result?.tone).toBe(tone);
    }
  });

  it("still classifies correctly when shallow/quiet (scale-invariance)", () => {
    for (const tone of [2, 3, 4] as Tone[]) {
      const result = classifyTone(contourFromTone(tone, 800, 0.3));
      expect(result?.tone).toBe(tone);
    }
  });

  it("classifies an oscillating shape unlike any tone as none", () => {
    const n = 16;
    const points: ContourPoint[] = Array.from({ length: n }, (_, k) => ({
      tMs: (k / (n - 1)) * 800,
      chao: k % 2 === 0 ? 5 : 1,
    }));
    const result = classifyTone({ points, startedAtMs: 0, endedAtMs: 800 });
    expect(result?.tone).toBe("none");
  });
});
