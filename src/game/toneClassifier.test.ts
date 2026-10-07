import { describe, expect, it } from "vitest";
import { classifyTone } from "./toneClassifier.ts";
import type { Tone } from "./gates.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import { resetTuning, setTuning } from "./tuning.ts";
import type { Contour, ContourPoint } from "./contours.ts";
import { corridorChaoAt, shapeForTone } from "./gates.ts";

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
  const shape = AVERAGED_TONE_SHAPE.textbook[tone];
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
      const shape = AVERAGED_TONE_SHAPE.textbook[2];
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
      // A swing for the first fraction of the utterance, then a genuinely
      // flat rest. The onset trim (now a small 5% by default — see
      // toneClassifierOnsetTrimFraction) alone would not fully clear a
      // swing this size; it's T1's own tail-only judging window
      // (toneClassifierT1TailFraction) that ignores it regardless.
      const onsetMs = 300;
      const flatMs = 800;
      const onset: ContourPoint[] = Array.from({ length: 6 }, (_, k) => ({
        tMs: (k / 5) * onsetMs,
        chao: 1 + (k / 5) * 3.5,
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

    it("is the tail window doing the rescue, not the (now small) shared trim", () => {
      // Same shape as above, but with the shared onset trim forced to 0 —
      // if T1 were still relying on trimOnset for protection, this would
      // fail. It shouldn't, because toneClassifierT1TailFraction ignores
      // the front of the sample independently of trimOnset.
      try {
        setTuning({ toneClassifierOnsetTrimFraction: 0 });
        const onsetMs = 300;
        const flatMs = 800;
        const onset: ContourPoint[] = Array.from({ length: 6 }, (_, k) => ({
          tMs: (k / 5) * onsetMs,
          chao: 1 + (k / 5) * 3.5,
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
      } finally {
        resetTuning();
      }
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
    it("reports none when the winning family doesn't clear the runner-up by the margin threshold", () => {
      try {
        const attempt = contourFromTone(2, 800);
        // A clear win at the shipped default margin.
        expect(classifyTone(attempt)?.tone).toBe(2);

        // A margin no score in 0..1 can clear turns the same clean attempt
        // into "none" — proving the family-vs-family subtraction is wired
        // in, not just the raw confidence floor.
        setTuning({ toneClassifierMarginThreshold: 1.01 });
        expect(classifyTone(attempt)?.tone).toBe("none");
      } finally {
        resetTuning();
      }
    });
  });

  describe("T2 vs T3", () => {
    /** A shape given as values evenly spread over `durationMs`. */
    function contourOf(values: number[], durationMs = 900): Contour {
      return {
        points: values.map((chao, i) => ({ tMs: (i / (values.length - 1)) * durationMs, chao })),
        startedAtMs: 0,
        endedAtMs: durationMs,
      };
    }

    it("anchors the vote on the averages: the T2 average votes about -1, the T3 average about +1", () => {
      const t2 = classifyTone(contourOf(AVERAGED_TONE_SHAPE.textbook[2]));
      const t3 = classifyTone(contourOf(AVERAGED_TONE_SHAPE.textbook[3]));
      expect(t2?.tone).toBe(2);
      expect(t3?.tone).toBe(3);
      // Not exactly ±1: the shape vote reads the onset-trimmed contour.
      expect(t2!.t2t3Cue!).toBeCloseTo(-1, 0);
      expect(t3!.t2t3Cue!).toBeCloseTo(1, 0);
      expect(t2!.decisive && t3!.decisive).toBe(true);
    });

    it("reports no T2/T3 vote for a level or falling shape", () => {
      expect(classifyTone(flatContour(4.5))?.t2t3Cue).toBeNull();
      expect(classifyTone(contourFromTone(4, 800))?.t2t3Cue).toBeNull();
    });

    it("recognizes a real hold-then-rise T3, however long the hold", () => {
      // Reported against a played-back Lab session (25 Aug 2026): a genuine
      // T3 that dips fast, holds the floor, then rises late and steeply read
      // as T2 or "none" under shape correlation alone. The fall is over in
      // the first tenth, so the drop is measured on the untrimmed contour —
      // the onset trim would cut it away.
      function holdThenRise(riseStartFrac: number): Contour {
        const n = 40;
        const durationMs = 900;
        const floorFrac = 0.15;
        const points: ContourPoint[] = Array.from({ length: n }, (_, k) => {
          const t = k / (n - 1);
          const chao =
            t < floorFrac
              ? 3 - 2 * Math.min(1, t / (floorFrac * 0.5))
              : t < riseStartFrac
                ? 1
                : 1 + 4 * ((t - riseStartFrac) / (1 - riseStartFrac));
          return { tMs: t * durationMs, chao };
        });
        return { points, startedAtMs: 0, endedAtMs: durationMs };
      }
      // Re-baselined 28 Sep 2026: the old test also required the 0.4/0.5
      // holds to read T2. A fall of 2 chao down to chao 1 is a T3 by every
      // measure on Jane's real clips — none of her 47 textbook T2s drops
      // below ~1.8 — so the T2 case below is a genuine T2 shape instead.
      for (const riseStart of [0.4, 0.5, 0.8, 0.85]) {
        expect(classifyTone(holdThenRise(riseStart))?.tone).toBe(3);
      }
    });

    it("keeps a real T2 — a shallow early dip — as T2", () => {
      const t2 = Array.from({ length: 30 }, (_, k) => {
        const t = k / 29;
        return t < 0.3 ? 2.9 - 0.6 * (t / 0.3) : 2.3 + 2.6 * ((t - 0.3) / 0.7);
      });
      const result = classifyTone(contourOf(t2));
      expect(result?.tone).toBe(2);
      expect(result?.decisive).toBe(true);
    });

    it("never reads the fallback T3 corridor (textbook 214, from jane_ma3) as T2", () => {
      // It starts near chao 2 and drops only ~1, right on the drop cue's
      // midpoint — the low-point vote is what keeps it T3.
      const shape = shapeForTone(3);
      const values = Array.from({ length: 50 }, (_, k) => corridorChaoAt(shape, k / 49));
      expect(classifyTone(contourOf(values, 1250))?.tone).toBe(3);
    });

    it("says none rather than guess inside the dead zone", () => {
      try {
        setTuning({ toneClassifierT23DeadZone: 1.6 });
        expect(classifyTone(contourOf(AVERAGED_TONE_SHAPE.textbook[3]))?.tone).toBe("none");
      } finally {
        resetTuning();
      }
    });

    it("never lets a close call or a lost dip decide a heart", () => {
      // Halfway between the two averages: may be named, never decisive.
      const midway = AVERAGED_TONE_SHAPE.textbook[2].map((v, i) => (v + AVERAGED_TONE_SHAPE.textbook[3][i]) / 2);
      expect(classifyTone(contourOf(midway))?.decisive).toBe(false);

      // The T2 average with 150ms of its dip unvoiced — what creak does.
      // Still named T2, but the gap takes away the right to cost a heart.
      const t2 = contourOf(AVERAGED_TONE_SHAPE.textbook[2]);
      const gapped = { ...t2, points: t2.points.filter((p) => p.tMs < 250 || p.tMs > 400) };
      const read = classifyTone(gapped);
      expect(read?.tone).toBe(2);
      expect(read?.decisive).toBe(false);
    });
  });
});
