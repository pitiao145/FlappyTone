import { describe, expect, it } from "vitest";
import { AVERAGED_PAIR_SHAPE, AVERAGED_TONE_SHAPE } from "../../game/toneAverages.ts";
import { modeFor, refFor, TONE_REFS } from "./toneRefs.ts";

describe("tone visualizer references", () => {
  it("real speech is the natural average, textbook the slow, clear average", () => {
    expect(refFor("3").real.map(([, c]) => c)).toEqual(AVERAGED_TONE_SHAPE.natural[3]);
    expect(refFor("4").textbook.map(([, c]) => c)).toEqual(AVERAGED_TONE_SHAPE.textbook[4]);
    // 3 + 3 is said as 2 + 3 (third-tone sandhi), in both versions.
    expect(refFor("3-3").real.map(([, c]) => c)).toEqual(AVERAGED_PAIR_SHAPE.natural["2-3"]);
    expect(refFor("3-3").textbook.map(([, c]) => c)).toEqual(AVERAGED_PAIR_SHAPE.textbook["2-3"]);
    expect(refFor("4-2").real.map(([, c]) => c)).toEqual(AVERAGED_PAIR_SHAPE.natural["4-2"]);
  });

  it("offers the four tones and all 16 pairs", () => {
    expect(TONE_REFS.filter((r) => r.tones.length === 1)).toHaveLength(4);
    expect(TONE_REFS.filter((r) => r.tones.length === 2)).toHaveLength(16);
  });

  it("every line runs 0..1 in time, inside chao 1..5", () => {
    for (const r of TONE_REFS) {
      for (const line of [r.real, r.textbook]) {
        expect(line[0][0]).toBe(0);
        expect(line.at(-1)![0]).toBeCloseTo(1, 9);
        for (let i = 1; i < line.length; i++) expect(line[i][0]).toBeGreaterThan(line[i - 1][0]);
        for (const [, c] of line) expect(c >= 1 && c <= 5).toBe(true);
      }
      expect(r.durationS).toBeGreaterThan(0.3);
    }
  });

  it("?tone= and ?mode= fall back to Tone 3 / real speech", () => {
    expect(refFor("3-4").id).toBe("3-4");
    expect(refFor("zzz").id).toBe("3");
    expect(refFor(null).id).toBe("3");
    expect(modeFor("textbook")).toBe("textbook");
    expect(modeFor("x")).toBe("real");
  });
});
