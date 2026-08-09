import { describe, expect, it } from "vitest";
import { availableTones, loadWords, pickWord, wordsOfTone, type Word } from "./words.ts";
import { corridorChaoAt, makeGate, newDifficulty, shapeForTone, shapeForWord } from "./gates.ts";
import { DEFAULT_TUNING } from "./tuning.ts";

function clip(over: Partial<Word> = {}): Record<string, unknown> {
  return {
    id: "ba1",
    hanzi: "八",
    pinyin: "bā",
    english: "eight",
    tone: 1,
    file: "ba1.wav",
    durationS: 1.178,
    polyline: [
      [0, 4.5],
      [1, 4.5],
    ],
    ...over,
  };
}

function word(over: Partial<Word> = {}): Word {
  return loadWords({ clips: [clip(over)] })[0];
}

describe("loadWords", () => {
  it("reads a well-formed manifest", () => {
    const words = loadWords({ clips: [clip(), clip({ id: "ma2", tone: 2 })] });
    expect(words.map((w) => w.id)).toEqual(["ba1", "ma2"]);
    expect(words[0].durationS).toBeCloseTo(1.178);
  });

  // Every one of these is a corridor the player would collide with invisibly,
  // or a crash on a fetch that returned something unexpected. A bad entry is
  // one missing word; a throw is a blank screen.
  it.each([
    ["no clips array", { clips: "nope" }],
    ["not an object", 42],
    ["null", null],
  ])("returns nothing for %s rather than throwing", (_name, manifest) => {
    expect(loadWords(manifest)).toEqual([]);
  });

  it.each([
    ["a missing polyline", clip({ polyline: undefined as never })],
    ["a one-point polyline", { ...clip(), polyline: [[0, 3]] }],
    ["a polyline holding a non-number", { ...clip(), polyline: [[0, 3], [1, "high"]] }],
    ["a NaN vertex", { ...clip(), polyline: [[0, 3], [Number.NaN, 5]] }],
    ["tone 5", clip({ tone: 5 as never })],
    ["a zero duration", clip({ durationS: 0 })],
    ["an absurd duration", clip({ durationS: 30 })],
    ["a missing file", clip({ file: undefined as never })],
  ])("drops an entry with %s", (_name, bad) => {
    expect(loadWords({ clips: [bad] })).toEqual([]);
    // The good entry beside it still loads.
    expect(loadWords({ clips: [bad, clip({ id: "ok" })] }).map((w) => w.id)).toEqual(["ok"]);
  });

  it("keeps a word whose gloss is missing rather than dropping it", () => {
    // A missing translation costs one line of HUD; a dropped word costs the
    // gate. Anything non-string reads as "no gloss yet".
    const noGloss = { ...clip(), english: undefined };
    expect(loadWords({ clips: [noGloss] })[0].english).toBe("");
    const wrongType = { ...clip(), english: 42 };
    expect(loadWords({ clips: [wrongType] })[0].english).toBe("");
  });

  it("keeps the first of a duplicated id", () => {
    // Ids are filenames; two entries claiming one would disagree about which
    // audio a corridor belongs to.
    const words = loadWords({ clips: [clip({ durationS: 1 }), clip({ durationS: 2 })] });
    expect(words).toHaveLength(1);
    expect(words[0].durationS).toBe(1);
  });
});

describe("pickWord", () => {
  const inventory = [1, 2, 3, 4].flatMap((tone) =>
    Array.from({ length: 4 }, (_, i) =>
      word({ id: `w${tone}${i}`, tone: tone as Word["tone"] }),
    ),
  );

  it("only ever returns a word of the tone asked for", () => {
    for (const tone of [1, 2, 3, 4] as const) {
      const w = pickWord(inventory, tone, [], () => 0.7);
      expect(w?.tone).toBe(tone);
    }
  });

  it("avoids the words most recently played", () => {
    const recent = wordsOfTone(inventory, 1).slice(0, 3);
    // rand 0 would pick the first of the pool; the first three are excluded.
    expect(pickWord(inventory, 1, recent, () => 0)?.id).toBe("w13");
  });

  it("falls back to the whole pool once the window has eaten it", () => {
    const recent = wordsOfTone(inventory, 1);
    expect(pickWord(inventory, 1, recent, () => 0)?.id).toBe("w10");
  });

  it("returns null when the inventory has nothing for that tone", () => {
    expect(pickWord(wordsOfTone(inventory, 1), 2, [], () => 0)).toBeNull();
  });

  it("stays in range at rand() = 0.999…", () => {
    expect(pickWord(inventory, 1, [], () => 0.9999999)).not.toBeUndefined();
  });
});

