import { describe, expect, it } from "vitest";
import { nextPendingId } from "./boothQueue.ts";
import type { BoothWord } from "./boothWords.ts";

function word(id: string): BoothWord {
  return { id, hanzi: "測", pinyin: id, tone: 4, status: "pending" };
}

describe("nextPendingId", () => {
  it("advances to the next still-pending word from a mid-list id", () => {
    const order = ["a", "b", "c", "d"];
    const pending = [word("a"), word("b"), word("c"), word("d")];
    expect(nextPendingId(order, pending, new Set(), "b")).toBe("c");
  });

  it("skips a word that's already been captured this session", () => {
    const order = ["a", "b", "c", "d"];
    const pending = [word("a"), word("b"), word("c"), word("d")];
    expect(nextPendingId(order, pending, new Set(["c"]), "b")).toBe("d");
  });

  it("falls back to the earliest still-pending word when afterId is absent from order", () => {
    // "z" is a redo of a word that was already `recorded` before this
    // session's snapshot — it was never part of `order` — so this must not
    // restart the walk at order[0]; it should land on whatever's actually
    // still pending, even though that's mid-list.
    const order = ["a", "b", "c", "d"];
    const pending = [word("c"), word("d")]; // a and b are already recorded
    expect(nextPendingId(order, pending, new Set(), "z")).toBe("c");
  });

  it("does not fall back to an earlier already-recorded word when afterId is absent from order", () => {
    const order = ["a", "b", "c", "d"];
    const pending = [word("d")]; // a, b, c already recorded/captured
    expect(nextPendingId(order, pending, new Set(), "z")).toBe("d");
  });

  it("returns the first pending word when afterId is null", () => {
    const order = ["a", "b", "c"];
    const pending = [word("b"), word("c")];
    expect(nextPendingId(order, pending, new Set(), null)).toBe("b");
  });

  it("falls back past the end of order to any remaining pending word", () => {
    const order = ["a", "b"];
    const pending = [word("a"), word("b"), word("z")]; // z was added out of band
    expect(nextPendingId(order, pending, new Set(["a", "b"]), "b")).toBe("z");
  });

  it("returns null when nothing is left to record", () => {
    expect(nextPendingId(["a"], [], new Set(), "a")).toBeNull();
  });
});
