import { describe, expect, it } from "vitest";
import {
  availableTones,
  pickWord,
  wordsForTier,
  wordsFromCatalog,
  wordsOfTone,
  type Word,
} from "./words.ts";
import fallback from "../data/wordsFallback.json";
import { corridorChaoAt, makeGate, newDifficulty, shapeForTone, shapeForWord } from "./gates.ts";

/** A well-formed `words` table row, as `wordsFromCatalog` sees it. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ba1",
    hanzi: "八",
    pinyin: "bā",
    english: "eight",
    tone: 1,
    tones: [1],
    syllables: 1,
    position: 0,
    status: "published",
    min_tier: "free",
    clip_key: "ba1.wav",
    duration_s: 1.178,
    onset_s: null,
    clip_s: null,
    polyline: [
      [0, 4.5],
      [1, 4.5],
    ],
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function word(over: Record<string, unknown> = {}): Word {
  return wordsFromCatalog([row(over)])[0];
}

describe("wordsFromCatalog", () => {
  it("parses a valid row array into Word[], sorted by position", () => {
    const words = wordsFromCatalog([
      row({ id: "ma2", tone: 2, tones: [2], clip_key: "ma2.wav", position: 1 }),
      row({ id: "ba1", position: 0 }),
    ]);
    expect(words.map((w) => w.id)).toEqual(["ba1", "ma2"]);
    expect(words[0].durationS).toBeCloseTo(1.178);
    expect(words[0].clipKey).toBe("ba1.wav");
    expect(words[0].minTier).toBe("free");
    expect(words[0].updatedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("returns [] rather than throwing for garbage input", () => {
    expect(wordsFromCatalog("garbage")).toEqual([]);
    expect(wordsFromCatalog(42)).toEqual([]);
    expect(wordsFromCatalog(null)).toEqual([]);
  });

  it("drops a row whose status is not published", () => {
    const words = wordsFromCatalog([row({ status: "draft" }), row({ id: "ok", position: 1 })]);
    expect(words.map((w) => w.id)).toEqual(["ok"]);
  });

  it("drops a row with a null clip_key", () => {
    const words = wordsFromCatalog([row({ clip_key: null }), row({ id: "ok", position: 1 })]);
    expect(words.map((w) => w.id)).toEqual(["ok"]);
  });

  it("drops a row with an unrecognised min_tier rather than defaulting it to free", () => {
    // Gate 2 (free->pro) reads minTier to withhold paid content — a typo'd or
    // unknown value (e.g. a future "plus" tier) must not silently fail open
    // into "free" and leak a pro word.
    const words = wordsFromCatalog([row({ min_tier: "plus" }), row({ id: "ok", position: 1 })]);
    expect(words.map((w) => w.id)).toEqual(["ok"]);
  });

  // Every one of these is a corridor the player would collide with invisibly,
  // or a crash on a fetch that returned something unexpected. A bad row is one
  // missing word; a throw is a blank screen.
  it.each([
    ["a missing polyline", row({ polyline: undefined })],
    ["a one-point polyline", row({ polyline: [[0, 3]] })],
    ["a polyline holding a non-number", row({ polyline: [[0, 3], [1, "high"]] })],
    ["a NaN vertex", row({ polyline: [[0, 3], [Number.NaN, 5]] })],
    ["tone 5", row({ tone: 5 })],
    ["a zero duration", row({ duration_s: 0 })],
    ["an absurd duration", row({ duration_s: 30 })],
  ])("drops a row with %s", (_name, bad) => {
    expect(wordsFromCatalog([bad])).toEqual([]);
    // The good row beside it still loads.
    expect(wordsFromCatalog([bad, row({ id: "ok", position: 1 })]).map((w) => w.id)).toEqual(["ok"]);
  });

  it("keeps a word whose gloss is missing rather than dropping it", () => {
    // A missing translation costs one line of HUD; a dropped word costs the
    // gate. Anything non-string reads as "no gloss yet".
    expect(word({ english: undefined }).english).toBe("");
    expect(word({ english: 42 }).english).toBe("");
  });

  it("keeps the first of a duplicated id", () => {
    // Ids are the catalog's primary key; two rows claiming one would disagree
    // about which audio a corridor belongs to.
    const words = wordsFromCatalog([
      row({ duration_s: 1, position: 0 }),
      row({ duration_s: 2, position: 1 }),
    ]);
    expect(words).toHaveLength(1);
    expect(words[0].durationS).toBe(1);
  });

  describe("onsetS", () => {
    const base = row({
      id: "chang2", hanzi: "長", pinyin: "cháng", english: "long",
      tone: 2, tones: [2], clip_key: "chang2.wav", duration_s: 1.007,
      polyline: [[0, 3], [1, 5]],
    });

    it("reads the onset when present", () => {
      const [w] = wordsFromCatalog([{ ...base, onset_s: 0.19 }]);
      expect(w.onsetS).toBe(0.19);
    });

    // A row can predate the field. Defaulting keeps those clips playable at
    // the old behaviour; treating the field as required would drop them and
    // degrade to the tuning defaults, which looks like a working game.
    it("defaults to 0 when the row predates the field", () => {
      const [w] = wordsFromCatalog([{ ...base, onset_s: null }]);
      expect(w.onsetS).toBe(0);
    });

    it("defaults to 0 rather than dropping the word when the value is nonsense", () => {
      for (const bad of ["0.19", NaN, Infinity, -0.5, null]) {
        const words = wordsFromCatalog([{ ...base, onset_s: bad }]);
        expect(words.length, String(bad)).toBe(1);
        expect(words[0].onsetS, String(bad)).toBe(0);
      }
    });

    // The onset sits in front of the tone, inside the same file. One that runs
    // past the end of the file is a measurement error, not a syllable.
    it("rejects an onset longer than the clip", () => {
      const [w] = wordsFromCatalog([{ ...base, clip_s: 1.4, onset_s: 2 }]);
      expect(w.onsetS).toBe(0);
    });

    it("keeps an onset longer than the tone but shorter than the clip", () => {
      const [w] = wordsFromCatalog([{ ...base, duration_s: 0.35, clip_s: 1.4, onset_s: 0.6 }]);
      expect(w.onsetS).toBe(0.6);
    });
  });

  describe("clipS", () => {
    const base = row({
      id: "ba3", hanzi: "把", pinyin: "bǎ", english: "hold",
      tone: 3, tones: [3], clip_key: "ba3.wav", duration_s: 0.346, onset_s: 0.851,
      polyline: [[0, 3], [1, 1.5]],
    });

    it("reads the clip length when present, null → onset + tone window", () => {
      const [w1] = wordsFromCatalog([{ ...base, clip_s: 1.325 }]);
      expect(w1.clipS).toBe(1.325);

      // Before the clips became the raw takes, the file *was* the onset plus
      // the tone window. So that sum is not a guess for a legacy row — it is
      // what those clips measured.
      const [w2] = wordsFromCatalog([{ ...base, onset_s: 0.19, duration_s: 1.007, clip_s: null }]);
      expect(w2.clipS).toBeCloseTo(1.197, 5);
    });

    it("falls back rather than dropping the word when the value is nonsense", () => {
      const legacy = { ...base, onset_s: 0.19, duration_s: 1.007 };
      for (const bad of ["1.3", NaN, Infinity, -1, 0, 30, null]) {
        const words = wordsFromCatalog([{ ...legacy, clip_s: bad }]);
        expect(words.length, String(bad)).toBe(1);
        expect(words[0].clipS, String(bad)).toBeCloseTo(1.197, 5);
      }
    });

    // A file cannot be shorter than the tone inside it. Trusting a bad value
    // would cut the world freeze short and re-open the mic mid-cue.
    it("never reports a clip shorter than its own tone window", () => {
      const [w] = wordsFromCatalog([{ ...base, duration_s: 1.0, clip_s: 0.4 }]);
      expect(w.clipS).toBe(1.0);
    });
  });
});

describe("wordsForTier", () => {
  const free = word({ id: "free1", min_tier: "free" });
  const pro = word({ id: "pro1", min_tier: "pro", position: 1 });
  const words = [free, pro];

  it("free excludes pro-only words", () => {
    expect(wordsForTier(words, "free").map((w) => w.id)).toEqual(["free1"]);
  });

  it("pro includes all words", () => {
    expect(wordsForTier(words, "pro").map((w) => w.id)).toEqual(["free1", "pro1"]);
  });

  it("guest behaves like free", () => {
    expect(wordsForTier(words, "guest").map((w) => w.id)).toEqual(["free1"]);
  });
});

/**
 * `min_tier` is the GAME gate, and it is what the clips Worker enforces at
 * `/clip/:id`. The run's pool is filtered by it (Game.tsx), so the two must
 * agree: a word a tier's run can fly is a word whose clip that tier can fetch.
 *
 * The shipped catalog marks everything `free` today, so every tier flies all
 * 120 words — exactly what production always did. A run pool of 20 for a guest
 * is the regression this guards (the visualiser's 5-per-tone practice depth is
 * a COUNT, `TIER_LIMITS.wordsPerTone`, and must never reach this pool).
 */
