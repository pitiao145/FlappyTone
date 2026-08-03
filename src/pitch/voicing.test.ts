import { describe, expect, it } from "vitest";
import { DEFAULT_VOICING, isFrameVoiced } from "./math.ts";

// Numbers below are lifted from fixtures/captures/Jane-4.wav (native Taiwanese
// Tone 4, direct iPhone mic). Frame times are noted so they can be re-checked
// against `npm run analyze`.
const cfg = { ...DEFAULT_VOICING, noiseFloor: 0.0033 };

describe("isFrameVoiced — primary gate", () => {
  it("accepts a clear, loud frame", () => {
    // Jane-4 @1.19s: the last frame the shipped gate caught before going deaf
    expect(
      isFrameVoiced(
        { f0: 329.8, clarity: 0.71, rms: 0.197, prevVoicedF0: 354.6, framesSinceVoiced: 0 },
        cfg,
      ),
    ).toBe(true);
  });

  it("rejects a quiet frame even when clarity is high", () => {
    // wind in the first second of Jane-4: periodic-ish but far below the floor
    expect(
      isFrameVoiced(
        { f0: 120, clarity: 0.95, rms: 0.008, prevVoicedF0: null, framesSinceVoiced: 99 },
        cfg,
      ),
    ).toBe(false);
  });

  it("rejects a low-clarity frame when there is no previous voiced pitch to anchor to", () => {
    expect(
      isFrameVoiced(
        { f0: 297.2, clarity: 0.59, rms: 0.187, prevVoicedF0: null, framesSinceVoiced: 99 },
        cfg,
      ),
    ).toBe(false);
  });
});

describe("isFrameVoiced — glide rescue", () => {
  it("accepts a loud sub-threshold frame that continues the previous pitch", () => {
    // Jane-4 @1.22s: clarity 0.59 < 0.7, but as loud as the vowel peak and only
    // 1.8 semitones below the previous voiced frame. This is the T4 fall.
    expect(
      isFrameVoiced(
        { f0: 297.2, clarity: 0.59, rms: 0.187, prevVoicedF0: 329.8, framesSinceVoiced: 0 },
        cfg,
      ),
    ).toBe(true);
  });

  it("rejects a loud sub-threshold frame that jumps an implausible interval", () => {
    // Jane-4 @1.28s: 70.2Hz against a previous 234Hz is ~21 semitones — an
    // octave-error, not a glide. Rescuing this would teleport the dot.
    expect(
      isFrameVoiced(
        { f0: 70.2, clarity: 0.5, rms: 0.188, prevVoicedF0: 234.0, framesSinceVoiced: 0 },
        cfg,
      ),
    ).toBe(false);
  });

  it("widens the continuity allowance in proportion to the gap since the last voiced frame", () => {
    // Jane-4 @1.30s: 193.4Hz is 3.3 semitones under the last voiced 234Hz, but
    // one frame was dropped in between, so the voice had two hops to travel.
    expect(
      isFrameVoiced(
        { f0: 193.4, clarity: 0.55, rms: 0.153, prevVoicedF0: 234.0, framesSinceVoiced: 1 },
        cfg,
      ),
    ).toBe(true);
  });

  it("does not rescue a frame that is merely above the noise gate", () => {
    // A low-clarity frame at ordinary room level is noise, not a glide: the
    // rescue is for signal that is unmistakably loud.
    expect(
      isFrameVoiced(
        { f0: 300, clarity: 0.5, rms: 0.012, prevVoicedF0: 329.8, framesSinceVoiced: 0 },
        cfg,
      ),
    ).toBe(false);
  });

  it("stops rescuing once the last voiced frame is stale", () => {
    // After a long unvoiced stretch the anchor is meaningless — a new syllable
    // may start anywhere. Falling back to the primary gate is the safe default.
    expect(
      isFrameVoiced(
        { f0: 297.2, clarity: 0.59, rms: 0.187, prevVoicedF0: 329.8, framesSinceVoiced: 12 },
        cfg,
      ),
    ).toBe(false);
  });

  it("never rescues a frame with no detected pitch", () => {
    expect(
      isFrameVoiced(
        { f0: 0, clarity: 0.9, rms: 0.2, prevVoicedF0: 329.8, framesSinceVoiced: 0 },
        cfg,
      ),
    ).toBe(false);
  });
});
