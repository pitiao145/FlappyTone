import { describe, it, expect } from "vitest";
import { initialArmed, needsRedoConfirm, afterTake } from "./boothArming.ts";
import { TakeDetector } from "./takeDetector.ts";

describe("initialArmed", () => {
  it("arms for the bulk pass, so Jane presses nothing all session", () => {
    expect(initialArmed("bulk")).toBe(true);
  });

  it("stays paused for a redo — the 16 Sep 2026 overwrite came from the opposite", () => {
    expect(initialArmed("redo")).toBe(false);
  });
});

describe("needsRedoConfirm", () => {
  it("guards a published word, whose clip is live in the game", () => {
    expect(needsRedoConfirm("published")).toBe(true);
  });

  it("does not guard an unprocessed take or a word never recorded", () => {
    expect(needsRedoConfirm("recorded")).toBe(false);
    expect(needsRedoConfirm("pending")).toBe(false);
  });
});

describe("afterTake", () => {
  it("advances and stays armed through the pending list", () => {
    expect(afterTake("pending")).toEqual({ advance: true, armed: true });
    expect(afterTake("recorded")).toEqual({ advance: true, armed: true });
  });

  it("stops and pauses after replacing a published clip", () => {
    expect(afterTake("published")).toEqual({ advance: false, armed: false });
  });
});

describe("a paused detector", () => {
  // The pause in `Recorder.tsx` is two things: the frame sink returns before
  // reaching the detector, AND the detector is disarmed. This pins the second
  // — the half that still holds if the sink's early return is ever refactored
  // away — against exactly the input a pause exists to ignore: loud, voiced
  // frames, for longer than a take.
  it("captures nothing from loud voiced frames", () => {
    const detector = new TakeDetector();
    detector.arm();
    detector.disarm();
    for (let ms = 0; ms <= 2000; ms += 10) {
      expect(detector.push(ms, true, 0.6)).toBeNull();
    }
    expect(detector.isRecording).toBe(false);
  });

  it("captures again once re-armed", () => {
    const detector = new TakeDetector();
    detector.disarm();
    detector.arm();
    expect(detector.push(0, true, 0.4)).toEqual({ type: "onset", atMs: 0 });
  });
});
