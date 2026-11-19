import { describe, expect, it } from "vitest";
import {
  gridEstimate,
  gridLearned,
  learnGridFromGate,
  newGridLearnState,
  startGridRun,
  type GridLearnParams,
  type LearnGate,
} from "./calibration.ts";

const P: GridLearnParams = {
  rate: 0.1,
  maxStepPerRun: 1.5,
  halfMin: 3,
  halfMax: 10,
  minFrames: 20,
  memoryGates: 40,
  creakSt: 10,
  topPct: 90,
  bottomPct: 10,
  bandEdgeSt: 0.25,
  targetEdgeChao: 0.05,
  anchorTopChao: 4,
  anchorBottomChao: 1.5,
};

/** A gate whose frames sit exactly on a flat target at `chao`, for a voice with this ruler. */
function onTarget(tone: 1 | 2 | 3 | 4 | null, chao: number, ruler: { mid: number; up: number; down: number }, n = 30): LearnGate {
  const st = ruler.mid + ((chao - 3) / 2) * (chao >= 3 ? ruler.up : ruler.down);
  return { semitones: Array(n).fill(st), targetChao: Array(n).fill(chao), tone, heard: true };
}

const TRUE = { mid: 0, up: 6, down: 7 };

describe("learnGridFromGate (brief 44)", () => {
  it("an unheard gate teaches nothing (hard rule 8)", () => {
    const s = newGridLearnState({ midSt: -2, up: 6, down: 7 });
    const g = { ...onTarget(2, 3.5, TRUE), heard: false };
    expect(learnGridFromGate(s, g, P)).toBe(s);
  });

  it("a heard gate that hit a wall still counts as voice data", () => {
    const s = newGridLearnState({ midSt: -2, up: 6, down: 7 });
    const next = learnGridFromGate(s, onTarget(2, 3.5, TRUE), P);
    expect(next.gates).toBe(1);
    expect(next.grid.midSt).toBeGreaterThan(-2);
  });

  it("moves the middle toward where the target says it is, a share per gate", () => {
    let s = newGridLearnState({ midSt: -2, up: 6, down: 7 });
    s = learnGridFromGate(s, onTarget(4, 4, TRUE), P);
    // vote = frame - target offset = 0 (the true middle); one step of 10% of the 2 st gap.
    expect(s.grid.midSt).toBeCloseTo(-1.8, 5);
  });

  it("never moves one value more than the per-run step, and the budget refills on a new run", () => {
    let s = newGridLearnState({ midSt: -5, up: 6, down: 7 });
    for (let i = 0; i < 100; i++) s = learnGridFromGate(s, onTarget(2, 3.5, TRUE), { ...P, rate: 0.9 });
    expect(s.grid.midSt).toBeCloseTo(-3.5, 5);
    s = startGridRun(s);
    s = learnGridFromGate(s, onTarget(2, 3.5, TRUE), { ...P, rate: 0.9 });
    expect(s.grid.midSt).toBeCloseTo(-2, 5);
  });

  it("learns top from first tones and bottom from third tones, and holds them without data", () => {
    let s = newGridLearnState({ midSt: 0, up: 4, down: 5 });
    for (let i = 0; i < 10; i++) s = learnGridFromGate(s, onTarget(2, 3.5, TRUE), P);
    // No first tone heard yet: the middle moved and carried the lines with it (halves kept).
    expect(s.grid.midSt).not.toBe(0);
    expect(s.grid.up).toBeCloseTo(4, 9);
    expect(s.grid.down).toBeCloseTo(5, 9);
    for (let r = 0; r < 10; r++) {
      s = startGridRun(s);
      for (let i = 0; i < 10; i++) {
        s = learnGridFromGate(s, onTarget(1, 4.9, TRUE), P);
        s = learnGridFromGate(s, onTarget(3, 1.1, TRUE), P);
      }
    }
    expect(gridLearned(s, P.minFrames)).toBe(true);
    // first-tone frames at chao 4.9 → 5.7 st; third-tone frames at chao 1.1 → -6.65 st
    const top = s.grid.midSt + s.grid.up, bottom = s.grid.midSt - s.grid.down;
    expect(Math.abs(top - 5.7)).toBeLessThan(0.3);
    expect(Math.abs(bottom + 6.65)).toBeLessThan(0.3);
    expect(Math.abs(s.grid.midSt)).toBeLessThan(0.5);
  });

  it("keeps each half inside its hard limits", () => {
    let s = newGridLearnState({ midSt: 0, up: 6, down: 7 });
    for (let r = 0; r < 20; r++) {
      s = startGridRun(s);
      for (let i = 0; i < 10; i++) s = learnGridFromGate(s, { semitones: Array(30).fill(0.5), targetChao: Array(30).fill(4.5), tone: 1, heard: true }, P);
    }
    expect(s.grid.up).toBe(P.halfMin);
  });

  it("leaves out creak, band-edge frames and clamped targets", () => {
    const s = newGridLearnState({ midSt: 0, up: 6, down: 7 });
    const creak = learnGridFromGate(s, { semitones: Array(30).fill(-11), tone: 3, heard: true }, P);
    expect(creak).toBe(s);
    const edge = learnGridFromGate(s, { semitones: Array(30).fill(5), tone: 1, heard: true, bandHighSt: 5.1 }, P);
    expect(edge).toBe(s);
    const clamped = learnGridFromGate(s, { semitones: Array(30).fill(6), targetChao: Array(30).fill(5), tone: 4, heard: true }, P);
    expect(clamped.all.frames).toBe(0);
  });

  it("is deterministic", () => {
    const run = () => {
      let s = newGridLearnState({ midSt: 1.3, up: 4.2, down: 5.1 });
      for (let i = 0; i < 50; i++) s = learnGridFromGate(s, onTarget(((i % 4) + 1) as 1 | 2 | 3 | 4, 1.5 + (i % 7) * 0.4, TRUE), P);
      return s;
    };
    expect(run()).toEqual(run());
    expect(gridEstimate(run(), P).midSt).not.toBeNull();
  });
});

