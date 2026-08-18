import { describe, expect, it } from "vitest";
import { recalibrationSuggestion } from "./recalibration.ts";

const CURRENT = { rangeSemitones: 5, rangeDownSemitones: 4 };

describe("recalibrationSuggestion", () => {
  it("returns null when both halves are close to current", () => {
    expect(
      recalibrationSuggestion(CURRENT, { up: 5.2, down: 4.1 }),
    ).toBeNull();
  });

  it("suggests when up is substantially higher", () => {
    expect(
      recalibrationSuggestion(CURRENT, { up: 8, down: 4 }),
    ).toEqual({ up: 8, down: 4 });
  });

  it("suggests when down is substantially higher", () => {
    expect(
      recalibrationSuggestion(CURRENT, { up: 5, down: 7 }),
    ).toEqual({ up: 5, down: 7 });
  });

  it("suggests when both halves are substantially off", () => {
    expect(
      recalibrationSuggestion(CURRENT, { up: 9, down: 8 }),
    ).toEqual({ up: 9, down: 8 });
  });

  it("does not suggest when relative delta clears but absolute delta is under a semitone", () => {
    // down=2 case: 30% of 2 is 0.6st, under MIN_ABS_DELTA_ST (1.0).
    const small = { rangeSemitones: 5, rangeDownSemitones: 2 };
    expect(
      recalibrationSuggestion(small, { up: 5, down: 2.7 }),
    ).toBeNull();
  });

  it("does not suggest when absolute delta clears but relative delta is under 30%", () => {
    // up=20 case: 1.2st absolute delta is only 6% relative.
    const big = { rangeSemitones: 20, rangeDownSemitones: 4 };
    expect(
      recalibrationSuggestion(big, { up: 21.2, down: 4 }),
    ).toBeNull();
  });
});
