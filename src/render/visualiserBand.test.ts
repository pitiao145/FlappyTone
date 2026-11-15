/**
 * Brief 47: the Visualiser's target band is the game's corridor, not a
 * look-alike. Its half-width must equal `corridorToleranceAt` with the
 * tolerance a run's first gate gets.
 */
import { describe, expect, it } from "vitest";
import {
  applyCorridorWidth,
  corridorToleranceAt,
  makeGate,
  newDifficulty,
  shapeForTone,
  type Tone,
} from "../game/gates.ts";
import { targetBand, visualiserTolerance } from "./visualiser.ts";

const TONES: Tone[] = [1, 3, 4];

describe("Visualiser target band (brief 47)", () => {
  for (const tone of TONES) {
    it(`tone ${tone}: half-width at t = 0, 0.5, 1 equals corridorToleranceAt`, () => {
      const shape = shapeForTone(tone);
      const { tolChao, widenScale } = visualiserTolerance([tone]);
      // Same tolerance the game's first gate gets.
      expect(tolChao).toBeCloseTo(makeGate(tone, 0, newDifficulty()).tolChao, 12);
      const band = targetBand(shape, tolChao, widenScale);
      for (const t of [0, 0.5, 1]) {
        const s = band.find((b) => Math.abs(b.t - t) < 1e-9);
        expect(s, `sample at t=${t}`).toBeDefined();
        expect(s!.half).toBeCloseTo(corridorToleranceAt(shape, t, tolChao, widenScale), 12);
      }
    });
  }

  it("follows the player's corridor width like a run does", () => {
    for (const width of ["extraNarrow", "narrow", "normal", "wide"] as const) {
      const d = applyCorridorWidth(newDifficulty(), width);
      const gate = makeGate(3, 0, d);
      const { tolChao, widenScale } = visualiserTolerance([3], width);
      expect(tolChao).toBeCloseTo(gate.tolChao, 12);
      expect(widenScale).toBe(gate.widenScale);
    }
  });

  it("is wider on the slope than the flat base where the game widens", () => {
    const shape = shapeForTone(4);
    const { tolChao } = visualiserTolerance([4]);
    const band = targetBand(shape, tolChao);
    expect(Math.max(...band.map((b) => b.half))).toBeGreaterThan(tolChao);
  });
});
