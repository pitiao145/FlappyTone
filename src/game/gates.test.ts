import { DEFAULT_TUNING } from "./tuning.ts";
import { describe, expect, it } from "vitest";
import {
  applyCorridorWidth,
  applyPace,
  corridorChaoAt,
  corridorToleranceAt,
  GATE_DURATION_S,
  MAX_TIMING_WIDEN_FACTOR,
  makeGate,
  newDifficulty,
  nextTone,
  rampDifficulty,
  toleranceChao,
  type Difficulty,
  shapeForTone,
  type Tone,
} from "./gates.ts";

describe("corridorChaoAt", () => {
  it("T1 is flat, at the level she actually holds", () => {
    // 4.6, not a textbook 5 — read off the shipped reference clip.
    expect(corridorChaoAt(shapeForTone(1), 0)).toBeCloseTo(4.6);
    expect(corridorChaoAt(shapeForTone(1), 0.5)).toBeCloseTo(4.6);
    expect(corridorChaoAt(shapeForTone(1), 1)).toBeCloseTo(4.6);
  });

  it("T2 dips below its start before climbing", () => {
    expect(corridorChaoAt(shapeForTone(2), 0)).toBeCloseTo(3);
    expect(corridorChaoAt(shapeForTone(2), 0.3)).toBeCloseTo(1.85);
    expect(corridorChaoAt(shapeForTone(2), 1)).toBeCloseTo(5);
    // The dip is the point: a correct T2 must be *below* chao 3 early on.
    expect(corridorChaoAt(shapeForTone(2), 0.2)).toBeLessThan(3);
  });

  it("T3 falls, holds on the floor, then rises", () => {
    expect(corridorChaoAt(shapeForTone(3), 0)).toBeCloseTo(2.7);
    expect(corridorChaoAt(shapeForTone(3), 0.5)).toBeCloseTo(1.25);
    expect(corridorChaoAt(shapeForTone(3), 1)).toBeCloseTo(5);
    // The low plateau — time sitting on the floor, which the PRD's
    // two-segment polyline had no room for.
    expect(corridorChaoAt(shapeForTone(3), 0.55)).toBeLessThan(1.3);
    expect(corridorChaoAt(shapeForTone(3), 0.62)).toBeCloseTo(1.22);
  });

  it("T4 holds high, then falls off a cliff", () => {
    expect(corridorChaoAt(shapeForTone(4), 0)).toBeCloseTo(5);
    expect(corridorChaoAt(shapeForTone(4), 1)).toBeCloseTo(1.25);
    // Still at the top halfway through — this is what the linear ramp got
    // wrong, and why a native T4 could not fit the old corridor.
    expect(corridorChaoAt(shapeForTone(4), 0.5)).toBeCloseTo(5);
    expect(corridorChaoAt(shapeForTone(4), 0.62)).toBeCloseTo(5);
    expect(corridorChaoAt(shapeForTone(4), 0.9)).toBeCloseTo(1.25);
  });

  it("every contour completes before the gate ends, then holds", () => {
    // A speaker who finishes a natural rise early and sustains the final note
    // must still be inside the corridor. Without this tail she sat above a
    // corridor still climbing underneath her — 469ms and 512ms excursions on
    // otherwise-correct T2 attempts, 4 Aug 2026.
    for (const tone of [1, 2, 3, 4] as const) {
      const end = corridorChaoAt(shapeForTone(tone), 1);
      expect(corridorChaoAt(shapeForTone(tone), 0.9)).toBeCloseTo(end);
      expect(corridorChaoAt(shapeForTone(tone), 0.95)).toBeCloseTo(end);
    }
  });

  it("clamps t outside [0,1]", () => {
    expect(corridorChaoAt(shapeForTone(1), -0.5)).toBeCloseTo(4.6);
    expect(corridorChaoAt(shapeForTone(4), 1.5)).toBeCloseTo(1.25);
    expect(corridorChaoAt(shapeForTone(4), -1)).toBeCloseTo(5);
  });
});

describe("toleranceChao", () => {
  // Pure conversion: a base half-height in screen fractions to chao. Takes its
  // input literally rather than from DEFAULT_TUNING, because the formula is
  // what is under test, not the value currently shipped.
  it("converts base 0.12H to 0.8 chao for the level and falling tones", () => {
    expect(toleranceChao(1, 0.12)).toBeCloseTo(0.8);
    expect(toleranceChao(4, 0.12)).toBeCloseTo(0.8);
  });

  it("widens where the signal is least reliable, not where the tone is hardest", () => {
    // Both are clarity-collapse mitigations: T3 for creak (PRD §6), T2 for the
    // longest sustained slew, which shows up as the lowest voiced fraction.
    expect(toleranceChao(2, 0.12)).toBeCloseTo(0.8 * 1.15);
    expect(toleranceChao(3, 0.12)).toBeCloseTo(0.8 * 1.3);
  });
});

