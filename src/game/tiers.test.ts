import { describe, expect, it, afterEach } from "vitest";

import { DEFAULT_TIER_LIMITS, levelsFor, resetTierLimits, setTierLimits, tierLimits } from "./tiers.ts";

afterEach(() => resetTierLimits());

describe("tierLimits accessor", () => {
  it("returns the frozen default until patched", () => {
    expect(tierLimits()).toEqual(DEFAULT_TIER_LIMITS);
  });

  it("setTierLimits patches one tier without disturbing the others", () => {
    setTierLimits("free", { runsPerDay: 20 });
    expect(tierLimits().free.runsPerDay).toBe(20);
    expect(tierLimits().guest.runsPerDay).toBe(DEFAULT_TIER_LIMITS.guest.runsPerDay);
    expect(tierLimits().pro.runsPerDay).toBe(DEFAULT_TIER_LIMITS.pro.runsPerDay);
  });

  it("setTierLimits merges beginner/intermediate rather than replacing them wholesale", () => {
    setTierLimits("free", { beginner: { levels: [1], allowMix: true } });
    expect(tierLimits().free.beginner).toEqual({ levels: [1], allowMix: true });
    // intermediate untouched
    expect(tierLimits().free.intermediate).toEqual(DEFAULT_TIER_LIMITS.free.intermediate);
  });

  it("resetTierLimits restores the frozen default", () => {
    setTierLimits("pro", { customization: false });
    resetTierLimits();
    expect(tierLimits()).toEqual(DEFAULT_TIER_LIMITS);
  });

  it("never mutates DEFAULT_TIER_LIMITS itself", () => {
    setTierLimits("guest", { runsPerDay: 999 });
    expect(DEFAULT_TIER_LIMITS.guest.runsPerDay).toBe(3);
  });
});

describe("the confirmed access table (docs/Tiers.csv brainstorm)", () => {
  it("guest has no level choice — sampler only, both proficiencies", () => {
    expect(levelsFor("guest", "beginner")).toBeNull();
    expect(levelsFor("guest", "intermediate")).toBeNull();
  });

  it("free: TOCFL 1/2/Mix for beginner, TOCFL 1 only (no Mix) for intermediate", () => {
    expect(tierLimits().free.beginner).toEqual({ levels: [1, 2], allowMix: true });
    expect(tierLimits().free.intermediate).toEqual({ levels: [1], allowMix: false });
  });

  it("pro: TOCFL 1/2/3/Mix for both proficiencies", () => {
    expect(tierLimits().pro.beginner).toEqual({ levels: [1, 2, 3], allowMix: true });
    expect(tierLimits().pro.intermediate).toEqual({ levels: [1, 2, 3], allowMix: true });
  });

  it("free caps tone-pairs at 5 words per combo; guest has no access; pro is unlimited", () => {
    expect(tierLimits().free.pairWordsPerCombo).toBe(5);
    expect(tierLimits().guest.pairWordsPerCombo).toBe(0);
    expect(tierLimits().pro.pairWordsPerCombo).toBe(Infinity);
  });
});
