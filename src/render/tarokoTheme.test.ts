import { describe, expect, it } from "vitest";
import { FAR_HARMONICS, NEAR_HARMONICS, ridgeY } from "./tarokoTheme.ts";

describe("taroko backdrop", () => {
  it("ridges are periodic in their tile, so the joins are seamless", () => {
    for (const [h, lo, hi] of [
      [FAR_HARMONICS, 0.57, 0.68],
      [NEAR_HARMONICS, 0.69, 0.75],
    ] as const) {
      expect(ridgeY(0, 840, lo, hi, h)).toBeCloseTo(ridgeY(840, 840, lo, hi, h), 9);
    }
  });

  it("ridges stay inside their band", () => {
    for (let x = 0; x <= 840; x += 5) {
      const y = ridgeY(x, 840, 0.57, 0.68, FAR_HARMONICS);
      expect(y).toBeGreaterThanOrEqual(0.57);
      expect(y).toBeLessThanOrEqual(0.68);
    }
  });
});