describe("the shipped catalog is open to every tier's game", () => {
  const catalog = wordsFromCatalog(fallback.rows);

  it("ships 120 published words", () => {
    expect(catalog).toHaveLength(120);
  });

  it("gives a guest's run pool every word, not a per-tone slice", () => {
    expect(wordsForTier(catalog, "guest")).toHaveLength(120);
    expect(wordsForTier(catalog, "free")).toHaveLength(120);
    expect(wordsForTier(catalog, "pro")).toHaveLength(120);
  });

  it("has no pro-gated word left in the catalog", () => {
    expect(catalog.filter((w) => w.minTier === "pro")).toEqual([]);
  });

  it("can still pick a word of every tone for a guest", () => {
    const pool = wordsForTier(catalog, "guest");
    for (const tone of [1, 2, 3, 4] as const) {
      expect(wordsOfTone(pool, tone).length).toBeGreaterThan(5);
      expect(pickWord(pool, tone, [], () => 0)).not.toBeNull();
    }
  });
});

/**
 * The lever Pierre wants kept: marking one future word `pro` must remove it
 * from a non-Pro run's pool, with no code change — and the Worker's 403 on the
 * same column keeps the clip route consistent with it.
 */
describe("marking a word pro still gates it (the lever)", () => {
  const open = word({ id: "open1", min_tier: "free" });
  const gated = word({ id: "gated1", min_tier: "pro", position: 1 });
  const catalog = [open, gated];

  it("is absent from a guest's and a free account's pool", () => {
    expect(wordsForTier(catalog, "guest").map((w) => w.id)).toEqual(["open1"]);
    expect(wordsForTier(catalog, "free").map((w) => w.id)).toEqual(["open1"]);
  });

  it("is present in a Pro pool", () => {
    expect(wordsForTier(catalog, "pro").map((w) => w.id)).toEqual(["open1", "gated1"]);
  });

  it("is never picked for a guest's gate", () => {
    const pool = wordsForTier(catalog, "guest");
    for (let i = 0; i < 10; i += 1) {
      expect(pickWord(pool, 1, [], () => i / 10)?.id).toBe("open1");
    }
  });
});

