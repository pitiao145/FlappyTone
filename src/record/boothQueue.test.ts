import { describe, expect, it } from "vitest";
import { buildSequence, nextPendingId, stepId, stripWindow } from "./boothQueue.ts";
import type { BoothWord } from "./boothWords.ts";

function word(id: string): BoothWord {
  return { id, hanzi: "測", pinyin: id, tone: 4, textbook: "pending", natural: "pending", lists: [] };
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

describe("buildSequence", () => {
  it("is the order when the start word is in it, or no start word", () => {
    expect(buildSequence(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(buildSequence(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("puts a redo word that is not in the order first", () => {
    expect(buildSequence(["a", "b"], "z")).toEqual(["z", "a", "b"]);
  });
});

describe("stepId", () => {
  const seq = ["a", "b", "c"];
  it("steps either way and stops at the ends", () => {
    expect(stepId(seq, "b", 1)).toBe("c");
    expect(stepId(seq, "b", -1)).toBe("a");
    expect(stepId(seq, "a", -1)).toBeNull();
    expect(stepId(seq, "c", 1)).toBeNull();
  });

  it("is null for a word not in the sequence", () => {
    expect(stepId(seq, "z", 1)).toBeNull();
    expect(stepId(seq, null, 1)).toBeNull();
  });
});

describe("stripWindow", () => {
  const seq = ["a", "b", "c", "d", "e", "f", "g", "h"];
  it("shows one behind and four ahead", () => {
    expect(stripWindow(seq, "c")).toEqual(["b", "c", "d", "e", "f", "g"]);
  });

  it("keeps its size at either end", () => {
    expect(stripWindow(seq, "a")).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(stripWindow(seq, "h")).toEqual(["c", "d", "e", "f", "g", "h"]);
  });

  it("shows everything when the sequence is short", () => {
    expect(stripWindow(["a", "b"], "b")).toEqual(["a", "b"]);
  });
});
