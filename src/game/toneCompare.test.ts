import { describe, expect, it } from "vitest";
import { closerPct, compareCaption, mockWeekLines, shapeDistance } from "./toneCompare.ts";

describe("weekly compare (brief 55)", () => {
  const jane = [3, 3, 3, 3];
  it("distance is the mean gap to Jane's line", () => {
    expect(shapeDistance([4, 4, 2, 2], jane)).toBe(1);
    expect(shapeDistance(null, jane)).toBeNull();
  });
  it("caption: closer, about the same, further, no data", () => {
    expect(closerPct(0.82, 1)).toBe(18);
    expect(compareCaption("last week", 0.82, 1)).toBe("18% closer to Jane than last week");
    expect(compareCaption("last week", 0.98, 1)).toBe("About as close to Jane as last week");
    expect(compareCaption("last week", 1.2, 1)).toMatch(/^A little further/);
    expect(compareCaption("last week", null, 1)).toMatch(/^No attempts this week/);
    expect(compareCaption("last week", 1, null)).toBe("Your shape this week, over Jane's");
  });
  it("the mock-up reads as an improvement", () => {
    const j = Array.from({ length: 61 }, () => 3);
    const m = mockWeekLines(j, "1");
    expect(closerPct(shapeDistance(m.thisWeek, j), shapeDistance(m.lastWeek, j))).toBeGreaterThan(5);
  });
});
