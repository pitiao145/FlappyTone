/**
 * The Simplified screen, checked in both directions.
 *
 * A screen that flags nothing is useless; a screen that flags a legitimate
 * Traditional character is worse, because it refuses a word list that is
 * correct. The second direction is pinned against the 120 words actually
 * shipped, which is the only real corpus of Traditional hanzi in this repo.
 */

import { describe, expect, it } from "vitest";

import { hasSimplified, simplifiedChars, simplifiedIn } from "./simplified.ts";
import { WORDS } from "../record/wordlist.ts";

describe("hasSimplified", () => {
  it("flags a Simplified character", () => {
    expect(hasSimplified("妈")).toBe(true);
    expect(hasSimplified("马")).toBe(true);
    expect(hasSimplified("骂")).toBe(true);
  });

  it("passes the Traditional form of the same word", () => {
    expect(hasSimplified("媽")).toBe(false);
    expect(hasSimplified("馬")).toBe(false);
    expect(hasSimplified("罵")).toBe(false);
  });

  it("flags a mixed string", () => {
    // One Simplified character in an otherwise Traditional word is exactly the
    // drift this exists to catch — a list typed half from one source.
    expect(hasSimplified("學说")).toBe(true);
  });

  it("passes a string with no hanzi at all", () => {
    expect(hasSimplified("")).toBe(false);
    expect(hasSimplified("ma1")).toBe(false);
  });

  it("names which characters tripped it", () => {
    expect(simplifiedIn("说话")).toEqual(["说", "话"]);
    expect(simplifiedIn("說話")).toEqual([]);
    // Deduplicated: a repeated character is one complaint, not two.
    expect(simplifiedIn("说说")).toEqual(["说"]);
  });
});

describe("the screened set", () => {
  it("clears every shipped Traditional word", () => {
    // The over-broad-list check. A character that is BOTH a Traditional
    // character and the simplification of another (后, 里, 只, 干 …) must
    // never be in the set; if one slips in, one of these 120 words trips.
    for (const word of WORDS) {
      expect(simplifiedIn(word.hanzi), `${word.id} ${word.hanzi}`).toEqual([]);
    }
  });

  it("is big enough to be worth having", () => {
    expect(simplifiedChars().size).toBeGreaterThan(200);
  });

  it("holds only single characters", () => {
    for (const char of simplifiedChars()) expect([...char].length).toBe(1);
  });
});
