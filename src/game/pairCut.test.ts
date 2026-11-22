import { afterEach, describe, expect, it } from "vitest";
import { dropEdgeJunk, findPairCut, trimQuietEdges, type PairCutSpot } from "./syllables.ts";
import { readContourSyllables } from "./freeAttempts.ts";
import { setPairCutSpots } from "./pairCutSpots.ts";
import { classifyToneV2 } from "./toneClassifierV2.ts";
import { resetTuning, setTuning } from "./tuning.ts";

const STEP = 21.3;
interface F { tMs: number; rms: number; chao: number }
/** n voiced frames from t0, flat loudness and pitch unless given per frame. */
function run(n: number, t0 = 0, rms: number | ((i: number) => number) = 0.1, chao: number | ((i: number) => number) = 3): F[] {
  return Array.from({ length: n }, (_, i) => ({
    tMs: t0 + i * STEP,
    rms: typeof rms === "number" ? rms : rms(i),
    chao: typeof chao === "number" ? chao : chao(i),
  }));
}
const end = (f: F[]) => f[f.length - 1].tMs;
const SPOT: PairCutSpot = { share: 0.5, halfWidth: 0.15, event: null, offsetMs: 0 };

afterEach(() => {
  resetTuning();
  setPairCutSpots(null);
});

describe("findPairCut (brief 49)", () => {
  it("takes the long silence nearest the expected spot, not the shortest one", () => {
    const a = run(20), b = run(20, end(a) + 200), c = run(4, end(b) + 160);
    const out = findPairCut([...a, ...b, ...c], { ...SPOT, share: 0.45 })!;
    expect(out.map((p) => p.length)).toEqual([20, 24]);
  });

  it("a long silence far from the spot is not trusted: null, never a guessed cut", () => {
    const a = run(40), b = run(4, end(a) + 200);
    expect(findPairCut([...a, ...b], { ...SPOT, halfWidth: 0.08 })).toBeNull();
  });

  it("inside the window: a short hole in the voice is the join", () => {
    const a = run(15), b = run(15, end(a) + 70);
    expect(findPairCut([...a, ...b], SPOT)!.map((p) => p.length)).toEqual([15, 15]);
  });

  it("inside the window: a real loudness dip, its frame going to neither side", () => {
    const f = run(31, 0, (i) => (i === 15 ? 0.02 : 0.1));
    expect(findPairCut(f, SPOT)!.map((p) => p.length)).toEqual([15, 15]);
  });

  it("a dip outside the window is not used", () => {
    const f = run(31, 0, (i) => (i === 4 ? 0.02 : 0.1));
    expect(findPairCut(f, SPOT)).toBeNull();
  });

  it("no silence, no dip: the pair's pitch event (here the low point, 3+2)", () => {
    const f = run(31, 0, 0.1, (i) => 3 - Math.min(i, 30 - i) * 0.1);
    const out = findPairCut(f, { ...SPOT, event: "max" });
    expect(out).not.toBeNull();
    const low = run(31, 0, 0.1, (i) => 1 + Math.abs(i - 14) * 0.1);
    // the 3-frame median ties at the vertex: the first of the tie (frame 13) starts syllable 2
    expect(findPairCut(low, { ...SPOT, event: "min" })!.map((p) => p.length)).toEqual([13, 18]);
  });

  it("nothing found: null (both syllables '?')", () => {
    expect(findPairCut(run(31), SPOT)).toBeNull();
  });
});

describe("dropEdgeJunk / trimQuietEdges", () => {
  it("drops a quiet bit after the word", () => {
    const word = run(30), tail = run(5, end(word) + 300, 0.01);
    expect(dropEdgeJunk([...word, ...tail])).toHaveLength(30);
  });

  it("keeps a short but loud first syllable (natural speech)", () => {
    const first = run(4, 0, 0.2), rest = run(30, 4 * STEP + 170);
    expect(dropEdgeJunk([...first, ...rest])).toHaveLength(34);
  });

  it("drops a short, not loud bit far from the word", () => {
    const blip = run(3, 0, 0.03), rest = run(30, 3 * STEP + 400);
    expect(dropEdgeJunk([...blip, ...rest])).toHaveLength(30);
  });

  it("trims near-silent frames at both ends of a syllable", () => {
    const s = run(10, 0, (i) => (i === 0 || i === 9 ? 0.003 : 0.1));
    expect(trimQuietEdges(s, 0.06)).toHaveLength(8);
  });
});

describe("pair read with a target (brief 49)", () => {
  const contour = (f: F[]) => ({ points: f.map((x) => ({ tMs: x.tMs, chao: x.chao, rms: x.rms })), startedAtMs: 0, endedAtMs: end(f) });
  // first tone, short hole, fourth tone
  const word = [...run(15, 0, 0.1, 4.6), ...run(15, 15 * STEP + 60, 0.1, (i) => 4.8 - i * 0.25)];

  it("the tones only place the cut: the halves are read without them", () => {
    setPairCutSpots({ textbook: { "14": SPOT, "42": SPOT }, natural: {} });
    const as14 = readContourSyllables(contour(word), 2, { tones: [1, 4], style: "textbook" })!.map((r) => r?.tone ?? null);
    const as42 = readContourSyllables(contour(word), 2, { tones: [4, 2], style: "textbook" })!.map((r) => r?.tone ?? null);
    expect(as14).toEqual(as42);
  });

  it("off in the Lab: the brief 46 finder", () => {
    setPairCutSpots({ textbook: { "14": { ...SPOT, halfWidth: 0.01, share: 0.1 } }, natural: {} });
    setTuning({ pairCutOn: false });
    expect(readContourSyllables(contour(word), 2, { tones: [1, 4], style: "textbook" })).toHaveLength(2);
  });
});

describe("natural low-only third tone (brief 49 part 2)", () => {
  // From near line 2 down to the bottom line, no rise back.
  const lowOnly = { points: Array.from({ length: 10 }, (_, i) => ({ tMs: i * STEP, chao: Math.max(1, 2 - i * 0.12) })), startedAtMs: 0, endedAtMs: 9 * STEP };

  it("reads as a third tone in natural style on the one ruler, never decisive", () => {
    setTuning({ playerRulerV2: true });
    const r = classifyToneV2(lowOnly, "natural")!;
    expect(r.tone).toBe(3);
    expect(r.decisive).toBe(false);
  });

  it("textbook style is unchanged", () => {
    setTuning({ playerRulerV2: true });
    expect(classifyToneV2(lowOnly, "textbook")!.tone).toBe("none");
  });
});