describe("pickWord", () => {
  const inventory = [1, 2, 3, 4].flatMap((tone) =>
    Array.from({ length: 4 }, (_, i) =>
      word({ id: `w${tone}${i}`, tone, tones: [tone], position: tone * 10 + i }),
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

describe("wordsOfTone tier limit", () => {
  const inventory = Array.from({ length: 30 }, (_, i) => word({ id: `t1_${i}`, tone: 1, position: i }));

  it("defaults to the whole pool, in inventory order", () => {
    expect(wordsOfTone(inventory, 1).map((w) => w.id)).toEqual(inventory.map((w) => w.id));
  });

  it("slices to the first N words, deterministically", () => {
    const sliced = wordsOfTone(inventory, 1, 5);
    expect(sliced.map((w) => w.id)).toEqual(["t1_0", "t1_1", "t1_2", "t1_3", "t1_4"]);
  });

  it("returns nothing for a guest's 0-word limit", () => {
    expect(wordsOfTone(inventory, 1, 0)).toEqual([]);
  });

  it("does not slice when the limit is Infinity (pro, and the gameplay default)", () => {
    expect(wordsOfTone(inventory, 1, Infinity)).toHaveLength(30);
  });

  it("pickWord (the scored game/drill/learn path) is unaffected by a guest's 0-word limit", () => {
    // pickWord calls wordsOfTone with no limit — a guest must still get gates.
    expect(pickWord(inventory, 1, [], () => 0)).not.toBeNull();
  });
});

describe("availableTones", () => {
  it("reports only the tones the inventory can build a gate for", () => {
    expect(availableTones([word({ tone: 1 }), word({ id: "b", tone: 4, tones: [4], position: 1 })])).toEqual([
      1, 4,
    ]);
  });
});

describe("a word's corridor", () => {
  it("is the word's own measured shape and length", () => {
    const w = word({ tone: 4, tones: [4], duration_s: 0.7, polyline: [[0, 5], [0.6, 5], [1, 1.2]] });
    const shape = shapeForWord(w);
    expect(shape.durationS).toBe(0.7);
    expect(corridorChaoAt(shape, 0.3)).toBeCloseTo(5);
    expect(corridorChaoAt(shape, 1)).toBeCloseTo(1.2);
  });

  /**
   * `clipCut.ts`'s voicing rescue and run-merge gap now measure all 30 T3
   * words' real dip-and-rise, so tone 3 flies its own word's shape like every
   * other tone — see `shapeForWord`. It used to fall back to one synthetic
   * citation polyline; that branch is gone.
   */
  it("is the word's own shape for tone 3 too, not the citation fallback", () => {
    const w = word({ tone: 3, tones: [3], duration_s: 0.4, polyline: [[0, 3], [1, 1.5]] });
    const shape = shapeForWord(w);
    expect(shape.durationS).toBe(0.4);
    expect(corridorChaoAt(shape, 1)).toBeCloseTo(1.5, 1);
  });

  it("sets the gate's width from the clip, so demo and corridor share a clock", () => {
    const d = { ...newDifficulty(), scrollSpeed: 200 };
    const gate = makeGate(word({ tone: 2, tones: [2], duration_s: 0.9 }), 0, d);
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