describe("onsetS", () => {
  const base = {
    id: "chang2", hanzi: "長", pinyin: "cháng", english: "long",
    tone: 2, file: "chang2.wav", durationS: 1.007,
    polyline: [[0, 3], [1, 5]],
  };

  it("reads the onset when present", () => {
    const [w] = loadWords({ clips: [{ ...base, onsetS: 0.19 }] });
    expect(w.onsetS).toBe(0.19);
  });

  // An older manifest predates the field. Defaulting keeps those clips
  // playable at the old behaviour; treating the field as required would drop
  // all 120 and degrade to the tuning defaults, which looks like a working game.
  it("defaults to 0 when the manifest predates the field", () => {
    const [w] = loadWords({ clips: [base] });
    expect(w.onsetS).toBe(0);
  });

  it("defaults to 0 rather than dropping the clip when the value is nonsense", () => {
    for (const bad of ["0.19", NaN, Infinity, -0.5, null]) {
      const words = loadWords({ clips: [{ ...base, onsetS: bad }] });
      expect(words.length, String(bad)).toBe(1);
      expect(words[0].onsetS, String(bad)).toBe(0);
    }
  });

  // The onset sits in front of the tone, inside the same file. One that runs
  // past the end of the file is a measurement error, not a syllable.
  it("rejects an onset longer than the clip", () => {
    const [w] = loadWords({ clips: [{ ...base, clipS: 1.4, onsetS: 2 }] });
    expect(w.onsetS).toBe(0);
  });

  // The clip is the whole take now, so lead-in plus consonant can easily run
  // longer than a short tone — seven of the shipped T3 words do. Bounding the
  // onset by the tone window instead of the file zeroed exactly those, which
  // starts the demo dot at the top of the consonant.
  it("keeps an onset longer than the tone but shorter than the clip", () => {
    const [w] = loadWords({ clips: [{ ...base, durationS: 0.35, clipS: 1.4, onsetS: 0.6 }] });
    expect(w.onsetS).toBe(0.6);
  });
});

describe("clipS", () => {
  const base = {
    id: "ba3", hanzi: "把", pinyin: "bǎ", english: "hold",
    tone: 3, file: "ba3.wav", durationS: 0.346, onsetS: 0.851,
    polyline: [[0, 3], [1, 1.5]],
  };

  it("reads the clip length when present", () => {
    const [w] = loadWords({ clips: [{ ...base, clipS: 1.325 }] });
    expect(w.clipS).toBe(1.325);
  });

  // Before the clips became the raw takes, the file *was* the onset plus the
  // tone window. So that sum is not a guess for an older manifest — it is what
  // those clips measured.
  it("falls back to onset + tone window when the manifest predates the field", () => {
    const [w] = loadWords({ clips: [{ ...base, onsetS: 0.19, durationS: 1.007 }] });
    expect(w.clipS).toBeCloseTo(1.197, 5);
  });

  it("falls back rather than dropping the clip when the value is nonsense", () => {
    // Same shape as an older manifest: an onset that fits inside its own tone
    // window, which is what the pre-take clips always had.
    const legacy = { ...base, onsetS: 0.19, durationS: 1.007 };
    for (const bad of ["1.3", NaN, Infinity, -1, 0, 30, null]) {
      const words = loadWords({ clips: [{ ...legacy, clipS: bad }] });
      expect(words.length, String(bad)).toBe(1);
      expect(words[0].clipS, String(bad)).toBeCloseTo(1.197, 5);
    }
  });

  // A file cannot be shorter than the tone inside it. Trusting a bad value
  // would cut the world freeze short and re-open the mic mid-cue.
  it("never reports a clip shorter than its own tone window", () => {
    const [w] = loadWords({ clips: [{ ...base, durationS: 1.0, clipS: 0.4 }] });
    expect(w.clipS).toBe(1.0);
  });
});

describe("availableTones", () => {
  it("reports only the tones the inventory can build a gate for", () => {
    expect(availableTones([word({ tone: 1 }), word({ id: "b", tone: 4 })])).toEqual([1, 4]);
  });
});

describe("a word's corridor", () => {
  it("is the word's own measured shape and length", () => {
    const w = word({ tone: 4, durationS: 0.7, polyline: [[0, 5], [0.6, 5], [1, 1.2]] });
    const shape = shapeForWord(w);
    expect(shape.durationS).toBe(0.7);
    expect(corridorChaoAt(shape, 0.3)).toBeCloseTo(5);
    expect(corridorChaoAt(shape, 1)).toBeCloseTo(1.2);
  });

  /**
   * 22 of Jane's 30 T3 takes are her natural T3 — a dip that stays down. A
   * corridor built from those would stop teaching the ˇ contour, so T3 flies
   * the citation polyline until they are re-recorded. See `shapeForWord`.
   */
  it("is the citation polyline for tone 3, whatever the clip did", () => {
    const falling = word({ tone: 3, durationS: 0.4, polyline: [[0, 3], [1, 1.5]] });
    expect(shapeForWord(falling)).toEqual(shapeForTone(3));
    expect(shapeForWord(falling).durationS).toBe(DEFAULT_TUNING.gateDurationS[3]);
  });

  it("sets the gate's width from the clip, so demo and corridor share a clock", () => {
    const d = { ...newDifficulty(), scrollSpeed: 200 };
    const gate = makeGate(word({ tone: 2, durationS: 0.9 }), 0, d);
    expect(gate.widthPx).toBeCloseTo(200 * 0.9);
    expect(gate.word?.id).toBe("ba1");
  });

  it("falls back to the tone's own shape when there is no word", () => {
    const d = newDifficulty();
    const gate = makeGate(1, 0, d);
    expect(gate.word).toBeNull();
    expect(gate.shape).toEqual(shapeForTone(1));
  });
});
