import { describe, expect, it } from "vitest";
import { WORDS } from "./wordlist.ts";

describe("word list", () => {
  it("has unique ids", () => {
    // A duplicate id overwrites a finished recording at the same blob key —
    // silent data loss, discovered only when the clip sounds wrong in-game.
    const ids = WORDS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses ids that are safe as filenames and URLs", () => {
    for (const w of WORDS) {
      expect(w.id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("gives every word a tone, hanzi and pinyin", () => {
    for (const w of WORDS) {
      expect([1, 2, 3, 4]).toContain(w.tone);
      expect(w.hanzi.length).toBeGreaterThan(0);
      expect(w.pinyin.length).toBeGreaterThan(0);
    }
  });

  it("ends each id with its own tone number, so a mislabelled clip is visible", () => {
    for (const w of WORDS) {
      expect(w.id.endsWith(String(w.tone))).toBe(true);
    }
  });
});
