import { describe, expect, it } from "vitest";
import { PitchTrail, type TrailPoint } from "./contours.ts";
import { readAttempt, splitSyllables } from "./freeAttempts.ts";

/** Voiced frames every 10ms over [from, to), chao moving linearly a → b. */
function run(from: number, to: number, a: number, b: number): TrailPoint[] {
  const out: TrailPoint[] = [];
  for (let t = from; t < to; t += 10) out.push({ atMs: t, chao: a + ((b - a) * (t - from)) / (to - from) });
  return out;
}

describe("free-mode attempts", () => {
  it("PitchTrail hands over an attempt once silence outlasts the bridge", () => {
    const trail = new PitchTrail(1600, 700);
    for (let t = 0; t < 300; t += 10) trail.push(3, true, t);
    trail.push(3, false, 500);
    expect(trail.takeFinished()).toHaveLength(0); // still inside the bridge
    trail.push(3, false, 1100);
    const done = trail.takeFinished();
    expect(done).toHaveLength(1);
    expect(done[0]).toHaveLength(30);
    expect(trail.takeFinished()).toHaveLength(0);
  });

  it("splits a two-syllable attempt at the consonant gap", () => {
    const pts = [...run(0, 300, 5, 1), ...run(500, 800, 5, 5)];
    expect(splitSyllables(pts, 150)).toHaveLength(2);
  });

  it("keeps a short creak dropout inside one syllable", () => {
    const pts = [...run(0, 200, 2, 1), ...run(300, 450, 1, 4)];
    expect(splitSyllables(pts, 150)).toHaveLength(1);
  });

  // Plumbing only: one read per syllable. Synthetic lines prove nothing
  // about the classifier itself (CLAUDE.md) — that stays classifier-check's job.
  it("reads one tone per syllable", () => {
    const pts = [...run(0, 300, 5, 1), ...run(500, 800, 4, 4.5)];
    const a = readAttempt(1, pts);
    expect(a?.syllables).toHaveLength(2);
    expect(a?.syllables[0]?.tone).toBe(4);
  });

  it("ignores a cough", () => {
    expect(readAttempt(1, run(0, 80, 3, 3))).toBeNull();
  });
});
