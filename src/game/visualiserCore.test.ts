import { describe, expect, it } from "vitest";
import { BRIDGE_MS, SINGLE_TONE_GAP_MS, VisualiserCore } from "./visualiserCore.ts";

/** Voiced frames every 10ms over [from, to), then a step at `to`. */
function speak(core: VisualiserCore, from: number, to: number, chao: number): void {
  for (let t = from; t < to; t += 10) core.push(chao, true, t);
}

const one = { syllables: 1, free: false };
const pair = { syllables: 2, free: false };

describe("VisualiserCore (shared by the app and the tone checker)", () => {
  it("keeps one attempt across a 300ms gap for a single tone, ends it after the gap", () => {
    const core = new VisualiserCore(1600);
    core.step(0, one);
    speak(core, 0, 300, 4);
    core.push(4, false, 600);
    expect(core.step(600, one).attempt).toBeNull();
    speak(core, 600, 900, 4);
    core.push(4, false, 900 + SINGLE_TONE_GAP_MS + 10);
    const f = core.step(900 + SINGLE_TONE_GAP_MS + 10, one);
    expect(f.attempt).not.toBeNull();
    expect(f.finished).toHaveLength(1);
  });

  it("keeps a slow pair (600ms between syllables) as one attempt", () => {
    const core = new VisualiserCore(1600);
    core.step(0, pair); // the gap follows the target word from the first frame
    speak(core, 0, 300, 5);
    speak(core, 900, 1200, 2);
    core.push(2, false, 1200 + BRIDGE_MS + 10);
    expect(core.step(1200 + BRIDGE_MS + 10, pair).finished).toHaveLength(1);
  });

  it("reports each attempt exactly once", () => {
    const core = new VisualiserCore(1600);
    speak(core, 0, 300, 3);
    core.push(3, false, 1000);
    expect(core.step(1000, one).attempt).not.toBeNull();
    expect(core.step(1016, one).attempt).toBeNull();
  });

  it("holds the bird through a gap, then returns it to rest", () => {
    const core = new VisualiserCore(1600);
    core.step(0, pair);
    speak(core, 0, 300, 5);
    let f = core.step(300, pair);
    // Silence arrives as unvoiced frames, as it does from the mic.
    for (let t = 316; t <= 600; t += 16) {
      core.push(5, false, t);
      f = core.step(t, pair);
    }
    expect(f.chao).toBeGreaterThan(4.5); // holding
    for (let t = 616; t <= 2000; t += 16) {
      core.push(5, false, t);
      f = core.step(t, pair);
    }
    expect(f.chao).toBeLessThan(3.1); // back at rest
  });

  it("scrolls only in Free mode", () => {
    const core = new VisualiserCore(1600);
    speak(core, 0, 300, 3);
    expect(core.step(300, one).scroll).toBeNull();
    expect(core.step(316, { syllables: 1, free: true }).scroll?.points.length).toBeGreaterThan(0);
  });
});
