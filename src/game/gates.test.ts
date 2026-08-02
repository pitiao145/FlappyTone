import { describe, expect, it } from "vitest";
import {
  corridorChaoAt,
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

  it("T2 ramps from chao 3 to chao 5", () => {
    expect(corridorChaoAt(2, 0)).toBeCloseTo(3);
    expect(corridorChaoAt(2, 1)).toBeCloseTo(5);
    expect(corridorChaoAt(2, 0.5)).toBeCloseTo(4);
  });

  it("T3 dips then rises across two segments", () => {
    expect(corridorChaoAt(3, 0)).toBeCloseTo(2);
    expect(corridorChaoAt(3, 0.4)).toBeCloseTo(1);
    expect(corridorChaoAt(3, 1)).toBeCloseTo(4);
    expect(corridorChaoAt(3, 0.2)).toBeCloseTo(1.5);
    expect(corridorChaoAt(3, 0.7)).toBeCloseTo(2.5);
  });

  it("T4 slides from chao 5 to chao 1", () => {
    expect(corridorChaoAt(4, 0)).toBeCloseTo(5);
    expect(corridorChaoAt(4, 1)).toBeCloseTo(1);
    expect(corridorChaoAt(4, 0.5)).toBeCloseTo(3);
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
    expect(rampDifficulty(base, 0)).toEqual(base);
    expect(rampDifficulty(base, 4)).toEqual(base);
  });

  it("applies one ramp step at 5 cleared", () => {
    const d = rampDifficulty(base, 5);
    expect(d.scrollSpeed).toBeCloseTo(220 * 1.08);
    expect(d.toleranceH).toBeCloseTo(0.12 * 0.95);
    expect(d.restMs).toBeCloseTo(900 * 0.95);
  });

  it("caps scrollSpeed at 2.2x base and floors tolerance/rest at 100 cleared", () => {
    const d = rampDifficulty(base, 100);
    expect(d.scrollSpeed).toBeCloseTo(484);
    expect(d.toleranceH).toBeCloseTo(0.07);
    expect(d.restMs).toBeCloseTo(600);
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
});

describe("makeGate", () => {
  it("builds a gate from tone, xStart, and difficulty", () => {
    const d = newDifficulty();
    const g = makeGate(1, 500, d);
    expect(g.tone).toBe(1);
    expect(g.xStart).toBe(500);
    expect(g.widthPx).toBeCloseTo(220 * 0.6);
    expect(g.tolChao).toBeCloseTo(0.8);
  });

  it("uses widened tolerance for T3", () => {
    const d = newDifficulty();
    const g = makeGate(3, 0, d);
    expect(g.tolChao).toBeCloseTo(0.8 * 1.3);
  });
});
