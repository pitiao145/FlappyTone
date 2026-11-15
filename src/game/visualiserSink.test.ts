/**
 * Brief 47: a canvas size change re-runs the Visualiser's frame effect. That
 * must not start a second room measurement. Counts NoiseMeter constructions
 * across two effect runs on the same mic session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const made = vi.hoisted(() => ({ count: 0 }));
vi.mock("../pitch/noiseMeter.ts", async (orig) => {
  const real = await orig<typeof import("../pitch/noiseMeter.ts")>();
  class CountingNoiseMeter extends real.NoiseMeter {
    constructor(...args: ConstructorParameters<typeof real.NoiseMeter>) {
      super(...args);
      made.count += 1;
    }
  }
  return { ...real, NoiseMeter: CountingNoiseMeter };
});

import { sessionNoiseFor } from "./sessionNoise.ts";
import { makeVisualiserSink } from "./visualiserSink.ts";
import type { CalibrationSettings } from "./settings.ts";

const settings: CalibrationSettings = {
  f0Center: 200,
  noiseFloor: 0.002,
  rangeSemitones: 5.25,
  rangeDownSemitones: 5.75,
  voiceRms: 0.05,
};

const SR = 48000;
/** A quiet room frame: low white noise. */
function quietFrame(): Float32Array {
  const f = new Float32Array(2048);
  for (let i = 0; i < f.length; i++) f[i] = (Math.random() * 2 - 1) * 0.001;
  return f;
}

/** One run of the Visualiser's frame effect, as Visualiser.tsx does it. */
function effectRun(micSession: object) {
  const noise = sessionNoiseFor(micSession, settings.voiceRms);
  const pitches: number[] = [];
  const sink = makeVisualiserSink({
    settings,
    noise,
    muted: () => false,
    onPitch: (chao) => pitches.push(chao),
  });
  return { noise, sink, pitches };
}

describe("Visualiser room measurement (brief 47)", () => {
  beforeEach(() => {
    made.count = 0;
  });

  it("a size change does not create a second noise meter", () => {
    const mic = {};
    const first = effectRun(mic);
    for (let i = 0; i < 10; i++) first.sink(quietFrame(), SR);
    // Resize / rotation: the effect tears down and runs again, same mic session.
    const second = effectRun(mic);
    for (let i = 0; i < 10; i++) second.sink(quietFrame(), SR);
    expect(made.count).toBe(1);
    expect(second.noise).toBe(first.noise);
    expect(second.pitches.length).toBe(10);
  });

  it("the measurement carries over: it lands once, across both runs", () => {
    const mic = {};
    const a = effectRun(mic);
    // ~1.5 s of frames: past skip + measure at 21.3 ms per hop.
    for (let i = 0; i < 70; i++) a.sink(quietFrame(), SR);
    const floor = a.noise.floor;
    expect(floor).not.toBeNull();
    const b = effectRun(mic);
    for (let i = 0; i < 70; i++) b.sink(quietFrame(), SR);
    expect(b.noise.floor).toBe(floor);
    expect(made.count).toBe(1);
  });

  it("a new mic session measures the room again", () => {
    effectRun({});
    effectRun({});
    expect(made.count).toBe(2);
  });
});
