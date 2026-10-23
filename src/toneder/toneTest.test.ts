import { describe, expect, it } from "vitest";
import fallback from "../data/wordsFallback.json";
import { hasSimplified } from "../dev/simplified.ts";
import type { AnalyticsEvent } from "../analytics/session.ts";
import { parsePinyin } from "../site/zhuyin.ts";
import {
  buildRound,
  cornerFor,
  keyTone,
  makeToneTestReporter,
  moveRing,
  releaseTone,
  ROUND_SIZE,
  scoreRound,
  shareLine,
  takeSpare,
  TEST_WORDS,
  TONES,
  type Answer,
  type Tone,
} from "./toneTest.ts";

type Row = {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  syllables: number;
  status: string;
  lists?: string[];
};
const rows = (fallback as { rows: Row[] }).rows;

/** Mirrors workers/clips/src/routes/clip.ts' SAMPLER_LIST_IDS and level gate. */
const WORKER_SAMPLERS = new Set(["sampler-beginner", "sampler-intermediate", "sampler-seo"]);
const guestPlayable = (lists: string[]) =>
  lists.some((l) => WORKER_SAMPLERS.has(l)) || !lists.some((l) => /^tocfl\d$/.test(l));

/** A seeded RNG, so a failure reproduces. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe("word data ↔ catalog", () => {
  it("every word is a published single-syllable catalog word with matching hanzi/pinyin/tone", () => {
    for (const w of TEST_WORDS) {
      const r = rows.find((x) => x.id === w.id);
      expect(r?.status, w.id).toBe("published");
      expect(r?.syllables, w.id).toBe(1);
      expect(r?.hanzi, w.id).toBe(w.hanzi);
      expect(r?.pinyin, w.id).toBe(w.pinyin);
      expect(r?.tone, w.id).toBe(w.tone);
    }
  });
  it("every word plays for a guest ticket", () => {
    for (const w of TEST_WORDS) {
      expect(guestPlayable(rows.find((x) => x.id === w.id)?.lists ?? []), w.id).toBe(true);
    }
  });
  it("is Traditional only, unique, and at least 6 words per tone", () => {
    expect(TEST_WORDS.some((w) => hasSimplified(w.hanzi))).toBe(false);
    expect(new Set(TEST_WORDS.map((w) => w.id)).size).toBe(TEST_WORDS.length);
    for (const t of TONES) {
      expect(TEST_WORDS.filter((w) => w.tone === t).length).toBeGreaterThanOrEqual(6);
    }
  });
  it("pinyin parses to the word's own tone", () => {
    for (const w of TEST_WORDS) {
      const p = parsePinyin(w.pinyin);
      expect(p.length, w.id).toBe(1);
      expect("syllable" in p[0] && p[0].syllable.tone, w.id).toBe(w.tone);
    }
  });
});

describe("buildRound", () => {
  it("balances tones (2–3 each) and never repeats a word", () => {
    for (let s = 1; s < 200; s++) {
      const { cards, spares } = buildRound(rng(s));
      expect(cards).toHaveLength(ROUND_SIZE);
      expect(new Set(cards.map((w) => w.id)).size).toBe(ROUND_SIZE);
      for (const t of TONES) {
        const n = cards.filter((w) => w.tone === t).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
      expect(cards.some((c) => spares.includes(c))).toBe(false);
      expect(cards.length + spares.length).toBe(TEST_WORDS.length);
    }
  });
  it("avoids the last round's words", () => {
    for (let s = 1; s < 100; s++) {
      const first = buildRound(rng(s)).cards.map((w) => w.id);
      const next = buildRound(rng(s + 1000), TEST_WORDS, new Set(first)).cards;
      expect(next.some((w) => first.includes(w.id))).toBe(false);
    }
  });
  it("varies between rounds", () => {
    const a = buildRound(rng(1)).cards.map((w) => w.id).join();
    const b = buildRound(rng(2)).cards.map((w) => w.id).join();
    expect(a).not.toBe(b);
  });
  it("takeSpare prefers the same tone and removes it", () => {
    const { spares } = buildRound(rng(3));
    const n = spares.length;
    const s = takeSpare(spares, 3);
    expect(s?.tone).toBe(3);
    expect(spares).toHaveLength(n - 1);
    expect(takeSpare([], 1)).toBeNull();
  });
});

const ans = (tone: Tone, picked: Tone): Answer => ({ tone, picked });

describe("scoreRound", () => {
  it("counts correct answers per tone", () => {
    const r = scoreRound([ans(1, 1), ans(2, 3), ans(3, 3), ans(4, 4)]);
    expect(r.correct).toBe(3);
    expect(r.total).toBe(4);
    expect(r.perTone[2]).toEqual({ cards: 1, correct: 0 });
    expect(r.weakest).toBe(2);
  });
  it("names a mix-up only with two or more misses between the same pair, either way", () => {
    expect(scoreRound([ans(2, 3), ans(1, 1)]).mixUp).toBeNull();
    expect(scoreRound([ans(2, 3), ans(3, 2), ans(1, 4)]).mixUp).toEqual([2, 3]);
    expect(scoreRound([ans(1, 4), ans(1, 4), ans(2, 3)]).mixUp).toEqual([1, 4]);
  });
  it("a perfect round has no weakest tone", () => {
    expect(scoreRound([ans(1, 1), ans(3, 3)]).weakest).toBeNull();
  });
});

describe("swipe hit-testing", () => {
  it("maps each diagonal to its corner", () => {
    expect(cornerFor(-100, -100)).toBe(1);
    expect(cornerFor(100, -100)).toBe(2);
    expect(cornerFor(-100, 100)).toBe(3);
    expect(cornerFor(100, 100)).toBe(4);
  });
  it("ignores tiny or straight drags", () => {
    expect(cornerFor(10, 10)).toBeNull();
    expect(cornerFor(0, -200)).toBeNull();
    expect(cornerFor(200, 5)).toBeNull();
  });
  it("commits past 30% of the reach, or on a flick", () => {
    expect(releaseTone(60, 60, 400, 0)).toBeNull(); // 85px < 120px
    expect(releaseTone(90, 90, 400, 0)).toBe(4); // 127px
    expect(releaseTone(30, -30, 400, 1)).toBe(2); // flick
    expect(releaseTone(5, 5, 400, 5)).toBeNull(); // in the dead zone
  });
  it("keyboard: digits answer, arrows move the ring", () => {
    expect(keyTone("3")).toBe(3);
    expect(keyTone("5")).toBeNull();
    expect(moveRing(null, "ArrowRight")).toBe(2);
    expect(moveRing(2, "ArrowDown")).toBe(4);
    expect(moveRing(4, "ArrowLeft")).toBe(3);
    expect(moveRing(3, "x")).toBe(3);
  });
});

describe("reporter", () => {
  it("sends started/round_done once per round and one summary of counts only", () => {
    const sent: AnalyticsEvent[] = [];
    const r = makeToneTestReporter((e) => sent.push(e));
    r.summary();
    expect(sent).toHaveLength(0);
    r.started();
    r.started();
    r.answered(ans(2, 2));
    r.answered(ans(3, 2));
    r.roundDone();
    r.roundDone();
    r.style("spoken");
    r.started();
    r.roundDone();
    r.summary();
    r.summary();
    expect(sent.map((e) => ("action" in e ? e.action : e.type))).toEqual([
      "started",
      "round_done",
      "started",
      "round_done",
      "tool_summary",
    ]);
    const s = sent[4];
    expect(s).toMatchObject({ rounds: 2, cards: 2, correct: 1, t2Correct: 1, style: "mixed" });
    for (const e of sent) {
      for (const v of Object.values(e)) {
        if (typeof v === "string") {
          expect(TEST_WORDS.some((w) => v.includes(w.id) || v.includes(w.hanzi))).toBe(false);
        }
      }
    }
  });
  it("never throws when sending fails", () => {
    const r = makeToneTestReporter(() => {
      throw new Error("x");
    });
    expect(() => {
      r.started();
      r.summary();
    }).not.toThrow();
  });
});

describe("shareLine", () => {
  it("is plain text with the score", () => {
    expect(shareLine(8, 10, "standard")).toBe("I matched 8/10 Mandarin tones by ear. Can you beat it?");
    expect(shareLine(5, 10, "spoken")).toContain("spoken speed");
  });
});
