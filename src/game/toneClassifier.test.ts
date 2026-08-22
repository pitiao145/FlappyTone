import { describe, expect, it } from "vitest";
import { classifyTone } from "./toneClassifier.ts";
import type { Tone } from "./gates.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { resetTuning, setTuning } from "./tuning.ts";
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
 *
 * Prepends a single dummy point at `tMs=0` before the real shape starts (at
 * 30% of `durationMs` in) — `classifyTone`'s default onset trim (15% of the
 * contour's own span) removes only that dummy point, leaving the real shape
 * intact, the same way it's meant to discard a genuine onset artifact from a
 * real recording without eating into the tone itself. Without this padding,
 * these tests would be trimming into the real shape they're trying to
 * verify, since a synthetic contour built by directly sampling the template
 * has no actual onset noise to discard.
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
  const onsetMs = durationMs * 0.3;
  const points: ContourPoint[] = [
    { tMs: 0, chao: 3 },
    ...raw.map((chao, k) => ({
      tMs: onsetMs + (k / (n - 1)) * durationMs,
      chao: mean + (chao - mean) * amplitudeScale,
    })),
  ];
  return { points, startedAtMs: 0, endedAtMs: onsetMs + durationMs };
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

  describe("onset trim", () => {
    it("discards a large spurious onset swing before classifying", () => {
      // A wild ramp (chao 1 -> 5) across the first 20% of the utterance,
      // then a clean T2 shape for the rest. Untrimmed, this swing would
      // dominate the resampled vector; trimmed, only the real T2 shape
      // should remain and classify correctly.
      const shape = AVERAGED_TONE_SHAPE[2];
      const onsetMs = 200;
      const realMs = 800;
      const onset: ContourPoint[] = Array.from({ length: 6 }, (_, k) => ({
        tMs: (k / 5) * onsetMs,
        chao: 1 + (k / 5) * 4,
      }));
      const real: ContourPoint[] = Array.from({ length: 20 }, (_, k) => ({
        tMs: onsetMs + (k / 19) * realMs,
        chao: chaoAtT(shape, k / 19),
      }));
      const result = classifyTone({
        points: [...onset, ...real],
        startedAtMs: 0,
        endedAtMs: onsetMs + realMs,
      });
      expect(result?.tone).toBe(2);
    });
  });

  describe("tone 1 continuous confidence", () => {
    it("still recognizes T1 when an onset swing inflates the raw excursion", () => {
      // Before the onset trim existed, this exact shape — a swing for the
      // first fraction of the utterance, then a genuinely flat rest — would
      // have measured a large raw excursion and never been offered to T1's
      // flatness check at all under the old binary gate. The ramp finishes
      // well inside the default 15% trim window (100ms of an eventual
      // ~900ms span), so nothing but flat chao survives trimming.
      const onsetMs = 100;
      const flatMs = 800;
      const onset: ContourPoint[] = Array.from({ length: 6 }, (_, k) => ({
        tMs: (k / 5) * onsetMs,
        chao: 1 + (k / 5) * 3.5, // swings well past the old binary threshold
      }));
      const flat: ContourPoint[] = Array.from({ length: 10 }, (_, k) => ({
        tMs: onsetMs + (k / 9) * flatMs,
        chao: 4.5,
      }));
      const result = classifyTone({
        points: [...onset, ...flat],
        startedAtMs: 0,
        endedAtMs: onsetMs + flatMs,
      });
      expect(result?.tone).toBe(1);
    });

    it("scores flatness continuously rather than as a binary gate", () => {
      // A gentle, genuinely non-flat wobble should score high but not the
      // maximum confidence a perfectly flat line gets.
      const wobble = flatContour(4.5);
      wobble.points = wobble.points.map((p, i) => ({
        ...p,
        chao: p.chao + (i % 2 === 0 ? 0.15 : -0.15),
      }));
      const flat = classifyTone(flatContour(4.5));
      const gentle = classifyTone(wobble);
      expect(flat?.tone).toBe(1);
      expect(gentle?.tone).toBe(1);
      expect(gentle!.confidence).toBeLessThan(flat!.confidence);
    });
  });

  describe("margin / ambiguity", () => {
    it("reports none when the winner doesn't clear the runner-up by the margin threshold", () => {
      try {
        const attempt = contourFromTone(2, 800);
        // A clear win at the shipped default margin.
        expect(classifyTone(attempt)?.tone).toBe(2);

        // Cranking the margin requirement far past what any real winner
        // could clear turns the same clean attempt into "none" — proving
        // the winner-minus-runner-up subtraction is actually wired in, not
        // just the raw confidence floor.
        setTuning({ toneClassifierMarginThreshold: 0.95 });
        expect(classifyTone(attempt)?.tone).toBe("none");
      } finally {
        resetTuning();
      }
    });
  });
});
