import { describe, expect, it } from "vitest";

import { Run } from "./run.ts";
import { clipFor, resolvedPool, wordInStyle, wordsInStyle, type Word } from "./words.ts";

function word(id: string, tone: 1 | 2 | 3 | 4, natural: boolean): Word {
  return {
    id,
    hanzi: "媽",
    pinyin: "ma",
    speakerId: "jane",
    english: "",
    tone,
    tones: [tone],
    syllables: 1,
    clipKey: `clips/jane/${id}.wav`,
    durationS: 0.8,
    onsetS: 0.1,
    clipS: 1.2,
    polyline: [[0, 3], [1, 3]],
    minTier: "free",
    updatedAt: "tb",
    listIds: ["sampler-beginner", "tocfl1"],
    ...(natural
      ? {
          natural: {
            clipKey: `clips/jane/natural/${id}.wav`,
            durationS: 0.4,
            onsetS: 0.05,
            clipS: 0.6,
            polyline: [[0, 4], [1, 2]],
            updatedAt: "nat",
          },
        }
      : {}),
  };
}

const both = word("a", 1, true);
const textbookOnly = word("b", 1, false);

describe("clipFor / wordInStyle", () => {
  it("picks each style's measurements", () => {
    expect(clipFor(both, "textbook")?.durationS).toBe(0.8);
    expect(clipFor(both, "natural")?.durationS).toBe(0.4);
    expect(clipFor(textbookOnly, "natural")).toBeNull();
  });

  it("re-points the top-level fields and stamps the style, idempotently", () => {
    const nat = wordInStyle(both, "natural");
    expect(nat?.durationS).toBe(0.4);
    expect(nat?.clipKey).toBe("clips/jane/natural/a.wav");
    expect(nat?.updatedAt).toBe("nat");
    expect(nat?.clipStyle).toBe("natural");
    expect(wordInStyle(nat as Word, "natural")).toBe(nat);
    expect(wordInStyle(both, "textbook")).toBe(both);
  });

  it("drops words with no take in the style — no textbook fallback in a natural pool", () => {
    expect(wordsInStyle([both, textbookOnly], "natural").map((w) => w.id)).toEqual(["a"]);
    expect(wordsInStyle([both, textbookOnly], "textbook").map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("resolvedPool applies the style filter after tier and level", () => {
    const pool = resolvedPool([both, textbookOnly], "free", "drill", "beginner", null, "natural");
    expect(pool.map((w) => w.id)).toEqual(["a"]);
    expect(pool[0].clipStyle).toBe("natural");
    expect(resolvedPool([both, textbookOnly], "free", "drill", "beginner", null).length).toBe(2);
  });
});

describe("Run speechStyle", () => {
  const words = [both, textbookOnly, word("c", 2, true), word("d", 3, true), word("e", 4, true)];

  it("flies only natural takes in a natural run", () => {
    const run = new Run({ mode: "game", width: 400, words, speechStyle: "natural", rand: () => 0 });
    expect(run.speechStyle).toBe("natural");
    const gateWords = run.snapshot().gates.map((g) => g.word).filter((w): w is Word => !!w);
    expect(gateWords.length).toBeGreaterThan(0);
    for (const w of gateWords) {
      expect(w.clipStyle).toBe("natural");
      expect(w.id).not.toBe("b");
    }
  });

  it("forces textbook for the tutorial (calibration flight and guided tutorial)", () => {
    const run = new Run({ mode: "tutorial", width: 400, words, speechStyle: "natural" });
    expect(run.speechStyle).toBe("textbook");
    for (const g of run.snapshot().gates) expect(g.word?.clipStyle).toBeUndefined();
  });

  it("defaults to textbook", () => {
    expect(new Run({ mode: "game", width: 400, words }).speechStyle).toBe("textbook");
  });
});
