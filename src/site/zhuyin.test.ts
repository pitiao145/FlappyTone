import { describe, expect, it } from "vitest";
import {
  inputDirection,
  isValidSyllable,
  markSyllable,
  parsePinyin,
  syllablesOf,
  toMarks,
  toNumbers,
  toZhuyin,
  zhuyinSyllable,
} from "./zhuyin.ts";

const zy = (base: string, tone: 0 | 1 | 2 | 3 | 4 = 1) =>
  zhuyinSyllable({ base, tone });

describe("toMarks", () => {
  it("converts the brief's examples", () => {
    expect(toMarks("ni3 hao3")).toBe("nǐ hǎo");
    expect(toMarks("lv4")).toBe("lǜ");
    expect(toMarks("nü3")).toBe("nǚ");
    expect(toMarks("ma5")).toBe("ma");
    expect(toMarks("ma0")).toBe("ma");
  });

  it("places the mark: a/e first, o in ou, else the last vowel", () => {
    expect(toMarks("hao3")).toBe("hǎo");
    expect(toMarks("xie4")).toBe("xiè");
    expect(toMarks("dou1")).toBe("dōu");
    expect(toMarks("liu2")).toBe("liú");
    expect(toMarks("gui4")).toBe("guì");
    expect(toMarks("zhuang4")).toBe("zhuàng");
    expect(toMarks("xue2")).toBe("xué");
    expect(toMarks("lve4")).toBe("lüè");
    expect(toMarks("lue4")).toBe("lüè");
    expect(toMarks("er2")).toBe("ér");
  });

  it("splits unspaced numbered input and keeps other text", () => {
    expect(toMarks("ni3hao3")).toBe("nǐhǎo");
    expect(toMarks("Xi1'an1!")).toBe("xī'ān!");
    expect(toMarks("hello ma1")).toBe("hello mā");
  });
});

describe("toNumbers", () => {
  it("converts marks back, unmarked syllables are neutral", () => {
    expect(toNumbers("nǐ hǎo")).toBe("ni3 hao3");
    expect(toNumbers("shén me")).toBe("shen2 me5");
    expect(toNumbers("lǜ")).toBe("lü4");
    expect(toNumbers("nǐhǎo")).toBe("ni3hao3");
  });

  it("round-trips", () => {
    for (const s of [
      "ni3 hao3",
      "zhong1 guo2",
      "lü4",
      "xue2 sheng1",
      "peng2 you5",
      "er4",
    ]) {
      expect(toNumbers(toMarks(s))).toBe(s);
    }
    for (const s of ["nǐ hǎo", "Běi jīng", "nǚ ér"]) {
      expect(toMarks(toNumbers(s))).toBe(s.toLowerCase());
    }
  });
});

