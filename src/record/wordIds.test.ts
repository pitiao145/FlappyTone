import { describe, expect, it } from "vitest";
import { assignIds, type AssignedWord } from "./wordIds.ts";

const w = (hanzi: string, pinyin: string) => ({ hanzi, pinyin });
const idOf = (result: { words: AssignedWord[] }, hanzi: string) =>
  result.words.find((x) => x.hanzi === hanzi)?.id;

describe("assignIds", () => {
  it("mints ids for a first import", () => {
    const r = assignIds([], [w("妈", "mā"), w("好", "hǎo")]);
    expect(r.words.map((x) => x.id)).toEqual(["ma1", "hao3"]);
    expect(r.added).toHaveLength(2);
    expect(r.kept).toHaveLength(0);
  });

  it("separates homophones on a first import", () => {
    const r = assignIds([], [w("是", "shì"), w("事", "shì"), w("市", "shì")]);
    expect(r.words.map((x) => x.id)).toEqual(["shi4", "shi4b", "shi4c"]);
  });

  it("never moves an id when a word is inserted into a homophone group", () => {
    // The bug this file exists for. Recomputing from list order turned
    // shi4b from 事 into 试, relabelling audio that was already recorded.
    const v1 = assignIds([], [w("是", "shì"), w("事", "shì"), w("市", "shì")]);
    const v2 = assignIds(v1.words, [
      w("是", "shì"),
      w("试", "shì"), // new, inserted in the middle
      w("事", "shì"),
      w("市", "shì"),
    ]);
    expect(idOf(v2, "是")).toBe("shi4");
    expect(idOf(v2, "事")).toBe("shi4b");
    expect(idOf(v2, "市")).toBe("shi4c");
    expect(idOf(v2, "试")).toBe("shi4d"); // the newcomer takes the free slot
  });

  it("keeps ids stable when the whole list is reordered", () => {
    const v1 = assignIds([], [w("妈", "mā"), w("好", "hǎo"), w("汤", "tāng")]);
    const v2 = assignIds(v1.words, [w("汤", "tāng"), w("妈", "mā"), w("好", "hǎo")]);
    for (const word of v1.words) {
      expect(idOf(v2, word.hanzi)).toBe(word.id);
    }
    expect(v2.added).toHaveLength(0);
    expect(v2.kept).toHaveLength(3);
  });

  it("preserves the incoming order for recording, even as ids stay put", () => {
    const v1 = assignIds([], [w("妈", "mā"), w("好", "hǎo")]);
    const v2 = assignIds(v1.words, [w("好", "hǎo"), w("妈", "mā")]);
    expect(v2.words.map((x) => x.hanzi)).toEqual(["好", "妈"]);
  });

  it("does not reuse the id of a word dropped from the list", () => {
    // 事 may already have a recording at shi4b in storage. Handing that key to
    // a different word would attach her audio to the wrong one.
    const v1 = assignIds([], [w("是", "shì"), w("事", "shì")]);
    const v2 = assignIds(v1.words, [w("是", "shì"), w("市", "shì")]);
    expect(idOf(v2, "市")).toBe("shi4c");
    expect(v2.dropped.map((x) => x.hanzi)).toEqual(["事"]);
  });

  it("treats the same hanzi read two ways as two words", () => {
    const r = assignIds([], [w("行", "xíng"), w("行", "háng")]);
    expect(r.words.map((x) => x.id)).toEqual(["xing2", "hang2"]);
  });

  it("collapses a word listed twice in one file", () => {
    const r = assignIds([], [w("妈", "mā"), w("妈", "mā")]);
    expect(r.words).toHaveLength(1);
  });

  it("survives whitespace and case drift between exports of the list", () => {
    const v1 = assignIds([], [w("妈", "mā")]);
    const v2 = assignIds(v1.words, [w(" 妈 ", "Mā")]);
    expect(v2.kept).toHaveLength(1);
    expect(v2.added).toHaveLength(0);
  });

  it("reports what changed, so a growing list is reviewable", () => {
    const v1 = assignIds([], [w("妈", "mā"), w("好", "hǎo")]);
    const v2 = assignIds(v1.words, [w("妈", "mā"), w("汤", "tāng")]);
    expect(v2.kept.map((x) => x.hanzi)).toEqual(["妈"]);
    expect(v2.added.map((x) => x.hanzi)).toEqual(["汤"]);
    expect(v2.dropped.map((x) => x.hanzi)).toEqual(["好"]);
  });

  it("stays stable across many rounds of growth", () => {
    let current = assignIds([], [w("是", "shì")]);
    const first = { ...current.words[0] };
    for (const hanzi of ["事", "市", "试", "式", "视"]) {
      current = assignIds(current.words, [w(hanzi, "shì"), ...current.words]);
    }
    expect(idOf(current, "是")).toBe(first.id);
    const ids = current.words.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
