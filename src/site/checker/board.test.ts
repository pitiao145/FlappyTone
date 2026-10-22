import { describe, expect, it } from "vitest";
import { corridorChaoAt, shapeForWord } from "../../game/gates.ts";
import type { Contour } from "../../game/contours.ts";
import { scoreAttempt, targetWord } from "./board.ts";
import { refFor, type RefMode } from "./toneRefs.ts";

/** An utterance that traces the chosen line, frame by frame. */
function traced(id: string, mode: RefMode): Contour {
  const word = targetWord(refFor(id), mode);
  const shape = shapeForWord(word);
  const ms = word.durationS * 1000;
  const points = [];
  for (let t = 0; t <= ms; t += 23) points.push({ tMs: t, chao: corridorChaoAt(shape, t / ms) });
  return { points, startedAtMs: 0, endedAtMs: ms };
}

describe("scoreAttempt (same scorer as the in-app visualiser)", () => {
  it("tracing the real-speech line scores high and reads the right tone", () => {
    for (const [id, tone] of [["1", 1], ["2", 2], ["3", 3], ["4", 4]] as const) {
      const r = scoreAttempt(traced(id, "real"), targetWord(refFor(id), "real"), "real");
      expect(r.accuracy, id).toBeGreaterThan(0.85);
      expect(r.read?.tone, id).toBe(tone);
    }
  });

  it("tracing the textbook line scores high against the textbook line", () => {
    for (const id of ["1", "2", "3", "4", "3-3", "3-4"]) {
      const r = scoreAttempt(traced(id, "textbook"), targetWord(refFor(id), "textbook"), "textbook");
      expect(r.accuracy, id).toBeGreaterThan(0.85);
    }
  });

  it("the version you pick is the one you are scored against", () => {
    // A textbook 214 said against real speech scores lower than against itself.
    const said = traced("3", "textbook");
    const own = scoreAttempt(said, targetWord(refFor("3"), "textbook"), "textbook").accuracy!;
    const other = scoreAttempt(said, targetWord(refFor("3"), "real"), "real").accuracy!;
    expect(own).toBeGreaterThan(other);
  });

  it("a pair gets accuracy but no tone read", () => {
    const r = scoreAttempt(traced("3-3", "real"), targetWord(refFor("3-3"), "real"), "real");
    expect(r.accuracy).toBeGreaterThan(0.8);
    expect(r.read).toBeNull();
  });
});
