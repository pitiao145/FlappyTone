import { describe, expect, it } from "vitest";
import { clampNoiseFloor, NoiseMeter } from "./noiseMeter.ts";

const CFG = { skipMs: 200, measureMs: 400, min: 1e-4, max: 0.0015 };
const HOP_MS = 1024 / 48; // ~21.3ms per frame at 48kHz

function feed(meter: NoiseMeter, rms: (i: number) => number, frames: number): number | null {
  let out: number | null = null;
  for (let i = 0; i < frames; i++) out = meter.push(rms(i), HOP_MS) ?? out;
  return out;
}

describe("NoiseMeter", () => {
  it("measures the room's median after the skip window", () => {
    const m = new NoiseMeter(CFG);
    expect(feed(m, () => 0.0004, 40)).toBeCloseTo(0.0004);
  });

  it("ignores the tap in the skip window", () => {
    const m = new NoiseMeter(CFG);
    // A loud tap in the first ~200ms, then a quiet room.
    expect(feed(m, (i) => (i < 9 ? 0.05 : 0.0003), 40)).toBeCloseTo(0.0003);
  });

  it("caps a measurement taken while the player talks", () => {
    const m = new NoiseMeter(CFG);
    expect(feed(m, () => 0.012, 40)).toBe(CFG.max);
  });

  it("floors a dead-silent room", () => {
    const m = new NoiseMeter(CFG);
    expect(feed(m, () => 0, 40)).toBe(CFG.min);
  });

  it("returns the result exactly once, and not before the window ends", () => {
    const m = new NoiseMeter(CFG);
    const outs: (number | null)[] = [];
    for (let i = 0; i < 60; i++) outs.push(m.push(0.0004, HOP_MS));
    expect(outs.filter((o) => o !== null)).toHaveLength(1);
    const firstAt = outs.findIndex((o) => o !== null);
    expect(firstAt * HOP_MS).toBeGreaterThanOrEqual(CFG.skipMs + CFG.measureMs - 2 * HOP_MS);
    expect(m.done()).toBeCloseTo(0.0004);
  });

  it("clampNoiseFloor caps the saved calibration value that broke the PWA", () => {
    expect(clampNoiseFloor(0.0044, CFG)).toBe(CFG.max);
    expect(clampNoiseFloor(0.0006, CFG)).toBe(0.0006);
  });
});
