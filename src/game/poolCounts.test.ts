import { afterEach, describe, expect, it } from "vitest";
import fallback from "../data/wordsFallback.json";
import {
  classicCount,
  drillCount,
  drillToneCount,
  pairsComboCount,
  pairsCount,
  visualiserComboCount,
  visualiserListWords,
  visualiserPairWords,
  visualiserToneCount,
  wordCountLabel,
} from "./poolCounts.ts";
import { resetTierLimits } from "./tiers.ts";
import {
  availableToneCombos,
  multiWords,
  resolvedPool,
  wordsFromCatalog,
  wordsOfCombo,
  wordsOfTone,
  type Word,
} from "./words.ts";

const catalog = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: "jane" })));

/** A word whose natural take exists / does not, on top of the bundled catalog. */
const naturalClip = {
  clipKey: "n.wav",
  durationS: 0.5,
  onsetS: 0.1,
  clipS: 0.8,
  polyline: [
    [0, 3],
    [1, 3],
  ] as [number, number][],
  updatedAt: "2026-10-01T00:00:00Z",
};
function withNatural(words: Word[], keep: (w: Word, i: number) => boolean): Word[] {
  return words.map((w, i) => (keep(w, i) ? { ...w, natural: naturalClip } : w));
}

afterEach(() => resetTierLimits());

describe("poolCounts equals the pool a Run receives", () => {
  it("guest sampler (beginner and intermediate)", () => {
    for (const p of ["beginner", "intermediate"] as const) {
      const n = classicCount(catalog, "guest", p, null, "textbook");
      expect(n).toBe(resolvedPool(catalog, "guest", "game", p, null).length);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("free beginner TOCFL1 and Mix", () => {
    expect(classicCount(catalog, "free", "beginner", 1, "textbook")).toBe(
      resolvedPool(catalog, "free", "game", "beginner", 1).length,
    );
    const mix = classicCount(catalog, "free", "beginner", "mix", "textbook");
    expect(mix).toBe(resolvedPool(catalog, "free", "game", "beginner", "mix").length);
    expect(mix).toBeGreaterThanOrEqual(classicCount(catalog, "free", "beginner", 1, "textbook")!);
  });

  it("pro intermediate Mix", () => {
    expect(classicCount(catalog, "pro", "intermediate", "mix", "textbook")).toBe(
      resolvedPool(catalog, "pro", "game", "intermediate", "mix").length,
    );
  });

  it("a locked level (free TOCFL3) falls back to the allowed set, like the run", () => {
    expect(classicCount(catalog, "free", "beginner", 3, "textbook")).toBe(
      resolvedPool(catalog, "free", "game", "beginner", 3).length,
    );
  });

  it("natural style drops words with no natural take", () => {
    const some = withNatural(catalog, (_, i) => i % 2 === 0);
    const textbook = classicCount(some, "pro", "beginner", "mix", "textbook")!;
    const natural = classicCount(some, "pro", "beginner", "mix", "natural")!;
    expect(natural).toBeLessThan(textbook);
    expect(natural).toBe(resolvedPool(some, "pro", "game", "beginner", "mix", "natural").length);
    expect(drillCount(some, "pro", "natural")).toBe(
      resolvedPool(some, "pro", "drill", "beginner", null, "natural").length,
    );
  });

  it("drill total and per tone", () => {
    for (const tier of ["guest", "free", "pro"] as const) {
      const pool = resolvedPool(catalog, tier, "drill", "beginner", null);
      expect(drillCount(catalog, tier, "textbook")).toBe(pool.length);
      for (const t of [1, 2, 3, 4] as const) {
        expect(drillToneCount(catalog, tier, t, "textbook")).toBe(wordsOfTone(pool, t).length || null);
      }
    }
  });

  it("pairs total and per combo count only the two-syllable words a run draws", () => {
    for (const tier of ["free", "pro"] as const) {
      const pool = resolvedPool(catalog, tier, "pairs", "beginner", null);
      const multi = multiWords(pool);
      expect(pairsCount(catalog, tier, "textbook")).toBe(multi.length || null);
      let sum = 0;
      for (const combo of availableToneCombos(multi)) {
        const n = pairsComboCount(catalog, tier, combo, "textbook");
        expect(n).toBe(wordsOfCombo(pool, combo).length);
        sum += n ?? 0;
      }
      expect(sum).toBe(multi.length);
    }
  });

  it("guest has no pairs", () => {
    expect(pairsCount(catalog, "guest", "textbook")).toBeNull();
  });

  it("visualiser counts equal the word rail (wordsPerTone / pairWordsPerCombo caps)", () => {
    const list = visualiserListWords(catalog, "free", [], "textbook");
    for (const t of [1, 2, 3, 4] as const) {
      expect(visualiserToneCount(list, "free", t)).toBe(wordsOfTone(list, t, 5).length);
    }
    const proList = visualiserListWords(catalog, "pro", [], "textbook");
    expect(visualiserToneCount(proList, "pro", 1)).toBe(wordsOfTone(proList, 1).length);
    const pairs = visualiserPairWords(catalog, "free", [], "textbook");
    for (const combo of availableToneCombos(pairs)) {
      expect(visualiserComboCount(pairs, "free", combo)).toBe(wordsOfCombo(pairs, combo, 10).length);
    }
  });

  it("visualiser follows the TOCFL selection and the speech style", () => {
    const l1 = visualiserListWords(catalog, "pro", [1], "textbook");
    const all = visualiserListWords(catalog, "pro", [], "textbook");
    expect(l1.length).toBeLessThanOrEqual(all.length);
    const p1 = visualiserPairWords(catalog, "pro", [1], "textbook");
    const pAll = visualiserPairWords(catalog, "pro", [1, 2, 3], "textbook");
    expect(p1.length).toBeLessThan(pAll.length);
    expect(p1.every((w) => w.syllables === 2 && w.listIds.includes("tocfl1"))).toBe(true);
    const some = withNatural(catalog, (_, i) => i % 2 === 0);
    expect(visualiserListWords(some, "pro", [], "natural").length).toBeLessThan(
      visualiserListWords(some, "pro", [], "textbook").length,
    );
  });
});

describe("empty states and labels", () => {
  it("renders nothing, never 0 or NaN, when the inventory is missing or empty", () => {
    expect(classicCount(null, "pro", "beginner", "mix", "textbook")).toBeNull();
    expect(classicCount([], "pro", "beginner", "mix", "textbook")).toBeNull();
    expect(drillCount(undefined, "pro", "textbook")).toBeNull();
    expect(pairsCount(null, "pro", "textbook")).toBeNull();
    expect(wordCountLabel(null)).toBe("");
  });

  it("pluralises", () => {
    expect(wordCountLabel(1)).toBe("(1 word)");
    expect(wordCountLabel(12)).toBe("(12 words)");
  });
});
