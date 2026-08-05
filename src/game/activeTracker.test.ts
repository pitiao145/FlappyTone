import { afterEach, expect, test } from "vitest";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import {
  getActiveTracker,
  getLiveState,
  publishState,
  setActiveTracker,
} from "./activeTracker.ts";

afterEach(() => setActiveTracker(null));

test("the most recently registered tracker is the active one", () => {
  const a = new PitchTracker({ sampleRate: 44100 });
  const b = new PitchTracker({ sampleRate: 44100 });
  setActiveTracker(a);
  expect(getActiveTracker()).toBe(a);
  setActiveTracker(b);
  expect(getActiveTracker()).toBe(b);
});

test("deregistering clears both the tracker and its last frame", () => {
  setActiveTracker(new PitchTracker({ sampleRate: 44100 }));
  publishState({
    f0: 150,
    clarity: 0.9,
    rms: 0.02,
    voiced: true,
    semitones: 0,
    chao: 3,
    smoothedChao: 3,
  });
  expect(getLiveState()?.f0).toBe(150);
  setActiveTracker(null);
  expect(getActiveTracker()).toBeNull();
  // A stale readout is worse than no readout: it looks like the mic is live.
  expect(getLiveState()).toBeNull();
});
