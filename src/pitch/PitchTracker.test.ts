import { describe, expect, it } from "vitest";
import { PitchTracker } from "./PitchTracker.ts";

const SAMPLE_RATE = 44100;
const FRAME = 2048;

/** A frame of pure tone; `fill` limits the tone to the centre N samples. */
function tone(hz: number, amplitude: number, fill = FRAME): Float32Array {
  const frame = new Float32Array(FRAME);
  const start = (FRAME - fill) >> 1;
  for (let i = 0; i < fill; i++) {
    const n = start + i;
    frame[n] = amplitude * Math.sin((2 * Math.PI * hz * n) / SAMPLE_RATE);
  }
  return frame;
}

const silence = () => new Float32Array(FRAME);

describe("PitchTracker — state across unvoiced gaps", () => {
  it("reports the new pitch on the first voiced frame after a silence", () => {
    // The median filter must not blend a new syllable with one from before a
    // pause: between gates the player breathes, and the next syllable can start
    // anywhere. A stale buffer drags the first ~100ms of every gate — exactly
    // the window that decides whether a fast Tone 2 or 4 onset registers.
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, f0Center: 200 });

    for (let i = 0; i < 8; i++) tracker.push(tone(200, 0.2));
    for (let i = 0; i < 10; i++) tracker.push(silence());

    const first = tracker.push(tone(300, 0.2));
    expect(first.voiced).toBe(true);
    expect(first.f0!).toBeGreaterThan(285);
  });

  it("still median-filters within a single continuous utterance", () => {
    // The reset must not disable the filter outright: a lone bad frame in the
    // middle of a held tone should still be smoothed away.
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, f0Center: 200 });
    for (let i = 0; i < 5; i++) tracker.push(tone(200, 0.2));
    const glitch = tracker.push(tone(260, 0.2));
    expect(glitch.f0!).toBeLessThan(230);
  });
});

describe("PitchTracker — voicing window", () => {
  it("hears a quiet onset that fills only the centre of the analysis window", () => {
    // Pitch is detected on the centre 1024 samples, so voicing must be judged
    // on the same audio. Measuring RMS over the whole 2048 lets silence in the
    // outer samples veto a centre that is cleanly voiced — a spurious
    // "couldn't hear that" at the exact moment a syllable begins.
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, f0Center: 200 });
    // Amplitude chosen so the centre clears noiseFloor*3 but the padded frame
    // does not: centre rms ~0.012, full-frame rms ~0.0085, gate is 0.0099.
    const onset = tone(200, 0.017, 1024);
    expect(tracker.push(onset).voiced).toBe(true);
  });

  it("still rejects a frame that is quiet all the way through", () => {
    const tracker = new PitchTracker({ sampleRate: SAMPLE_RATE, f0Center: 200 });
    expect(tracker.push(tone(200, 0.002)).voiced).toBe(false);
  });
});
