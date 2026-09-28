import { describe, expect, it } from "vitest";
import sample from "../../fixtures/contours/jane-textbook-sample.json";
import fallback from "../data/wordsFallback.json";
import type { ContourPoint } from "./contours.ts";
import type { Tone } from "./gates.ts";
import { averagePolyline } from "./toneAverage.ts";
import { AVERAGED_TONE_SHAPE } from "./toneAverages.ts";
import {
  longestUtterance,
  referenceFor,
  toneAccuracy,
  toneAccuracyDetail,
} from "./toneAccuracy.ts";
import { multiWords, toneComboKey, wordsFromCatalog, wordsOfTone } from "./words.ts";

/**
 * Real measured contours: Jane's published textbook clips, sampled into
 * fixtures/contours (see its `source` field). Voiced frames on her calibrated
 * board — what the game sees of a native speaker, not a synthetic curve.
 */
interface Row {
  id: string;
  tones: number[];
  durationS: number;
  contour: [number, number][];
}
const rows = (sample as unknown as { rows: Row[] }).rows;
const pointsOf = (r: Row): ContourPoint[] =>
  r.contour.map(([t, chao]) => ({ tMs: t * r.durationS * 1000, chao }));

const words = wordsFromCatalog(
  (fallback as { rows: Record<string, unknown>[] }).rows.map((r) => ({ ...r, speaker_id: "jane" })),
);

/** The average the clip is judged against, rebuilt WITHOUT that clip. */
function leaveOneOut(r: Row): number[] {
  if (r.tones.length === 1) {
    return averagePolyline(wordsOfTone(words, r.tones[0] as Tone).filter((w) => w.id !== r.id));
  }
  const key = toneComboKey(r.tones as Tone[]);
  return averagePolyline(multiWords(words).filter((w) => toneComboKey(w.tones) === key && w.id !== r.id));
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)];
const singles = rows.filter((r) => r.tones.length === 1);
const pairs = rows.filter((r) => r.tones.length === 2);

describe("toneAccuracy — single syllables, Jane's real contours", () => {
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    it(`scores her own T${tone} clips high`, () => {
      const accs = singles
        .filter((r) => r.tones[0] === tone)
        .map((r) => toneAccuracyDetail(pointsOf(r), [tone], leaveOneOut(r))!.accuracy);
      expect(accs.length).toBeGreaterThan(5);
      expect(median(accs)).toBeGreaterThanOrEqual(0.85);
      // No clean native take of the right tone should look like a miss.
      expect(Math.min(...accs)).toBeGreaterThan(0.5);
    });
  }

  it("scores her clips low against a tone from another family", () => {
    // Level vs dip-rise vs fall: the wrong family keeps almost nothing.
    const family = (t: number) => (t === 1 ? "level" : t === 4 ? "fall" : "dipRise");
    for (const r of singles) {
      for (const target of [1, 2, 3, 4] as Tone[]) {
        if (family(target) === family(r.tones[0])) continue;
        expect(toneAccuracy(pointsOf(r), [target])!).toBeLessThan(0.3);
      }
    }
  });

  it("keeps a T2 said for a T3 (and the reverse) well below the right tone", () => {
    // Their averages correlate 0.73, so shape alone can't do this — the T2/T3
    // cue (drop, low point) is what separates them.
    for (const [said, target] of [[2, 3], [3, 2]] as [Tone, Tone][]) {
      const wrong = singles.filter((r) => r.tones[0] === said).map((r) => toneAccuracy(pointsOf(r), [target])!);
      const right = singles.filter((r) => r.tones[0] === target).map((r) => toneAccuracy(pointsOf(r), [target])!);
      expect(median(wrong)).toBeLessThan(0.6);
      expect(median(right) - median(wrong)).toBeGreaterThan(0.3);
    }
  });
});

