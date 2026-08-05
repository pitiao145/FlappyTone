import { beforeEach, expect, test } from "vitest";
import { DEFAULT_TUNING, resetTuning, setTuning, tuning } from "./tuning.ts";
import { corridorToleranceAt, rampDifficulty, type Tone } from "./gates.ts";

beforeEach(() => resetTuning());

test("defaults match the shipped constants", () => {
  expect(tuning().collisionSustainMs).toBe(120);
  expect(tuning().gateDurationS[4]).toBe(0.6);
  expect(tuning().baseScrollSpeed).toBe(220);
});

test("setTuning patches one field and leaves the rest", () => {
  setTuning({ collisionSustainMs: 160 });
  expect(tuning().collisionSustainMs).toBe(160);
  expect(tuning().baseRestMs).toBe(DEFAULT_TUNING.baseRestMs);
});

test("gate durations patch per tone without dropping the others", () => {
  setTuning({ gateDurationS: { 1: 0.7 } as unknown as Record<Tone, number> });
  expect(tuning().gateDurationS[1]).toBe(0.7);
  expect(tuning().gateDurationS[3]).toBe(DEFAULT_TUNING.gateDurationS[3]);
});

test("resetTuning restores defaults", () => {
  setTuning({ baseRestMs: 1400 });
  resetTuning();
  expect(tuning()).toEqual(DEFAULT_TUNING);
});

test("gates read tuning live — widening tracks timingSlackS", () => {
  const base = corridorToleranceAt(4, 0.75, 0.8);
  setTuning({ timingSlackS: 0 });
  expect(corridorToleranceAt(4, 0.75, 0.8)).toBeLessThan(base);
});

test("the difficulty ramp reads tuning live", () => {
  setTuning({ baseScrollSpeed: 100 });
  expect(rampDifficulty(0).scrollSpeed).toBe(100);
});
