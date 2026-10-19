import { describe, expect, it } from "vitest";
import fallback from "../../data/wordsFallback.json";
import { hasSimplified } from "../../dev/simplified.ts";
import { CHECKER_WORDS, checkerWordFor, DEFAULT_CHECKER_WORD } from "./checkerWords.ts";

type Row = {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  tone: number;
  tones: number[];
  syllables: number;
  status: string;
  lists?: string[];
  polyline: unknown;
  onset_s: number;
  duration_s: number;
  clip_s: number;
};
const rows = (fallback as { rows: Row[] }).rows;
const row = (id: string) => rows.find((r) => r.id === id)!;

describe("tone checker word list", () => {
  it("every word is a published recording, copied without drift", () => {
    for (const w of CHECKER_WORDS) {
      const r = row(w.id);
      expect(r?.status, w.id).toBe("published");
      expect({
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        english: w.english,
        tone: w.tone,
        tones: w.tones,
        polyline: w.polyline,
        onsetS: w.onsetS,
        durationS: w.durationS,
        clipS: w.clipS,
      }).toEqual({
        hanzi: r.hanzi,
        pinyin: r.pinyin,
        english: r.english,
        tone: r.tone,
        tones: r.tones.length ? r.tones : [r.tone],
        polyline: r.polyline,
        onsetS: r.onset_s,
        durationS: r.duration_s,
        clipS: r.clip_s,
      });
    }
  });

  it("every word plays for a guest ticket (Worker's TOCFL level gate)", () => {
    // Mirrors workers/clips/src/routes/clip.ts: a guest gets a word only if it
    // is in a sampler list or in no tocfl* list.
    for (const w of CHECKER_WORDS) {
      const lists = row(w.id).lists ?? [];
      const sampler = lists.some((l) => l.startsWith("sampler-"));
      const leveled = lists.some((l) => /^tocfl\d$/.test(l));
      expect(sampler || !leveled, `${w.id} ${lists.join(",")}`).toBe(true);
    }
  });

  it("is Traditional only (hard rule 9)", () => {
    for (const w of CHECKER_WORDS) expect(hasSimplified(w.hanzi), w.hanzi).toBe(false);
  });

  it("has 4-6 single syllables per tone and at most 4 pairs", () => {
    for (const t of [1, 2, 3, 4]) {
      const n = CHECKER_WORDS.filter((w) => w.tones.length === 1 && w.tone === t).length;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(CHECKER_WORDS.filter((w) => w.tones.length === 2).length).toBeLessThanOrEqual(4);
    expect(new Set(CHECKER_WORDS.map((w) => w.id)).size).toBe(CHECKER_WORDS.length);
  });

  it("?word=<id> preselects; unknown or missing falls back to the default", () => {
    expect(checkerWordFor("ni3").id).toBe("ni3");
    expect(checkerWordFor("xihuan31").id).toBe("xihuan31");
    expect(checkerWordFor("nope").id).toBe(DEFAULT_CHECKER_WORD);
    expect(checkerWordFor(null).id).toBe(DEFAULT_CHECKER_WORD);
    expect(checkerWordFor("").id).toBe(DEFAULT_CHECKER_WORD);
  });
});