describe("toneAccuracy — timing-free", () => {
  it("gives the same accuracy to the same take said early or late in the gate", () => {
    // The point of the metric: the gate's clock doesn't exist here. The same
    // utterance, with silence before it or after it inside a gate, is cut
    // out and time-zeroed to the identical attempt.
    const r = singles.find((x) => x.tones[0] === 3)!;
    const take = pointsOf(r);
    const at = (offsetMs: number) => longestUtterance(take.map((p) => ({ ...p, tMs: p.tMs + offsetMs })), 150);
    const onTime = toneAccuracy(at(0), [3]);
    expect(onTime).not.toBeNull();
    expect(toneAccuracy(at(-150), [3])).toBeCloseTo(onTime!, 10);
    expect(toneAccuracy(at(150), [3])).toBeCloseTo(onTime!, 10);
    expect(toneAccuracy(at(400), [3])).toBeCloseTo(onTime!, 10);
  });

  it("judges the utterance, not a cough before it", () => {
    const take = pointsOf(singles.find((x) => x.tones[0] === 2)!);
    const cough: ContourPoint[] = [0, 23, 46].map((tMs) => ({ tMs: tMs - 500, chao: 4.8 }));
    const withCough = longestUtterance([...cough, ...take], 150);
    expect(toneAccuracy(withCough, [2])).toBeCloseTo(toneAccuracy(longestUtterance(take, 150), [2])!, 10);
  });
});

describe("toneAccuracy — flat attempts and level targets", () => {
  const flat = (chao: number): ContourPoint[] =>
    Array.from({ length: 30 }, (_, k) => ({ tMs: k * 25, chao: chao + (k % 2 ? 0.05 : -0.05) }));

  it("scores a flat line on a moving tone near 0", () => {
    for (const tone of [2, 3, 4] as Tone[]) {
      const d = toneAccuracyDetail(flat(3), [tone])!;
      expect(d.mode).toBe("flatAttempt");
      expect(d.accuracy).toBeLessThanOrEqual(0.1);
    }
  });

  it("judges Tone 1 on flatness and height, not correlation", () => {
    const level = AVERAGED_TONE_SHAPE[1][0];
    const good = toneAccuracyDetail(flat(level), [1])!;
    expect(good.mode).toBe("level");
    expect(good.accuracy).toBeGreaterThan(0.9);
    // Flat, but a whole chao and a half too low: height costs it, flatness keeps some.
    const low = toneAccuracyDetail(flat(level - 1.5), [1])!;
    expect(low.accuracy).toBeLessThan(good.accuracy);
    expect(low.flatness).toBeGreaterThan(0.9);
  });
});

describe("toneAccuracy — pairs, Jane's real contours", () => {
  it("scores her two-syllable words high against their own combo's average", () => {
    const accs = pairs.map((r) => toneAccuracyDetail(pointsOf(r), r.tones as Tone[], leaveOneOut(r))!.accuracy);
    expect(accs.length).toBeGreaterThan(30);
    expect(median(accs)).toBeGreaterThanOrEqual(0.8);
  });

  it("scores them low against a combo that differs in both syllables", () => {
    const wrong: number[] = [];
    for (const r of pairs) {
      for (const [a, b] of [[1, 1], [2, 2], [3, 3], [4, 4], [1, 4], [4, 1], [2, 4], [4, 2]] as Tone[][]) {
        if (a === r.tones[0] || b === r.tones[1]) continue;
        const acc = toneAccuracy(pointsOf(r), [a, b]);
        if (acc !== null) wrong.push(acc);
      }
    }
    expect(median(wrong)).toBeLessThan(0.3);
  });
});

describe("toneAccuracy — when there is nothing honest to say", () => {
  const take = pointsOf(singles[0]);

  it("is null with fewer than 2 points", () => {
    expect(toneAccuracy([], [1])).toBeNull();
    expect(toneAccuracy([{ tMs: 0, chao: 3 }], [1])).toBeNull();
  });

  it("is null for a combo with a neutral syllable, or past two syllables", () => {
    expect(referenceFor([4, 0 as Tone])).toBeNull();
    expect(toneAccuracy(take, [4, 0 as Tone])).toBeNull();
    expect(toneAccuracy(take, [1, 2, 3])).toBeNull();
  });

  it("has a reference for every non-neutral combo", () => {
    for (const a of [1, 2, 3, 4] as Tone[]) {
      for (const b of [1, 2, 3, 4] as Tone[]) expect(referenceFor([a, b])).not.toBeNull();
    }
  });
});
