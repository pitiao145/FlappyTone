import { describe, expect, it } from "vitest";
import { PitchTracker } from "./PitchTracker.ts";

const SR = 48000;
const tone = (hz: number, amp = 0.1) =>
  Float32Array.from({ length: 2048 }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const silence = () => new Float32Array(2048);

describe("PitchTracker minVoicedRun", () => {
  it("rejects a lone voiced frame between silences", () => {
    const t = new PitchTracker({ sampleRate: SR, noiseFloor: 0.0005, minVoicedRun: 3 });
    const seq = [silence(), silence(), tone(150), silence(), silence(), tone(90), silence()];
    const out = seq.map((f) => t.push(f));
    expect(out.every((p) => !p.voiced)).toBe(true);
    expect(out.at(-1)!.smoothedChao).toBe(3); // the dot never moved
  });

  it("passes a sustained voice from its third frame", () => {
    const t = new PitchTracker({ sampleRate: SR, noiseFloor: 0.0005, minVoicedRun: 3 });
    const out = Array.from({ length: 8 }, () => t.push(tone(150)));
    expect(out.map((p) => p.voiced)).toEqual([false, false, true, true, true, true, true, true]);
  });

  it("defaults to 1 — offline measurement unchanged", () => {
    const t = new PitchTracker({ sampleRate: SR, noiseFloor: 0.0005 });
    expect(t.push(tone(150)).voiced).toBe(true);
  });
});
