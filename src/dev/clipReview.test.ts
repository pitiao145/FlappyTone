import { describe, expect, it } from "vitest";
import type { ContourPoint } from "./clipCut.ts";
import { median, reviewClip } from "./clipReview.ts";

/** Builds a contour of `n` points interpolating through the given chao values. */
function contour(...chao: number[]): ContourPoint[] {
  const n = 20;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const pos = t * (chao.length - 1);
    const a = Math.min(Math.floor(pos), chao.length - 2);
    const f = pos - a;
    return [t, chao[a] + (chao[a + 1] - chao[a]) * f] as ContourPoint;
  });
}

const base = {
  id: "x1",
  tone: 1,
  durationMs: 900,
  contour: contour(4.6, 4.6),
  pinnedFraction: 0.1,
  cohortMedianMs: 900,
};

const kinds = (input: Partial<typeof base>) =>
  reviewClip({ ...base, ...input }).map((f) => f.kind);

describe("reviewClip", () => {
  it("passes a clean flat Tone 1", () => {
    expect(reviewClip(base)).toEqual([]);
  });

  it("passes a real Tone 2 rise, 3 dip and 4 fall", () => {
    // Shapes taken from the measured contours in PRD §6, not from the marks.
    expect(kinds({ tone: 2, contour: contour(3.0, 2.1, 5.0) })).toEqual([]);
    expect(kinds({ tone: 3, contour: contour(2.2, 1.2, 1.2, 5.0) })).toEqual([]);
    expect(kinds({ tone: 4, contour: contour(5.0, 5.0, 1.3) })).toEqual([]);
  });

  it("passes Jane's shipped clips, releases and all", () => {
    // The exact decile contours `npm run make-ref-clips` prints for
    // public/ref/ma{1,2,3,4}.wav. These are the reference recordings the game
    // is built on: anything that flags them is measuring the wrong thing.
    // ma2 and ma4 both did, which is why the turn-point and squashed-span
    // rules exist.
    expect(
      kinds({ tone: 1, contour: contour(4.39, 3.57, 4.61, 4.66, 4.6, 4.61, 4.56, 4.51, 4.61, 4.62, 4.52) }),
    ).toEqual([]);
    // Rises 3.0 → 5.0, then *releases* back to 3.0 before the clip ends.
    expect(
      kinds({ tone: 2, contour: contour(2.99, 2.87, 2.11, 1.85, 2.13, 2.49, 3.23, 4.29, 5.0, 4.28, 2.97) }),
    ).toEqual([]);
    expect(
      kinds({ tone: 3, contour: contour(2.23, 2.89, 2.92, 1.91, 1.45, 1.24, 1.22, 2.06, 3.13, 4.99, 5.0) }),
    ).toEqual([]);
    // Sits at the chao-5 rail for 60% of the syllable: legitimately "pinned".
    expect(
      kinds({ tone: 4, pinnedFraction: 0.67, contour: contour(4.96, 5.0, 5.0, 5.0, 5.0, 5.0, 4.09, 1.75, 1.26) }),
    ).toEqual([]);
  });

  it("flags a Tone 1 that does not hold level", () => {
    expect(kinds({ tone: 1, contour: contour(5.0, 1.5) })).toContain("shape");
  });

  it("flags a Tone 2 that falls", () => {
    expect(kinds({ tone: 2, contour: contour(5.0, 2.0) })).toContain("shape");
  });

  it("flags a Tone 2 whose only high point is its very first frame", () => {
    // A peak at t=0 is where the speaker started, not a rise they performed.
    expect(kinds({ tone: 2, contour: contour(4.0, 2.0, 2.1) })).toContain("shape");
  });

  it("flags a natural half-third recorded for a citation Tone 3 gate", () => {
    // Falls 3.3 → 1.8 and never rises: real Mandarin, wrong for the ˇ corridor.
    expect(kinds({ tone: 3, contour: contour(3.3, 1.8) })).toContain("shape");
  });

  it("flags a Tone 4 that rises", () => {
    expect(kinds({ tone: 4, contour: contour(1.5, 5.0) })).toContain("shape");
  });

  it("flags a clip far off its tone's cohort", () => {
    expect(kinds({ durationMs: 200, cohortMedianMs: 900 })).toContain("duration");
    expect(kinds({ durationMs: 2500, cohortMedianMs: 900 })).toContain("duration");
  });

  it("accepts ordinary variation in length", () => {
    expect(kinds({ durationMs: 700, cohortMedianMs: 900 })).not.toContain("duration");
    expect(kinds({ durationMs: 1300, cohortMedianMs: 900 })).not.toContain("duration");
  });

  it("flags a contour pinned against an edge with nowhere to travel", () => {
    expect(kinds({ pinnedFraction: 0.8, contour: contour(5.0, 4.98, 5.0) })).toContain("pinned");
  });

  it("does not call a wide tone pinned just because it reaches both rails", () => {
    // A correct Tone 4 spends most of the syllable at chao 5 and ends at 1.
    // Pinned-ness alone would flag every one of them.
    expect(kinds({ tone: 4, pinnedFraction: 0.67, contour: contour(5.0, 5.0, 1.1) })).not.toContain(
      "pinned",
    );
  });

  it("does not also complain about the shape of a squashed contour", () => {
    // The shape is distorted by a wrong f0Center; judging it would report the
    // same problem twice and point at the wrong cause.
    const flags = kinds({ tone: 2, pinnedFraction: 0.9, contour: contour(5.0, 5.0) });
    expect(flags).toContain("pinned");
    expect(flags).not.toContain("shape");
  });

  it("reports a sparse clip once, not four times over", () => {
    const flags = reviewClip({
      ...base,
      tone: 2,
      durationMs: 100,
      contour: contour(5, 5).slice(0, 3),
    });
    expect(flags.map((f) => f.kind)).toEqual(["sparse"]);
  });

  it("skips the duration check when there is no cohort yet", () => {
    expect(kinds({ cohortMedianMs: 0 })).not.toContain("duration");
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("is 0 for nothing, so the duration check stands down", () => {
    expect(median([])).toBe(0);
  });
});
