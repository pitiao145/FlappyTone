import { describe, expect, it } from "vitest";
import { hasSimplified } from "../../dev/simplified.ts";
import { PROFILES } from "./profiles.ts";
import { TEST_WORDS } from "./toneTest.ts";

describe("Toneder profiles", () => {
  it("has exactly one profile per test word", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(TEST_WORDS.map((w) => w.id).sort());
  });
  it("bios are short, plain English, never name the tone", () => {
    for (const [id, p] of Object.entries(PROFILES)) {
      expect(p.bio.length, id).toBeLessThanOrEqual(60);
      expect(hasSimplified(p.bio), id).toBe(false);
      expect(/tone [1-4]/i.test(p.bio), id).toBe(false);
    }
  });
});
