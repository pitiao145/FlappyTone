import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, PitchTracker, derivedFrames, framesFor } from "./PitchTracker.ts";

// Brief 42: time settings are in ms and become frame counts from the real hop.
const at = (sampleRate: number, extra = {}) => derivedFrames({ ...DEFAULT_CONFIG, sampleRate, ...extra });

describe("ms settings → frames", () => {
  it("48 kHz gives exactly the old frame values", () => {
    expect(at(48000)).toEqual({ maxSlewSemitones: 3, rescueMaxFrames: 3, staleUnvoicedFrames: 5, minVoicedRun: 1 });
    expect(at(48000, { minVoicedRunMs: 64 }).minVoicedRun).toBe(3); // tuning().minVoicedRunMs
    expect(framesFor(171, 48000, 1024)).toBe(8); // clipCut TONE_3_RESCUE
  });

  it("44.1 kHz keeps the same times (longer hop, same speed)", () => {
    const f = at(44100, { minVoicedRunMs: 64 });
    expect(f.maxSlewSemitones).toBeCloseTo(140.625 * (1024 / 44100), 9); // 3.27 st per 23.2 ms hop
    expect(f.rescueMaxFrames).toBe(3); // 64 ms / 23.2 = 2.76
    expect(f.staleUnvoicedFrames).toBe(5); // 107 / 23.2 = 4.6
    expect(f.minVoicedRun).toBe(3);
    expect(framesFor(171, 44100, 1024)).toBe(7); // 7 × 23.2 = 163 ms ≈ 8 × 21.3 = 171 ms
    // Slew per second is the same at both rates.
    expect(f.maxSlewSemitones / (1024 / 44100)).toBeCloseTo(at(48000).maxSlewSemitones / (1024 / 48000), 9);
  });

  it("the tracker uses the derived values", () => {
    expect(new PitchTracker({ sampleRate: 44100, minVoicedRunMs: 64 }).getDerivedFrames().minVoicedRun).toBe(3);
    expect(new PitchTracker({ sampleRate: 48000 }).getDerivedFrames().maxSlewSemitones).toBe(3);
  });
});
