import { describe, expect, it } from "vitest";
import { gameHref, pairKey, parsePairKey, weakPair } from "./cta.ts";
import type { Answer } from "./toneTest.ts";

const a = (tone: 1 | 2 | 3 | 4, picked: 1 | 2 | 3 | 4): Answer => ({ tone, picked });

describe("tone-test CTA", () => {
  it("names the most confused pair, either direction, lower tone first", () => {
    expect(weakPair([a(3, 2), a(2, 3), a(1, 4), a(1, 1)])).toEqual([2, 3]);
    expect(weakPair([a(4, 1)])).toEqual([1, 4]);
  });
  it("is null on a perfect round", () => {
    expect(weakPair([a(1, 1), a(2, 2)])).toBeNull();
    expect(pairKey(null)).toBe("none");
  });
  it("breaks a tie by the lower pair", () => {
    expect(weakPair([a(4, 3), a(2, 1)])).toEqual([1, 2]);
  });
  it("links to the game with the source page and the pair", () => {
    expect(gameHref("/tools/tone-test", [2, 3])).toBe("/app?src=/tools/tone-test&weak=2-3");
    expect(gameHref("/tools/tone-test", null)).toBe("/app?src=/tools/tone-test");
  });
  it("parses the pair back, rejecting junk", () => {
    expect(parsePairKey("2-3")).toBe("2-3");
    expect(parsePairKey("3-2")).toBeNull();
    expect(parsePairKey("2-2")).toBeNull();
    expect(parsePairKey("5-1")).toBeNull();
    expect(parsePairKey(null)).toBeNull();
  });
});