describe("zhuyin", () => {
  it("converts the brief's example", () => {
    expect(toZhuyin("ni3 hao3")).toBe("ㄋㄧˇ ㄏㄠˇ");
    expect(toZhuyin("nǐ hǎo")).toBe("ㄋㄧˇ ㄏㄠˇ");
  });

  it("covers every initial", () => {
    const cases: [string, string][] = [
      ["ba", "ㄅㄚ"],
      ["pa", "ㄆㄚ"],
      ["ma", "ㄇㄚ"],
      ["fa", "ㄈㄚ"],
      ["da", "ㄉㄚ"],
      ["ta", "ㄊㄚ"],
      ["na", "ㄋㄚ"],
      ["la", "ㄌㄚ"],
      ["ge", "ㄍㄜ"],
      ["ke", "ㄎㄜ"],
      ["he", "ㄏㄜ"],
      ["ji", "ㄐㄧ"],
      ["qi", "ㄑㄧ"],
      ["xi", "ㄒㄧ"],
      ["zha", "ㄓㄚ"],
      ["cha", "ㄔㄚ"],
      ["sha", "ㄕㄚ"],
      ["re", "ㄖㄜ"],
      ["za", "ㄗㄚ"],
      ["ca", "ㄘㄚ"],
      ["sa", "ㄙㄚ"],
    ];
    for (const [b, z] of cases) expect(zy(b)).toBe(z);
  });

  it("covers every final", () => {
    const cases: [string, string][] = [
      ["ba", "ㄅㄚ"],
      ["bo", "ㄅㄛ"],
      ["de", "ㄉㄜ"],
      ["bai", "ㄅㄞ"],
      ["bei", "ㄅㄟ"],
      ["bao", "ㄅㄠ"],
      ["dou", "ㄉㄡ"],
      ["ban", "ㄅㄢ"],
      ["ben", "ㄅㄣ"],
      ["bang", "ㄅㄤ"],
      ["beng", "ㄅㄥ"],
      ["dong", "ㄉㄨㄥ"],
      ["bi", "ㄅㄧ"],
      ["dia", "ㄉㄧㄚ"],
      ["bie", "ㄅㄧㄝ"],
      ["biao", "ㄅㄧㄠ"],
      ["diu", "ㄉㄧㄡ"],
      ["bian", "ㄅㄧㄢ"],
      ["bin", "ㄅㄧㄣ"],
      ["liang", "ㄌㄧㄤ"],
      ["bing", "ㄅㄧㄥ"],
      ["xiong", "ㄒㄩㄥ"],
      ["bu", "ㄅㄨ"],
      ["gua", "ㄍㄨㄚ"],
      ["duo", "ㄉㄨㄛ"],
      ["guai", "ㄍㄨㄞ"],
      ["dui", "ㄉㄨㄟ"],
      ["duan", "ㄉㄨㄢ"],
      ["dun", "ㄉㄨㄣ"],
      ["guang", "ㄍㄨㄤ"],
      ["lv", "ㄌㄩ"],
      ["nve", "ㄋㄩㄝ"],
      ["ju", "ㄐㄩ"],
      ["que", "ㄑㄩㄝ"],
      ["xuan", "ㄒㄩㄢ"],
      ["jun", "ㄐㄩㄣ"],
    ];
    for (const [b, z] of cases) expect(zy(b)).toBe(z);
  });

  it("writes zhi/chi/shi/ri/zi/ci/si as the initial alone", () => {
    expect(
      ["zhi", "chi", "shi", "ri", "zi", "ci", "si"].map((b) => zy(b)),
    ).toEqual(["ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ"]);
  });

  it("handles y-/w- spellings, er and standalone vowels", () => {
    const cases: [string, string][] = [
      ["yi", "ㄧ"],
      ["ya", "ㄧㄚ"],
      ["ye", "ㄧㄝ"],
      ["yao", "ㄧㄠ"],
      ["you", "ㄧㄡ"],
      ["yan", "ㄧㄢ"],
      ["yin", "ㄧㄣ"],
      ["yang", "ㄧㄤ"],
      ["ying", "ㄧㄥ"],
      ["yong", "ㄩㄥ"],
      ["wu", "ㄨ"],
      ["wa", "ㄨㄚ"],
      ["wo", "ㄨㄛ"],
      ["wai", "ㄨㄞ"],
      ["wei", "ㄨㄟ"],
      ["wan", "ㄨㄢ"],
      ["wen", "ㄨㄣ"],
      ["wang", "ㄨㄤ"],
      ["weng", "ㄨㄥ"],
      ["yu", "ㄩ"],
      ["yue", "ㄩㄝ"],
      ["yuan", "ㄩㄢ"],
      ["yun", "ㄩㄣ"],
      ["er", "ㄦ"],
      ["a", "ㄚ"],
      ["o", "ㄛ"],
      ["e", "ㄜ"],
      ["ai", "ㄞ"],
      ["ei", "ㄟ"],
      ["ao", "ㄠ"],
      ["ou", "ㄡ"],
      ["an", "ㄢ"],
      ["en", "ㄣ"],
      ["ang", "ㄤ"],
      ["eng", "ㄥ"],
    ];
    for (const [b, z] of cases) expect(zy(b)).toBe(z);
  });

  it("puts tone marks after, and the neutral mark ˙ before", () => {
    expect(zy("ma", 1)).toBe("ㄇㄚ");
    expect(zy("ma", 2)).toBe("ㄇㄚˊ");
    expect(zy("ma", 3)).toBe("ㄇㄚˇ");
    expect(zy("ma", 4)).toBe("ㄇㄚˋ");
    expect(zy("ma", 0)).toBe("˙ㄇㄚ");
    expect(toZhuyin("shen2 me5")).toBe("ㄕㄣˊ ˙ㄇㄜ");
  });
});

describe("parsing", () => {
  it("leaves non-pinyin runs as text", () => {
    expect(parsePinyin("xyz")).toEqual([{ text: "xyz" }]);
    expect(syllablesOf("hello")).toEqual([]);
  });

  it("knows real syllables", () => {
    expect(isValidSyllable("zhuang")).toBe(true);
    expect(isValidSyllable("bia")).toBe(false);
  });

  it("detects the direction", () => {
    expect(inputDirection("ni3 hao3")).toBe("to-marks");
    expect(inputDirection("nǐ hǎo")).toBe("to-numbers");
    expect(inputDirection("nü3")).toBe("to-marks");
  });

  it("marks a syllable directly", () => {
    expect(markSyllable({ base: "lv", tone: 0 })).toBe("lü");
  });
});
