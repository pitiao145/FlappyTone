import { describe, expect, it } from "vitest";
import { sandhiTones, type SandhiWord } from "./sandhi.ts";

function w(hanzi: string, pinyin: string, tones: SandhiWord["tones"]): SandhiWord {
  return { hanzi, pinyin, tones };
}

describe("sandhiTones", () => {
  describe("single syllable — always unchanged", () => {
    it.each([
      ["媽", "mā", [1]],
      ["麻", "má", [2]],
      ["馬", "mǎ", [3]],
      ["罵", "mà", [4]],
      ["嗎", "ma", [0]],
    ] as const)("%s (%s) stays T%s", (hanzi, pinyin, tones) => {
      expect(sandhiTones(w(hanzi, pinyin, [...tones]))).toEqual([...tones]);
    });
  });

  describe("3rd-tone sandhi (Rules A/B)", () => {
    it("3+3 -> 2+3 (你好)", () => {
      expect(sandhiTones(w("你好", "nǐ hǎo", [3, 3]))).toEqual([2, 3]);
    });

    it("3+1 -> half3+1 (老師)", () => {
      expect(sandhiTones(w("老師", "lǎo shī", [3, 1]))).toEqual(["half3", 1]);
    });

    it("3+2 -> half3+2 (演員)", () => {
      expect(sandhiTones(w("演員", "yǎn yuán", [3, 2]))).toEqual(["half3", 2]);
    });

    it("3+4 -> half3+4 (討論)", () => {
      expect(sandhiTones(w("討論", "tǎo lùn", [3, 4]))).toEqual(["half3", 4]);
    });

    it("3+0 -> half3+0 (椅子)", () => {
      expect(sandhiTones(w("椅子", "yǐ zi", [3, 0]))).toEqual(["half3", 0]);
    });
  });

  describe("non-3rd-tone pairs — unchanged", () => {
    it.each([
      ["今天", "jīn tiān", [1, 1]],
      ["資源", "zī yuán", [1, 2]],
      ["希望", "xī wàng", [1, 4]],
      ["台灣", "tái wān", [2, 1]],
      ["銀行", "yín háng", [2, 2]],
      ["蘋果", "píng guǒ", [2, 3]],
      ["情況", "qíng kuàng", [2, 4]],
      ["汽車", "qì chē", [4, 1]],
      ["複習", "fù xí", [4, 2]],
      ["電腦", "diàn nǎo", [4, 3]],
      ["社會", "shè huì", [4, 4]],
    ] as const)("%s (%s) stays %s", (hanzi, pinyin, tones) => {
      expect(sandhiTones(w(hanzi, pinyin, [...tones]))).toEqual([...tones]);
    });
  });

  describe("一 (yī), Rule C", () => {
    it("一 + T4 -> 2+4 (一定)", () => {
      expect(sandhiTones(w("一定", "yī dìng", [1, 4]))).toEqual([2, 4]);
    });

    it("一 + T1 -> 4+1 (一天)", () => {
      expect(sandhiTones(w("一天", "yī tiān", [1, 1]))).toEqual([4, 1]);
    });

    it("一 + T2 -> 4+2 (一直)", () => {
      expect(sandhiTones(w("一直", "yī zhí", [1, 2]))).toEqual([4, 2]);
    });

    it("一 + T3 -> 4+3 (一起)", () => {
      expect(sandhiTones(w("一起", "yī qǐ", [1, 3]))).toEqual([4, 3]);
    });
  });

  describe("不 (bù), Rule D", () => {
    it("不 + T4 -> 2+4 (不是)", () => {
      expect(sandhiTones(w("不是", "bù shì", [4, 4]))).toEqual([2, 4]);
    });

    it("不 + T1 -> unchanged (不吃)", () => {
      expect(sandhiTones(w("不吃", "bù chī", [4, 1]))).toEqual([4, 1]);
    });

    it("不 + T3 -> unchanged (不好)", () => {
      expect(sandhiTones(w("不好", "bù hǎo", [4, 3]))).toEqual([4, 3]);
    });
  });

  describe("hanzi guard against non-一/不 homophones", () => {
    it("衣 (yī, T1) is not treated as 一 even in a T4-following pair", () => {
      // 衣 + a synthetic T4 second syllable: a bare yi1-stem word that is not
      // the numeral must not get the Rule C tone flip.
      expect(sandhiTones(w("衣", "yī", [1]))).toEqual([1]); // single syllable, sanity check
      expect(sandhiTones(w("衣服", "yī fú", [1, 2]))).toEqual([1, 2]);
    });

    it("布 (bù, T4) is not treated as 不 even before T4", () => {
      expect(sandhiTones(w("布料", "bù liào", [4, 4]))).toEqual([4, 4]);
    });
  });
});
