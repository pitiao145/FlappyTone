import { describe, expect, it } from "vitest";
import {
  AmbiguousPinyinError,
  disambiguate,
  idFor,
  parseSyllable,
  parseWord,
} from "./pinyin.ts";

describe("parseSyllable", () => {
  it("reads the four tones off the diacritic", () => {
    expect(parseSyllable("mā")).toEqual({ stem: "ma", tone: 1 });
    expect(parseSyllable("má")).toEqual({ stem: "ma", tone: 2 });
    expect(parseSyllable("mǎ")).toEqual({ stem: "ma", tone: 3 });
    expect(parseSyllable("mà")).toEqual({ stem: "ma", tone: 4 });
  });

  it("reports neutral tone as 0 rather than guessing", () => {
    expect(parseSyllable("ma")).toEqual({ stem: "ma", tone: 0 });
    expect(parseSyllable("ma5")).toEqual({ stem: "ma", tone: 0 });
  });

  it("accepts numeric pinyin, because people type it", () => {
    expect(parseSyllable("hao3")).toEqual({ stem: "hao", tone: 3 });
    expect(parseSyllable("tang1")).toEqual({ stem: "tang", tone: 1 });
  });

  it("finds the tone wherever the mark sits in the syllable", () => {
    expect(parseSyllable("hǎo")).toEqual({ stem: "hao", tone: 3 });
    expect(parseSyllable("guó")).toEqual({ stem: "guo", tone: 2 });
    expect(parseSyllable("xiè")).toEqual({ stem: "xie", tone: 4 });
  });

  it("keeps ü out of the filename by writing it v", () => {
    expect(parseSyllable("lǜ")).toEqual({ stem: "lv", tone: 4 });
    expect(parseSyllable("nǚ")).toEqual({ stem: "nv", tone: 3 });
    expect(parseSyllable("lü")).toEqual({ stem: "lv", tone: 0 });
  });

  it("ignores case and stray punctuation", () => {
    expect(parseSyllable("Mā")).toEqual({ stem: "ma", tone: 1 });
    expect(parseSyllable(" hǎo! ")).toEqual({ stem: "hao", tone: 3 });
  });

  it("survives decomposed unicode from a copy-paste", () => {
    // "mā" typed as m + a + combining macron.
    expect(parseSyllable("mā")).toEqual({ stem: "ma", tone: 1 });
  });
});

describe("parseWord", () => {
  it("splits on spaces", () => {
    expect(parseWord("nǐ hǎo")).toEqual([
      { stem: "ni", tone: 3 },
      { stem: "hao", tone: 3 },
    ]);
  });

  it("refuses an unspaced diacritic form rather than mis-splitting it", () => {
    // The mark sits on the vowel, not at the syllable end, so a naive split
    // gives "hǎ" + "o". Better to ask for a space than to file a recording
    // under a mangled name.
    expect(() => parseWord("nǐhǎo")).toThrow(AmbiguousPinyinError);
  });

  it("splits numeric pinyin", () => {
    expect(parseWord("ni3hao3")).toEqual([
      { stem: "ni", tone: 3 },
      { stem: "hao", tone: 3 },
    ]);
  });

  it("leaves a single syllable alone", () => {
    expect(parseWord("mā")).toEqual([{ stem: "ma", tone: 1 }]);
  });

  it("handles a trailing neutral syllable", () => {
    expect(parseWord("xiè xie")).toEqual([
      { stem: "xie", tone: 4 },
      { stem: "xie", tone: 0 },
    ]);
  });
});

describe("idFor", () => {
  it("builds a filename-safe stem", () => {
    expect(idFor("mā")).toBe("ma1");
    expect(idFor("hǎo")).toBe("hao3");
    expect(idFor("lǜ")).toBe("lv4");
  });

  it("keeps multi-syllable words distinguishable", () => {
    expect(idFor("nǐ hǎo")).toBe("nihao33");
  });

  it("only ever emits characters the upload endpoint accepts", () => {
    for (const p of ["mā", "nǚ", "xiè xie", "guó", "ér"]) {
      expect(idFor(p)).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("disambiguate", () => {
  it("leaves unique ids alone", () => {
    expect(disambiguate(["ma1", "hao3"])).toEqual(["ma1", "hao3"]);
  });

  it("separates homophones in list order", () => {
    // 是 and 事 are both shì — the case that would otherwise overwrite one
    // recording with the other at the same blob key.
    expect(disambiguate(["shi4", "shi4", "shi4"])).toEqual(["shi4", "shi4b", "shi4c"]);
  });

  it("never appends a digit, which would read as a tone number", () => {
    for (const id of disambiguate(Array(30).fill("shi4"))) {
      expect(id).toMatch(/^shi4[a-z]*$/);
    }
  });

  it("keeps every id distinct even with many homophones", () => {
    const ids = disambiguate(Array(60).fill("yi1"));
    expect(new Set(ids).size).toBe(60);
  });
});
