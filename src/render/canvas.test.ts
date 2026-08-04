import { describe, expect, it } from "vitest";
import { MAX_DPR, backingSize } from "./canvas.ts";

describe("backingSize", () => {
  it("leaves a non-retina canvas alone", () => {
    expect(backingSize(420, 747, 1)).toEqual({ width: 420, height: 747, dpr: 1 });
  });

  it("scales the backing store to the device's pixel density", () => {
    // Without this the 420px canvas is upscaled by the browser and every line,
    // label and trail dot renders soft on the phones this game targets.
    expect(backingSize(420, 747, 3)).toEqual({ width: 1260, height: 2241, dpr: 3 });
  });

  it("caps absurd densities so fill cost stays bounded", () => {
    const r = backingSize(420, 747, 4);
    expect(r.dpr).toBe(MAX_DPR);
    expect(r.width).toBe(420 * MAX_DPR);
  });

  it("returns whole pixels", () => {
    const r = backingSize(411, 731, 2.625);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });

  it("treats a missing or nonsense ratio as 1", () => {
    expect(backingSize(420, 747, 0).dpr).toBe(1);
    expect(backingSize(420, 747, Number.NaN).dpr).toBe(1);
  });
});