describe("newDifficulty", () => {
  it("exposes the PRD base values", () => {
    const d = newDifficulty();
    expect(d.scrollSpeed).toBeCloseTo(220);
    expect(d.toleranceH).toBeCloseTo(DEFAULT_TUNING.baseToleranceH);
    expect(d.restMs).toBeCloseTo(DEFAULT_TUNING.baseRestMs);
  });
});

describe("rampDifficulty", () => {
  const base: Difficulty = { scrollSpeed: 220, toleranceH: DEFAULT_TUNING.baseToleranceH, restMs: DEFAULT_TUNING.baseRestMs };

  it("leaves difficulty unchanged below 5 cleared", () => {
    expect(rampDifficulty(0)).toEqual(base);
    expect(rampDifficulty(4)).toEqual(base);
  });

  it("applies one ramp step at 5 cleared", () => {
    const d = rampDifficulty(5);
    expect(d.scrollSpeed).toBeCloseTo(220 * 1.08);
    expect(d.toleranceH).toBeCloseTo(DEFAULT_TUNING.baseToleranceH * 0.95);
    expect(d.restMs).toBeCloseTo(DEFAULT_TUNING.baseRestMs * 0.95);
  });

  it("caps scrollSpeed at 2.2x base and floors tolerance/rest at 100 cleared", () => {
    const d = rampDifficulty(100);
    expect(d.scrollSpeed).toBeCloseTo(484);
    expect(d.toleranceH).toBeCloseTo(0.07);
    expect(d.restMs).toBeCloseTo(600);
  });

  it("does not compound across repeated incremental calls", () => {
    const d1 = rampDifficulty(5);
    const d2 = rampDifficulty(10);
    expect(d1.scrollSpeed).toBeCloseTo(220 * Math.pow(1.08, 1));
    expect(d2.scrollSpeed).toBeCloseTo(220 * Math.pow(1.08, 2));
  });
});

describe("nextTone", () => {
  it("uniformly picks tones 1-4", () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 10000) / 10000;
    };
    const seen = new Set<Tone>();
    let prev: Tone[] = [];
    for (let i = 0; i < 200; i++) {
      const t = nextTone(prev, rand);
      seen.add(t);
      prev = [...prev, t].slice(-2);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4]));
  });

  it("never yields the same tone three times in a row over 200 draws", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 10000) / 10000;
    };
    let prev: Tone[] = [];
    const sequence: Tone[] = [];
    for (let i = 0; i < 200; i++) {
      const t = nextTone(prev, rand);
      sequence.push(t);
      prev = [...prev, t].slice(-2);
    }
    for (let i = 0; i < sequence.length - 2; i++) {
      expect(
        sequence[i] === sequence[i + 1] && sequence[i + 1] === sequence[i + 2],
      ).toBe(false);
    }
  });

  it("terminates on a constant rand instead of rerolling forever", () => {
    // A constant stub always proposes tone 1, which is exactly the forbidden
    // tone here. The reroll is bounded, so this must return rather than hang.
    const t = nextTone([1, 1], () => 0);
    expect([1, 2, 3, 4]).toContain(t);
    expect(t).not.toBe(1);
  });
});

describe("makeGate", () => {
  it("builds a gate from tone, xStart, and difficulty", () => {
    const d = newDifficulty();
    const g = makeGate(1, 500, d);
    expect(g.tone).toBe(1);
    expect(g.xStart).toBe(500);
    expect(g.widthPx).toBeCloseTo(220 * GATE_DURATION_S[1]);
    expect(g.tolChao).toBeCloseTo(toleranceChao(1, DEFAULT_TUNING.baseToleranceH));
  });

  it("gate width follows the tone's own measured duration", () => {
    const d = newDifficulty();
    // T3 runs longest and T4 shortest — PRD §14's open question, answered from
    // a native speaker's clips and then tuned in play.
    expect(makeGate(3, 0, d).widthPx).toBeGreaterThan(makeGate(4, 0, d).widthPx);
    for (const tone of [1, 2, 3, 4] as const) {
      expect(makeGate(tone, 0, d).widthPx / d.scrollSpeed).toBeCloseTo(
        GATE_DURATION_S[tone],
      );
    }
  });

  it("uses widened tolerance for T3", () => {
    const d = newDifficulty();
    const g = makeGate(3, 0, d);
    expect(g.tolChao).toBeCloseTo(
      toleranceChao(1, DEFAULT_TUNING.baseToleranceH) * 1.3,
    );
  });
});

