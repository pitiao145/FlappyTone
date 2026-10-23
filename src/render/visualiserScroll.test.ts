import { describe, expect, it } from "vitest";
import { PitchTrail } from "../game/contours.ts";
import { scrollSegments } from "./visualiser.ts";

/** Voiced frames every 10ms over [from, to), at a fixed chao. */
function voice(trail: PitchTrail, from: number, to: number, chao: number): void {
  for (let t = from; t < to; t += 10) trail.push(chao, true, t);
}

describe("Free tab scrolling line", () => {
  it("bridges a ~150ms consonant gap: two voice runs joined by one dashed bridge", () => {
    const trail = new PitchTrail(1600, 700);
    voice(trail, 0, 300, 5); // sì
    voice(trail, 450, 750, 4); // qiān, after a 150ms unvoiced q
    const kinds = scrollSegments(trail.points(), trail.clockMs(), 0.3, 500, 400).map((s) => s.kind);
    expect(kinds).toEqual(["voice", "bridge", "voice"]);
  });

  it("leaves a real hole for a silence over 700ms", () => {
    const trail = new PitchTrail(2000, 700);
    voice(trail, 0, 300, 5);
    voice(trail, 1000, 1300, 4);
    const kinds = scrollSegments(trail.points(), trail.clockMs(), 0.3, 500, 400).map((s) => s.kind);
    expect(kinds).toEqual(["voice", "voice"]);
  });

  it("puts the newest frame at the bird and older frames to its left", () => {
    const trail = new PitchTrail(1600, 700);
    voice(trail, 0, 200, 3);
    const [seg] = scrollSegments(trail.points(), trail.clockMs(), 0.3, 500, 400);
    expect(seg.points.at(-1)!.x).toBeCloseTo(500);
    expect(seg.points[0].x).toBeLessThan(500);
  });

  it("stops its clock in silence, so the line stays put to be read", () => {
    const trail = new PitchTrail(1600, 700);
    voice(trail, 0, 300, 3);
    trail.push(3, false, 1000); // bridge ends
    const frozen = trail.clockMs();
    trail.push(3, false, 5000);
    expect(trail.clockMs()).toBe(frozen);
    expect(trail.points().length).toBeGreaterThan(0);
  });

  it("forgets frames that scrolled out while speaking", () => {
    const trail = new PitchTrail(1000, 700);
    voice(trail, 0, 100, 3);
    voice(trail, 100, 1300, 4);
    expect(trail.points()[0].atMs).toBeGreaterThanOrEqual(trail.clockMs() - 1000);
  });
});
