import { describe, expect, it } from "vitest";
import { levelToAdd, visualiserComboCount, visualiserPairWords } from "./poolCounts.ts";
import type { Word } from "./words.ts";

/** Minimal words: only the fields the list/pool filters read. */
function word(id: string, tones: number[], list: string): Word {
  return {
    id,
    hanzi: id,
    pinyin: id,
    tone: tones[0],
    tones,
    syllables: tones.length,
    listIds: [list],
    clipStyle: "textbook",
  } as unknown as Word;
}

const words = [
  word("a", [4, 1], "tocfl1"),
  word("b", [2, 3], "tocfl2"),
  word("c", [3, 3], "tocfl3"),
  word("d", [1], "tocfl1"),
  word("e", [3], "tocfl2"),
];

describe("practice list: empty items and the level to add", () => {
  it("counts a pair with no words in the selected list as empty (shown as 0)", () => {
    const pairs = visualiserPairWords(words, "pro", [1], "textbook");
    expect(visualiserComboCount(pairs, "pro", [4, 1])).toBe(1);
    expect(visualiserComboCount(pairs, "pro", [2, 3])).toBeNull();
  });

  it("suggests the lowest level that has words for an empty pair", () => {
    expect(levelToAdd(words, "pro", [1], "textbook", { combo: [2, 3] })).toEqual({ level: 2, unlocked: true });
    expect(levelToAdd(words, "pro", [1], "textbook", { combo: [3, 3] })).toEqual({ level: 3, unlocked: true });
  });

  it("suggests a level for an empty single tone", () => {
    expect(levelToAdd(words, "pro", [1], "textbook", { tone: 3 })).toEqual({ level: 2, unlocked: true });
  });

  it("marks a level outside the tier as locked, so the tap leads to the upsell", () => {
    expect(levelToAdd(words, "free", [1, 2], "textbook", { combo: [3, 3] })).toEqual({ level: 3, unlocked: false });
  });

  it("returns null when no other level helps", () => {
    expect(levelToAdd(words, "pro", [1], "textbook", { combo: [1, 1] })).toBeNull();
  });

  it("returns null for a tier with no level choice (guest)", () => {
    expect(levelToAdd(words, "guest", [], "textbook", { combo: [2, 3] })).toBeNull();
  });
});
