import { afterEach, describe, expect, it } from "vitest";
import { resetTierLimits } from "../game/tiers.ts";
import { countSwipe, localDay, swipesLeft, swipesUsed } from "./dailySwipes.ts";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

afterEach(resetTierLimits);

describe("TONEder daily swipe cap", () => {
  it("is 30 for a guest, 50 for free, unlimited for Pro", () => {
    expect(swipesLeft("guest", 0)).toBe(30);
    expect(swipesLeft("free", 0)).toBe(50);
    expect(swipesLeft("pro", 0)).toBe(Infinity);
    expect(swipesLeft("guest", 30)).toBe(0);
    expect(swipesLeft("guest", 45)).toBe(0);
    expect(swipesLeft("free", 30)).toBe(20);
    expect(swipesLeft("pro", 10_000)).toBe(Infinity);
  });

  it("counts per day and resets on a new day", () => {
    const s = mem();
    for (let i = 0; i < 30; i++) countSwipe("2026-10-23", s);
    expect(swipesUsed("2026-10-23", s)).toBe(30);
    expect(swipesLeft("guest", swipesUsed("2026-10-23", s))).toBe(0);
    expect(swipesUsed("2026-10-24", s)).toBe(0);
    expect(countSwipe("2026-10-24", s)).toBe(1);
  });

  it("reads blocked or junk storage as 0 used", () => {
    expect(swipesUsed("2026-10-23", null)).toBe(0);
    const s = mem();
    s.setItem("flappytone.toneder.swipes.v1", "{bad");
    expect(swipesUsed("2026-10-23", s)).toBe(0);
    const throwing = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(swipesUsed("2026-10-23", throwing)).toBe(0);
    expect(countSwipe("2026-10-23", throwing)).toBe(1);
  });

  it("uses the local date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
