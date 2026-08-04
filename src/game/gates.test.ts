import { describe, expect, it } from "vitest";
import {
  applyCorridorWidth,
  applyPace,
  corridorChaoAt,
  GATE_DURATION_S,
  makeGate,
  newDifficulty,
  nextTone,
  rampDifficulty,
  toleranceChao,
  type Difficulty,
  type Tone,
} from "./gates.ts";

describe("corridorChaoAt", () => {
  it("T1 is flat at chao 5", () => {
    expect(corridorChaoAt(1, 0)).toBeCloseTo(5);
    expect(corridorChaoAt(1, 0.5)).toBeCloseTo(5);
    expect(corridorChaoAt(1, 1)).toBeCloseTo(5);
  });

  it("T2 dips below its start before climbing", () => {
    expect(corridorChaoAt(2, 0)).toBeCloseTo(3);
    expect(corridorChaoAt(2, 0.2)).toBeCloseTo(2.2);
    expect(corridorChaoAt(2, 1)).toBeCloseTo(5);
    // The dip is the point: a correct T2 must be *below* chao 3 early on.
    expect(corridorChaoAt(2, 0.15)).toBeLessThan(3);
    expect(corridorChaoAt(2, 0.5)).toBeCloseTo(3.7273);
  });

  it("T3 falls, holds on the floor, then rises", () => {
    expect(corridorChaoAt(3, 0)).toBeCloseTo(3);
    expect(corridorChaoAt(3, 0.38)).toBeCloseTo(1.2);
    expect(corridorChaoAt(3, 1)).toBeCloseTo(5);
    expect(corridorChaoAt(3, 0.2)).toBeCloseTo(2.0526);
    // The low plateau — time spent sitting on the floor, which the PRD's
    // two-segment polyline had no room for.
    expect(corridorChaoAt(3, 0.5)).toBeCloseTo(1.2);
    expect(corridorChaoAt(3, 0.6)).toBeCloseTo(1.2);
  });

  it("T4 holds high, then falls off a cliff", () => {
    expect(corridorChaoAt(4, 0)).toBeCloseTo(5);
    expect(corridorChaoAt(4, 1)).toBeCloseTo(1);
    // Still at the top halfway through — this is what the linear ramp got
    // wrong, and why a native T4 could not fit the old corridor.
    expect(corridorChaoAt(4, 0.5)).toBeCloseTo(5);
    expect(corridorChaoAt(4, 0.55)).toBeCloseTo(5);
    expect(corridorChaoAt(4, 0.7)).toBeCloseTo(3);
    expect(corridorChaoAt(4, 0.85)).toBeCloseTo(1);
  });

  it("every contour completes before the gate ends, then holds", () => {
    // A speaker who finishes a natural rise early and sustains the final note
    // must still be inside the corridor. Without this tail she sat above a
    // corridor still climbing underneath her — 469ms and 512ms excursions on
    // otherwise-correct T2 attempts, 4 Aug 2026.
    for (const tone of [1, 2, 3, 4] as const) {
      const end = corridorChaoAt(tone, 1);
      expect(corridorChaoAt(tone, 0.9)).toBeCloseTo(end);
      expect(corridorChaoAt(tone, 0.95)).toBeCloseTo(end);
    }
  });

  it("clamps t outside [0,1]", () => {
    expect(corridorChaoAt(1, -0.5)).toBeCloseTo(5);
    expect(corridorChaoAt(4, 1.5)).toBeCloseTo(1);
    expect(corridorChaoAt(4, -1)).toBeCloseTo(5);
  });
});

describe("toleranceChao", () => {
  it("converts base 0.12H to 0.8 chao for non-T3 tones", () => {
    expect(toleranceChao(1, 0.12)).toBeCloseTo(0.8);
    expect(toleranceChao(2, 0.12)).toBeCloseTo(0.8);
    expect(toleranceChao(4, 0.12)).toBeCloseTo(0.8);
  });

  it("widens T3 tolerance by 1.3x", () => {
    expect(toleranceChao(3, 0.12)).toBeCloseTo(0.8 * 1.3);
  });
});

describe("newDifficulty", () => {
  it("exposes the PRD base values", () => {
    const d = newDifficulty();
    expect(d.scrollSpeed).toBeCloseTo(220);
    expect(d.toleranceH).toBeCloseTo(0.12);
    expect(d.restMs).toBeCloseTo(900);
  });
});

describe("rampDifficulty", () => {
  const base: Difficulty = { scrollSpeed: 220, toleranceH: 0.12, restMs: 900 };

  it("leaves difficulty unchanged below 5 cleared", () => {
    expect(rampDifficulty(0)).toEqual(base);
    expect(rampDifficulty(4)).toEqual(base);
  });

  it("applies one ramp step at 5 cleared", () => {
    const d = rampDifficulty(5);
    expect(d.scrollSpeed).toBeCloseTo(220 * 1.08);
    expect(d.toleranceH).toBeCloseTo(0.12 * 0.95);
    expect(d.restMs).toBeCloseTo(900 * 0.95);
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
    expect(g.tolChao).toBeCloseTo(0.8);
  });

  it("gate width follows the tone's own measured duration", () => {
    const d = newDifficulty();
    // T3 runs longest and T4 shortest — PRD §14's open question, answered from
    // a native speaker's utterance lengths in play.
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
    expect(g.tolChao).toBeCloseTo(0.8 * 1.3);
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
    expect(d.restMs).toBeCloseTo(900 * 1.5);
    expect(d.toleranceH).toBeCloseTo(0.12);
  });

  it("relaxed slows further and doubles the rest interval", () => {
    const d = applyPace(newDifficulty(), "relaxed");
    expect(d.scrollSpeed).toBeCloseTo(220 * 0.75);
    expect(d.restMs).toBeCloseTo(900 * 2);
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
    expect(d.toleranceH).toBeCloseTo(0.12 * 0.75);
    expect(d.scrollSpeed).toBeCloseTo(220);
    expect(d.restMs).toBeCloseTo(900);
  });

  it("wide loosens tolerance to 1.4x", () => {
    const d = applyCorridorWidth(newDifficulty(), "wide");
    expect(d.toleranceH).toBeCloseTo(0.12 * 1.4);
  });

  it("applied after the ramp, it scales the ramp floor proportionally", () => {
    const ramped = rampDifficulty(1000); // tolerance at the 0.07 floor
    const d = applyCorridorWidth(ramped, "wide");
    expect(d.toleranceH).toBeCloseTo(0.07 * 1.4);
  });
});
