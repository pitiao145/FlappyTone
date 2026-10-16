import { describe, expect, it } from "vitest";
import { CLOUD_BANDS, cloudCycles, cloudWaveY, massifY } from "./alishanTheme.ts";

describe("alishan backdrop", () => {
  const tileW = 840;

  it("cloud bands are periodic in their tile, so the joins are seamless", () => {
    for (const b of CLOUD_BANDS) {
      const c = cloudCycles(tileW, b.wave);
      expect(cloudWaveY(0, tileW, 500, b.amp, c, b.phase)).toBeCloseTo(
        cloudWaveY(tileW, tileW, 500, b.amp, c, b.phase),
        9,
      );
    }
  });

  it("cloud bands stay within their amplitude", () => {
    for (const b of CLOUD_BANDS) {
      const c = cloudCycles(tileW, b.wave);
      for (let x = 0; x <= tileW; x += 3) {
        const y = cloudWaveY(x, tileW, 500, b.amp, c, b.phase);
        expect(Math.abs(y - 500)).toBeLessThanOrEqual(b.amp + 1e-9);
      }
    }
  });

  it("the range is periodic and its massif peaks once, in the middle", () => {
    for (const near of [false, true]) {
      expect(massifY(0, tileW, near)).toBeCloseTo(massifY(tileW, tileW, near), 9);
    }
    let best = 0;
    for (let x = 0; x <= tileW; x += 2) if (massifY(x, tileW, false) < massifY(best, tileW, false)) best = x;
    expect(Math.abs(best - tileW / 2)).toBeLessThan(tileW * 0.1);
    expect(massifY(best, tileW, false)).toBeGreaterThanOrEqual(0.555);
  });
});