import { computeMiddleHz } from "./calibration.ts";
describe("computeMiddleHz (brief 44 step 2)", () => {
  it("is the median with creak left out, null when sparse", () => {
    expect(computeMiddleHz([200, 210])).toBeNull();
    const f = [...Array(20).fill(200), ...Array(20).fill(220), ...Array(15).fill(90)];
    expect(computeMiddleHz(f)).toBe(210);
  });
});

describe("44 review fixes", () => {
  it("fix 1: pairs only (middle votes, no anchors) never run away; halves stay put", () => {
    // Voice 2 st lower than the grid, two-syllable gates only: targets in the middle band.
    let s = newGridLearnState({ midSt: 0, up: 6, down: 7 });
    const lower = { mid: -2, up: 6, down: 7 };
    for (let r = 0; r < 40; r++) {
      s = startGridRun(s);
      for (let i = 0; i < 10; i++) s = learnGridFromGate(s, onTarget(null, 2 + (i % 5) * 0.5, lower), P);
    }
    expect(Math.abs(s.grid.midSt + 2)).toBeLessThan(0.3);
    expect(s.grid.up).toBeCloseTo(6, 9);
    expect(s.grid.down).toBeCloseTo(7, 9);
  });

  it("fix 2: a first tone whose target does not reach the top line does not feed the top", () => {
    const s = newGridLearnState({ midSt: 0, up: 6, down: 7 });
    const natural = learnGridFromGate(s, onTarget(1, 3.4, TRUE), P);
    expect(natural.t1.frames).toBe(0);
    const textbook = learnGridFromGate(s, onTarget(1, 4.5, TRUE), P);
    expect(textbook.t1.frames).toBe(30);
    const highT3 = learnGridFromGate(s, onTarget(3, 2, TRUE), P);
    expect(highT3.t3.frames).toBe(0);
  });
});

describe("brief 50: safer and faster learning", () => {
  it("a third tone that hit a wall teaches the bottom line nothing (decision 6)", () => {
    const s = newGridLearnState({ midSt: 0, up: 6, down: 4 });
    const low = onTarget(3, 1, TRUE); // a real low third tone, 7 st under the middle
    const hit = learnGridFromGate(s, { ...low, wallHit: true }, P);
    expect(hit.t3.frames).toBe(0);
    expect(hit.grid.down).toBe(4);
    const clean = learnGridFromGate(s, low, P);
    expect(clean.t3.frames).toBe(30);
  });

  it("a wall hit still feeds the middle and the top", () => {
    const s = newGridLearnState({ midSt: -2, up: 6, down: 7 });
    const mid = learnGridFromGate(s, { ...onTarget(2, 3.5, TRUE), wallHit: true }, P);
    expect(mid.grid.midSt).toBeGreaterThan(-2);
    const top = learnGridFromGate(s, { ...onTarget(1, 5, TRUE), wallHit: true }, P);
    expect(top.t1.frames).toBe(30);
  });

  it("single-tone play (middleVote false) leaves the middle alone but feeds its own line", () => {
    let s = newGridLearnState({ midSt: 0, up: 3, down: 4 });
    // A held first tone at 1 st over the middle, target at chao 4.5: the vote loop of test 8.
    const g: LearnGate = { semitones: Array(30).fill(1), targetChao: Array(30).fill(4.5), tone: 1, heard: true };
    let looped = s;
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) { s = startGridRun(s); looped = startGridRun(looped); }
      s = learnGridFromGate(s, { ...g, middleVote: false }, P);
      looped = learnGridFromGate(looped, g, P);
    }
    expect(s.grid.midSt).toBe(0);
    expect(s.all.frames).toBe(0);
    expect(s.t1.frames).toBe(1800);
    // Today's rule on the same play: the middle sinks under the voice.
    expect(looped.grid.midSt).toBeLessThan(-1);
  });

  it("quick start: the first gates close the start share of the gap, uncapped until learned", () => {
    const far = newGridLearnState({ midSt: -5, up: 6, down: 7 });
    const qs = { ...P, startRate: 0.7, startGates: 3, uncappedUntilLearned: true };
    const one = learnGridFromGate(far, onTarget(2, 3.5, TRUE), qs);
    expect(one.grid.midSt).toBeCloseTo(-5 + 0.7 * 5, 5); // 3.5 st in one gate: over the 1.5 run cap
    let s = far;
    for (let i = 0; i < 4; i++) s = learnGridFromGate(s, onTarget(2, 3.5, TRUE), qs);
    const before = s.grid.midSt;
    const fourthGap = 0 - before;
    const fifth = learnGridFromGate(s, onTarget(2, 3.5, TRUE), qs);
    expect(fifth.grid.midSt - before).toBeCloseTo(0.1 * fourthGap, 5); // back to the normal rate
  });

  it("without the start fields nothing changes (calibrated players)", () => {
    const far = newGridLearnState({ midSt: -5, up: 6, down: 7 });
    expect(learnGridFromGate(far, onTarget(2, 3.5, TRUE), P).grid.midSt).toBeCloseTo(-4.5, 5);
  });
});
