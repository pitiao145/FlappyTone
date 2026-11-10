import { describe, expect, it } from "vitest";
import { speakerFloorHz } from "./math.ts";

describe("speakerFloorHz (brief 42)", () => {
  it("0.6 × the centre, kept within 55–70 Hz", () => {
    expect(speakerFloorHz(181.3)).toBe(70); // Jane
    expect(speakerFloorHz(129)).toBe(70); // Pierre's calibration (77.4 → 70)
    expect(speakerFloorHz(108.78)).toBeCloseTo(65.27, 2); // deep stand-in 0.6
    expect(speakerFloorHz(90.65)).toBe(55); // deep stand-in 0.5 (54.4 → 55)
  });
  it("no calibrated centre → the high limit", () => {
    expect(speakerFloorHz(null)).toBe(70);
    expect(speakerFloorHz(undefined, 50, 80)).toBe(80);
  });
  it("factor is a parameter", () => {
    expect(speakerFloorHz(120, 55, 70, 0.5)).toBe(60);
  });
});
