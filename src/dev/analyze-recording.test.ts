// The cue/player classifier is the load-bearing part of the recording
// analyzer: if a reference playback is read as a player attempt, every
// conclusion drawn from a playtest inverts. These tests pin it against the
// real clips and the real captures.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadRefProfiles, matchRef, track } from "./analyze-recording.ts";
import { decodeWav } from "./wav.ts";

const JANE_F0 = 168;

function profileOf(path: string, f0Center: number) {
  const { samples, sampleRate } = decodeWav(readFileSync(path));
  const frames = track(samples, sampleRate, f0Center);
  const voiced = frames.filter((f) => f.voiced && f.f0 !== null);
  const f0s = voiced.map((f) => f.f0!);
  const sorted = [...f0s].sort((a, b) => a - b);
  return {
    f0s,
    medianF0: sorted[Math.floor(sorted.length / 2)],
    durMs: voiced[voiced.length - 1].tMs - voiced[0].tMs,
  };
}

describe("cue classifier", () => {
  const profiles = loadRefProfiles(JANE_F0);

  it("profiles all four anchor clips", () => {
    expect(profiles.map((p) => p.tone).sort()).toEqual([1, 2, 3, 4]);
  });

  for (const tone of [1, 2, 3, 4]) {
    it(`matches anchor clip ma${tone} to itself`, () => {
      const p = profileOf(`fixtures/anchors/ma${tone}.wav`, JANE_F0);
      const match = matchRef(p.f0s, p.medianF0, p.durMs, profiles);
      expect(match?.tone).toBe(tone);
    });
  }

  // The player-voice negative cases (five tests) were removed on 9 Aug 2026
  // with the pierre_* captures. The classifier's false-positive behaviour —
  // mistaking a real attempt for the game's own cue, and discarding it — is
  // now unguarded. Re-record a non-native voice to restore it.

  // Jane's original captures are the *source* of the clips but not the cut
  // takes, so they may or may not match. What must hold is that the
  // classifier never throws on them.
  it("handles Jane's source captures without error", () => {
    for (const name of ["jane_ma1", "jane_ma3_natural"]) {
      const p = profileOf(`fixtures/captures/${name}.wav`, JANE_F0);
      expect(() => matchRef(p.f0s, p.medianF0, p.durMs, profiles)).not.toThrow();
    }
  });
});
