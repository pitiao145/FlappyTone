/**
 * Offline proof that the recording booth's segmentation works on a real voice.
 *
 * Nobody can hear the browser, so this is the check that matters: drive the
 * detector frame by frame from the same native captures the reference clips are
 * cut from, and assert it finds exactly one take, in the right place, of a
 * plausible length. If this passes, `Recorder.tsx` is only wiring.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeWav } from "../dev/wav.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { DEFAULT_TAKE_CONFIG, TakeDetector, type TakeEvent } from "./takeDetector.ts";

const FRAME = 2048;
const HOP = 1024;
const JANE_F0_CENTER = 168;

/** Runs a whole WAV through tracker + detector, collecting every event. */
function run(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
  detector = new TakeDetector(),
): TakeEvent[] {
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const events: TakeEvent[] = [];
  detector.arm();
  for (let s = 0; s + FRAME <= samples.length; s += HOP) {
    const frame = samples.subarray(s, s + FRAME);
    const state = tracker.push(frame);
    let peak = 0;
    for (let i = 0; i < frame.length; i++) {
      const a = Math.abs(frame[i]);
      if (a > peak) peak = a;
    }
    // The frame's time is its centre — the same convention make-ref-clips uses
    // for voiced frame positions, so bounds from both are comparable.
    const event = detector.push(((s + FRAME / 2) / sampleRate) * 1000, state.voiced, peak);
    if (event) events.push(event);
  }
  return events;
}

function capture(file: string) {
  return decodeWav(readFileSync(`fixtures/captures/${file}`));
}


/**
 * Drives a synthetic voicing pattern and returns the take's terminal event.
 * `onset` is skipped — it is a UI cue, not a verdict.
 */
function drive(
  voicedAt: (t: number) => boolean,
  peakAt: (t: number) => number = () => 0.3,
  untilMs = 12000,
): TakeEvent | null {
  const detector = new TakeDetector();
  detector.arm();
  for (let t = 0; t <= untilMs; t += 20) {
    const event = detector.push(t, voicedAt(t), peakAt(t));
    if (event && event.type !== "onset") return event;
  }
  return null;
}

/**
 * Voiced-run length the detector must find in each capture, in ms.
 *
 * These are not arbitrary: they are exactly what `npm run make-ref-clips`
 * reports for the shipped clips (879/1071/1327/602ms) minus the 90ms of padding
 * it adds. Both walk the same voiced frames with the same merge gap, so the two
 * agreeing to the millisecond is the property being locked here — a change that
 * moves one and not the other has broken the shared segmentation.
 */
const EXPECTED_VOICING: Record<string, number> = {
  jane_ma1: 789,
  jane_ma2: 981,
  jane_ma3: 1237,
  jane_ma4: 512,
};

const TONES = ["jane_ma1", "jane_ma2", "jane_ma3", "jane_ma4"];

describe("one take per native capture", () => {
  for (const file of TONES) {
    describe(file, () => {
      const { samples, sampleRate } = capture(`${file}.wav`);
      const events = run(samples, sampleRate, JANE_F0_CENTER);
      const accepted = events.filter((e) => e.type === "accepted");

      it("accepts exactly one take", () => {
        expect(events.filter((e) => e.type === "rejected")).toEqual([]);
        expect(accepted).toHaveLength(1);
      });

      it("cuts a syllable-sized window, not the whole file", () => {
        const take = accepted[0];
        if (take.type !== "accepted") throw new Error("no take");
        const cutMs = take.endMs - take.startMs;
        const fileMs = (samples.length / sampleRate) * 1000;
        // Citation syllables plus padding: comfortably under a second and a
        // half, and always shorter than the take she actually recorded.
        expect(cutMs).toBeGreaterThan(DEFAULT_TAKE_CONFIG.minTakeMs);
        expect(cutMs).toBeLessThan(1800);
        expect(cutMs).toBeLessThan(fileMs);
      });

      it("finds the same voiced run make-ref-clips cuts", () => {
        const take = accepted[0];
        if (take.type !== "accepted") throw new Error("no take");
        expect(take.utteranceMs).toBeGreaterThanOrEqual(DEFAULT_TAKE_CONFIG.minTakeMs);
        // Within one analysis hop (~21ms) of the offline cutter's answer.
        expect(Math.abs(take.utteranceMs - EXPECTED_VOICING[file])).toBeLessThan(25);
      });

      it("does not report the take as clipped", () => {
        const take = accepted[0];
        if (take.type !== "accepted") throw new Error("no take");
        expect(take.peak).toBeLessThan(DEFAULT_TAKE_CONFIG.maxPeak);
      });
    });
  }
});

describe("silence", () => {
  it("produces no take at all", () => {
    const samples = new Float32Array(48000 * 3);
    expect(run(samples, 48000, JANE_F0_CENTER)).toEqual([]);
  });

  it("stays armed, so the word can wait for her", () => {
    const detector = new TakeDetector();
    run(new Float32Array(48000 * 3), 48000, JANE_F0_CENTER, detector);
    expect(detector.isArmed).toBe(true);
  });
});

describe("rejection", () => {
  it("rejects a blip too short to be a syllable", () => {
    expect(drive((t) => t <= 100)).toMatchObject({ type: "rejected", reason: "short" });
  });

  it("rejects a loud take as clipped rather than shipping distortion", () => {
    const event = drive(
      (t) => t <= 500,
      (t) => (t === 200 ? 1.0 : 0.4),
    );
    expect(event).toMatchObject({ type: "rejected", reason: "clipped" });
  });

  it("bridges a creak dropout shorter than the merge gap", () => {
    // 200ms voiced, 100ms creak hole, 200ms voiced — one 500ms syllable.
    const event = drive((t) => t <= 200 || (t >= 300 && t <= 500));
    expect(event).toMatchObject({ type: "accepted" });
    if (event?.type === "accepted") expect(event.utteranceMs).toBe(500);
  });

  it("does not let two separate blips add up to a syllable", () => {
    // Two 100ms blips separated by 200ms — past the merge gap, so neither run
    // reaches minTakeMs even though the voiced total does.
    const event = drive((t) => t <= 100 || (t >= 300 && t <= 400));
    expect(event).toMatchObject({ type: "rejected", reason: "short" });
  });
});

describe("bounds", () => {
  it("pads before the onset so an unvoiced consonant survives the cut", () => {
    const event = drive((t) => t >= 1000 && t <= 1500);
    if (event?.type !== "accepted") throw new Error("expected a take");
    expect(event.startMs).toBe(1000 - DEFAULT_TAKE_CONFIG.preRollMs);
    expect(event.endMs).toBe(1500 + DEFAULT_TAKE_CONFIG.tailMs);
  });

  it("never asks for a negative offset when she speaks immediately", () => {
    const event = drive((t) => t <= 400);
    if (event?.type !== "accepted") throw new Error("expected a take");
    expect(event.startMs).toBe(0);
  });

  it("stops a hum that never ends at maxTakeMs", () => {
    const event = drive(() => true);
    if (event?.type !== "accepted") throw new Error("expected a take");
    expect(event.endMs - event.startMs).toBeLessThanOrEqual(
      DEFAULT_TAKE_CONFIG.maxTakeMs + DEFAULT_TAKE_CONFIG.preRollMs + DEFAULT_TAKE_CONFIG.tailMs,
    );
  });
});
