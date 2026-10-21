import { describe, expect, it } from "vitest";
import { checkPair, extractPairs, extractZhuyinClaims, parseCedict, zhuyinMatches } from "./seoPinyin.ts";

const FIXTURE = `
  { id: "xiexie40", hanzi: "謝謝", pinyin: "xiè xie", english: "thank you", tone: 4 },
  ["ma1b", "媽", "mā", "mother"],
  answer: "Thank you is 謝謝, written xièxie in pinyin and ㄒㄧㄝˋ ˙ㄒㄧㄝ in 注音. Reply 不客氣 (bú kè qì, you're welcome).",
  note: "examples use 注音 Zhuyin and 你好 (hello)",
`;

const CEDICT = `# header
謝 谢 [xie4] /to thank/
媽 妈 [ma1] /mum/
不 不 [bu4] /not/
客 客 [ke4] /guest/
氣 气 [qi4] /gas/
`;

describe("extractPairs", () => {
  const pairs = extractPairs("f.ts", FIXTURE);

  it("finds field, tuple and prose pairs with their line", () => {
    expect(pairs.map((p) => [p.kind, p.hanzi, p.pinyin, p.line])).toEqual([
      ["field", "謝謝", "xiè xie", 2],
      ["tuple", "媽", "mā", 3],
      ["prose", "不客氣", "bú kè qì", 4],
    ]);
  });

  it("skips English after hanzi and parentheses that are not pinyin", () => {
    expect(pairs.some((p) => p.hanzi === "注音" || p.hanzi === "你好")).toBe(false);
  });

  it("finds the pinyin/注音 claim and checks it", () => {
    const [c] = extractZhuyinClaims("f.ts", FIXTURE);
    expect(c.pinyin).toBe("xièxie");
    expect(zhuyinMatches(c)).toBe(true);
    expect(zhuyinMatches({ ...c, zhuyin: "ㄒㄧㄝˋ ㄒㄧㄝˋ" })).toBe(false);
  });
});

describe("checkPair", () => {
  const dict = parseCedict(CEDICT);
  const none = new Map<string, Set<string>>();

  it("accepts neutral tone and 不 sandhi with a note", () => {
    const [xx, , bkq] = extractPairs("f.ts", FIXTURE);
    expect(checkPair(xx, dict, none)).toEqual({ ok: true, note: "謝 neutral" });
    expect(checkPair(bkq, dict, none)).toEqual({ ok: true, note: "不 sandhi" });
  });

  it("flags a wrong tone and a catalog disagreement", () => {
    const p = { file: "f", line: 1, hanzi: "媽", pinyin: "mǎ", kind: "field" as const };
    expect(checkPair(p, dict, none).ok).toBe(false);
    expect(checkPair({ ...p, pinyin: "mā" }, dict, new Map([["媽", new Set(["ma3"])]])).ok).toBe(false);
  });
});
