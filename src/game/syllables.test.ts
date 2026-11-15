import { afterEach, describe, expect, it } from "vitest";
import { findSyllables, realDipAt } from "./syllables.ts";
import { readContourSyllables } from "./freeAttempts.ts";
import { resetTuning, setTuning } from "./tuning.ts";

const STEP = 21.3;
/** Voiced frames at one tracker step, with a loudness per frame. */
function frames(rms: number[], t0 = 0) {
  return rms.map((r, i) => ({ tMs: t0 + i * STEP, rms: r }));
}
/** A loud syllable, a quiet dip, a loud syllable — no silence between. */
const DIPPED = [...Array(15).fill(0.1), 0.02, ...Array(15).fill(0.1)];
/** The same length, but the voice only fades: no real dip. */
const FADING = Array.from({ length: 31 }, (_, i) => 0.1 - i * 0.002);

afterEach(() => resetTuning());

describe("findSyllables", () => {
  it("count unknown: splits only at silences and drops short fragments", () => {
    const f = [...frames(Array(12).fill(0.1)), ...frames(Array(12).fill(0.1), 12 * STEP + 200), ...frames([0.1, 0.1], 24 * STEP + 600)];
    const out = findSyllables(f)!;
    expect(out).toHaveLength(2);
  });

  it("count known: a silence is enough", () => {
    const f = [...frames(Array(12).fill(0.1)), ...frames(Array(12).fill(0.1), 12 * STEP + 200)];
    expect(findSyllables(f, 2)?.map((p) => p.length)).toEqual([12, 12]);
  });

  it("count known: splits at a real loudness dip, dropping the dip frame", () => {
    const out = findSyllables(frames(DIPPED), 2)!;
    expect(out.map((p) => p.length)).toEqual([15, 15]);
  });

  it("count known: no real dip means not found (null), never a guessed cut", () => {
    expect(findSyllables(frames(FADING), 2)).toBeNull();
  });

  it("count known: too many pieces join across the shortest silence", () => {
    const a = frames(Array(10).fill(0.1));
    const b = frames(Array(10).fill(0.1), 10 * STEP + 160);
    const c = frames(Array(10).fill(0.1), 20 * STEP + 160 + 400);
    const out = findSyllables([...a, ...b, ...c], 2)!;
    expect(out.map((p) => p.length)).toEqual([20, 10]);
  });

  it("frames without loudness cannot split at a dip", () => {
    const f = DIPPED.map((_, i) => ({ tMs: i * STEP }));
    expect(findSyllables(f, 2)).toBeNull();
  });

  it("the dip ratio lives in tuning()", () => {
    // trough 0.065 vs peaks 0.1: real at 0.7, not at 0.6.
    const f = frames([...Array(15).fill(0.1), 0.065, ...Array(15).fill(0.1)]);
    expect(realDipAt(f, 0.7)).toBe(15);
    setTuning({ syllableDipRatio: 0.6 });
    expect(findSyllables(f, 2)).toBeNull();
  });
});

describe("readContourSyllables with a known count", () => {
  const contour = (rms: number[]) => {
    const points = rms.map((r, i) => ({ tMs: i * STEP, chao: 3, rms: r }));
    return { points, startedAtMs: 0, endedAtMs: points.at(-1)!.tMs };
  };

  it("not found → one '?' per syllable (hard rule 8)", () => {
    expect(readContourSyllables(contour(FADING), 2)).toEqual([null, null]);
  });

  it("found → one read per syllable", () => {
    const out = readContourSyllables(contour(DIPPED), 2);
    expect(out).toHaveLength(2);
    expect(out!.every((r) => r !== null)).toBe(true);
  });

  it("without a count it behaves as before: a voice that never stops is one syllable", () => {
    expect(readContourSyllables(contour(DIPPED))).toHaveLength(1);
  });
});
