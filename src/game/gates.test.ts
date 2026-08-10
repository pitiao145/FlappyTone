import { DEFAULT_TUNING, setTuning, tuning } from "./tuning.ts";
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
  // DEFAULT_POLYLINES is now a fixed 2/3/4/3-vertex template per tone (see
  // templateContour in clipCut.ts), interpolated with a monotone cubic spline
  // rather than straight segments — so these pin the spline's actual output,
  // not a hand-derived line equation.

  it("T1 is flat, at the level she actually holds", () => {
    // 4.584, not a textbook 5 — read off the shipped reference clip.
    expect(corridorChaoAt(shapeForTone(1), 0)).toBeCloseTo(4.584);
    expect(corridorChaoAt(shapeForTone(1), 0.5)).toBeCloseTo(4.584);
    expect(corridorChaoAt(shapeForTone(1), 1)).toBeCloseTo(4.584);
  });

  it("T2 dips below its start before climbing", () => {
    expect(corridorChaoAt(shapeForTone(2), 0)).toBeCloseTo(2.989);
    expect(corridorChaoAt(shapeForTone(2), 0.2788)).toBeCloseTo(1.832);
    expect(corridorChaoAt(shapeForTone(2), 1)).toBeCloseTo(5);
    // The dip is the point: a correct T2 must be *below* its start early on.
    expect(corridorChaoAt(shapeForTone(2), 0.2)).toBeLessThan(2.989);
  });

  it("T3 falls, then rises through a real mid-rise sample", () => {
    expect(corridorChaoAt(shapeForTone(3), 0)).toBeCloseTo(2.234);
    expect(corridorChaoAt(shapeForTone(3), 0.5465)).toBeCloseTo(1.185);
    expect(corridorChaoAt(shapeForTone(3), 0.7715)).toBeCloseTo(2.751);
    expect(corridorChaoAt(shapeForTone(3), 1)).toBeCloseTo(5);
    // Still low well past the floor — the dip the PRD's two-segment
    // polyline had no room for.
    expect(corridorChaoAt(shapeForTone(3), 0.6)).toBeLessThan(1.5);
  });

  it("T4 holds high, then falls toward the floor", () => {
    expect(corridorChaoAt(shapeForTone(4), 0)).toBeCloseTo(4.7);
    expect(corridorChaoAt(shapeForTone(4), 0.6024)).toBeCloseTo(5);
    expect(corridorChaoAt(shapeForTone(4), 1)).toBeCloseTo(1.213);
    // Still near the top approaching the peak — the plateau a linear 5→1
    // ramp got wrong, and why a native T4 could not fit the old corridor.
    expect(corridorChaoAt(shapeForTone(4), 0.5)).toBeGreaterThan(4.5);
  });

  it("is exact at every vertex, tone by tone", () => {
    // C0 continuity: whatever the spline does between vertices, it must pass
    // through each of them exactly.
    for (const tone of [1, 2, 3, 4] as const) {
      for (const [t, chao] of shapeForTone(tone).polyline) {
        expect(corridorChaoAt(shapeForTone(tone), t)).toBeCloseTo(chao, 6);
      }
    }
  });

  it("clamps t outside [0,1]", () => {
    expect(corridorChaoAt(shapeForTone(1), -0.5)).toBeCloseTo(4.584);
    expect(corridorChaoAt(shapeForTone(4), 1.5)).toBeCloseTo(1.213);
    expect(corridorChaoAt(shapeForTone(4), -1)).toBeCloseTo(4.7);
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
    // T4's cliff is at t≈0.63; near its start at t≈0.3 the corridor is still
    // close to its peak and barely moving.
    const plateau = corridorToleranceAt(shapeForTone(4), 0.3, BASE);
    const cliff = corridorToleranceAt(shapeForTone(4), 0.63, BASE);
    expect(plateau).toBeLessThan(BASE * 1.1);
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
    // The slack window looks *backwards* too — so whether the tail forgives
    // depends on whether the corridor is still moving right up to the end.
    //
    // T1 never moves, so its tail stays strict.
    expect(corridorToleranceAt(shapeForTone(1), 1, BASE)).toBeCloseTo(BASE, 10);
    // T4's fall is still under way as the gate closes — a player still
    // falling then is legitimately late, not wrong.
    expect(corridorToleranceAt(shapeForTone(4), 1, BASE)).toBeGreaterThan(BASE);
  });

  it("has no cusps — the walls curve rather than spike", () => {
    // The defect this pins: the widening was a max over a window (a tent, with
    // a cusp at its apex) passed through a hard min (a second corner), and the
    // renderer draws the result. Every corner was a visible spike on the
    // corridor wall.
    //
    // A cusp is a step in the *slope*, so the test is on the second difference,
    // measured at the sample spacing the renderer actually draws at.
    const STEP = 1 / 240;
    for (const tone of [1, 2, 3, 4] as const) {
      const shape = shapeForTone(tone);
      let worst = 0;
      for (let t = STEP; t < 1 - STEP; t += STEP) {
        const a = corridorToleranceAt(shape, t - STEP, BASE);
        const b = corridorToleranceAt(shape, t, BASE);
        const c = corridorToleranceAt(shape, t + STEP, BASE);
        worst = Math.max(worst, Math.abs(c - 2 * b + a));
      }
      // Chao units per sample². Measured at slackSmoothS = 0:
      //   T1 0.000  T2 0.042  T3 0.056  T4 0.045
      // and at the shipped 0.05:
      //   T1 0.000  T2 0.002  T3 0.006  T4 0.003
      // T3 is worst because it is the longest gate, so a radius fixed in
      // seconds is the smallest fraction of it. An order of magnitude down is
      // the difference between a spike and an arc.
      expect(worst, `tone ${tone}`).toBeLessThan(0.008);
    }
  });

  it("smoothing stays inside the unsmoothed function's own envelope", () => {
    // The blur is an average of neighbours, so it can only land between the
    // smallest and the largest unsmoothed value within its radius. That is the
    // real guarantee: at a peak it rounds down, at the foot of a moving stretch
    // it rounds up a little, and nowhere does it invent room the max scan never
    // found. Anywhere further than (slack + radius) from a moving stretch is
    // untouched — T1, and the T2 tail above, both pin that.
    const smoothed = tuning().slackSmoothS;
    try {
      for (const tone of [2, 3, 4] as const) {
        const shape = shapeForTone(tone);
        const radius = smoothed / shape.durationS;
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          setTuning({ slackSmoothS: smoothed });
          const soft = corridorToleranceAt(shape, t, BASE);

          setTuning({ slackSmoothS: 0 });
          let lo = Infinity;
          let hi = -Infinity;
          for (let k = -12; k <= 12; k++) {
            const raw = corridorToleranceAt(shape, t + (k / 12) * radius, BASE);
            lo = Math.min(lo, raw);
            hi = Math.max(hi, raw);
          }
          expect(soft, `tone ${tone} at t=${t}`).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(soft, `tone ${tone} at t=${t}`).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    } finally {
      setTuning({ slackSmoothS: smoothed });
    }
  });
});
