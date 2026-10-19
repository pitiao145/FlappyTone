import { describe, expect, it } from "vitest";
import { corridorChaoAt, shapeForWord } from "../../game/gates.ts";
import type { Contour } from "../../game/contours.ts";
import { checkerWordFor } from "./checkerWords.ts";
import { scoreAttempt, wordOf } from "./engine.ts";

/** An utterance that traces the word's own recording, frame by frame. */
function traced(id: string): Contour {
  const word = wordOf(checkerWordFor(id));
  const shape = shapeForWord(word);
  const ms = word.durationS * 1000;
  const points = [];
  for (let t = 0; t <= ms; t += 23) points.push({ tMs: t, chao: corridorChaoAt(shape, t / ms) });
  return { points, startedAtMs: 0, endedAtMs: ms };
}

describe("scoreAttempt (same scorer as the in-app visualiser)", () => {
  it("tracing the recording scores high and reads the right tone", () => {
    for (const [id, tone] of [["ni3", 3], ["ren2", 2], ["shi4", 4], ["ma1b", 1]] as const) {
      const r = scoreAttempt(traced(id), wordOf(checkerWordFor(id)));
      expect(r.accuracy, id).toBeGreaterThan(0.85);
      expect(r.read?.tone, id).toBe(tone);
    }
  });

  it("a pair gets accuracy but no tone read", () => {
    const r = scoreAttempt(traced("xihuan31"), wordOf(checkerWordFor("xihuan31")));
    expect(r.accuracy).toBeGreaterThan(0.8);
    expect(r.read).toBeNull();
  });
});