describe("applyPace", () => {
  it("fast is the identity (PRD baseline)", () => {
    const d = newDifficulty();
    expect(applyPace(d, "fast")).toEqual(d);
  });

  it("normal slows scroll and stretches rest, leaving tolerance alone", () => {
    const d = applyPace(newDifficulty(), "normal");
    expect(d.scrollSpeed).toBeCloseTo(220 * 0.9);
    expect(d.restMs).toBeCloseTo(DEFAULT_TUNING.baseRestMs * 1.5);
    expect(d.toleranceH).toBeCloseTo(DEFAULT_TUNING.baseToleranceH);
  });

  it("relaxed slows further and doubles the rest interval", () => {
    const d = applyPace(newDifficulty(), "relaxed");
    expect(d.scrollSpeed).toBeCloseTo(220 * 0.75);
    expect(d.restMs).toBeCloseTo(DEFAULT_TUNING.baseRestMs * 2);
  });

  it("keeps each tone's gate duration intact — width scales with paced speed", () => {
    const d = applyPace(newDifficulty(), "relaxed");
    const g = makeGate(1, 0, d);
    expect(g.widthPx / d.scrollSpeed).toBeCloseTo(GATE_DURATION_S[1]);
  });
});

describe("applyCorridorWidth", () => {
  it("normal is the identity", () => {
    const d = newDifficulty();
    expect(applyCorridorWidth(d, "normal")).toEqual(d);
  });

  it("narrow tightens tolerance to 0.75x, leaving speed and rest alone", () => {
    const d = applyCorridorWidth(newDifficulty(), "narrow");
    expect(d.toleranceH).toBeCloseTo(DEFAULT_TUNING.baseToleranceH * 0.75);
    expect(d.scrollSpeed).toBeCloseTo(220);
    expect(d.restMs).toBeCloseTo(DEFAULT_TUNING.baseRestMs);
  });

  it("wide loosens tolerance to 1.4x", () => {
    const d = applyCorridorWidth(newDifficulty(), "wide");
    expect(d.toleranceH).toBeCloseTo(DEFAULT_TUNING.baseToleranceH * 1.4);
  });

  it("applied after the ramp, it scales the ramp floor proportionally", () => {
    const ramped = rampDifficulty(1000); // tolerance at the 0.07 floor
    const d = applyCorridorWidth(ramped, "wide");
    expect(d.toleranceH).toBeCloseTo(0.07 * 1.4);
  });
});

describe("corridorToleranceAt", () => {
  // Base tolerance for a default gate, in chao.
  const BASE = 0.8;

  it("leaves a flat corridor exactly as strict", () => {
    // T1 never moves, so no timing error can cost vertical room and there is
    // nothing to forgive. The game stays as honest about pitch as it was.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(corridorToleranceAt(shapeForTone(1), t, BASE)).toBeCloseTo(BASE, 10);
    }
  });

  it("never returns less than the base tolerance", () => {
    for (const tone of [1, 2, 3, 4] as const) {
      for (let i = 0; i <= 20; i++) {
        expect(corridorToleranceAt(shapeForTone(tone), i / 20, BASE)).toBeGreaterThanOrEqual(
          BASE - 1e-9,
        );
      }
    }
  });

  it("widens most where the corridor moves fastest", () => {
    // T4's cliff is at t≈0.63; its plateau at t≈0.3 is flat.
    const plateau = corridorToleranceAt(shapeForTone(4), 0.3, BASE);
    const cliff = corridorToleranceAt(shapeForTone(4), 0.63, BASE);
    expect(plateau).toBeCloseTo(BASE, 10);
    expect(cliff).toBeGreaterThan(plateau * 1.5);
  });

  it("caps the widening so a fast fall still has walls", () => {
    // The T4 cliff travels further within the slack window than the corridor
    // is wide; without the cap its wall would effectively vanish.
    for (let i = 0; i <= 40; i++) {
      expect(corridorToleranceAt(shapeForTone(4), i / 40, BASE)).toBeLessThanOrEqual(
        BASE * (1 + MAX_TIMING_WIDEN_FACTOR) + 1e-9,
      );
    }
  });

  it("keeps the tail open only while the move is still within reach", () => {
    // Both contours finish before t=1 and hold, but the slack window looks
    // *backwards* too — so whether the tail forgives depends on whether the
    // movement is still inside it.
    //
    // T2's rise ends at t=0.8 of a 1.07s gate, which is 214ms back from the
    // end — outside the 90ms window, so the tail is strict.
    expect(corridorToleranceAt(shapeForTone(2), 1, BASE)).toBeCloseTo(BASE, 10);
    // T4's cliff ends at t=0.9 of a 0.6s gate — only 60ms back, so a player
    // still falling as the gate closes is legitimately late, not wrong.
    expect(corridorToleranceAt(shapeForTone(4), 1, BASE)).toBeGreaterThan(BASE);
  });
});
