/**
 * The seam between the cutter and the game.
 *
 * `make-clips` writes `public/ref/manifest.json` and `loadWords` reads it, and
 * nothing else connects them — a field renamed on one side would show up as an
 * empty inventory at runtime, which degrades silently to the tuning defaults
 * and looks exactly like the game working. So the shipped file is checked
 * against the real parser here.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { loadWords } from "../game/words.ts";
import { shapeForWord } from "../game/gates.ts";
import { decodeWav } from "./wav.ts";

const root = new URL("../../", import.meta.url).pathname;
const manifestPath = `${root}public/ref/manifest.json`;

describe("the shipped manifest", () => {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const words = loadWords(raw);

  it("parses every clip — none dropped by validation", () => {
    expect(words.length).toBe(raw.clips.length);
    expect(words.length).toBeGreaterThan(0);
  });

  it("carries an English gloss for every word", () => {
    // The HUD reads `word.english`; a gloss that stops at the glossary and
    // never reaches the manifest is invisible rather than broken.
    for (const w of words) expect(w.english, w.id).not.toBe("");
  });

  it("covers all four tones", () => {
    expect([...new Set(words.map((w) => w.tone))].sort()).toEqual([1, 2, 3, 4]);
  });

  it("points at audio that is actually there", () => {
    for (const w of words) {
      expect(existsSync(`${root}public/ref/${w.file}`), w.file).toBe(true);
    }
  });

  it("ships no clip the manifest does not list", () => {
    // An orphan is a file the game can never cue, and usually the trace of an
    // id that moved — which relabels audio that is already recorded.
    const listed = new Set(words.map((w) => w.file));
    const onDisk = readdirSync(`${root}public/ref`).filter((f) => f.endsWith(".wav"));
    expect(onDisk.filter((f) => !listed.has(f))).toEqual([]);
  });

  it("carries an onset for every word", () => {
    // The field crossing the cutter/game seam. If make-clips stops writing it
    // or loadWords stops reading it, every clip silently reverts to starting
    // at the vowel — which is audible but not detectable from the code.
    //
    // Bounded by the file, not by the tone window: since the clips became the
    // raw takes, seven of these words have more audio in front of the tone than
    // the tone itself lasts, and the old `< durationS` bound zeroed exactly
    // those.
    for (const w of words) {
      expect(Number.isFinite(w.onsetS), w.id).toBe(true);
      expect(w.onsetS, w.id).toBeGreaterThanOrEqual(0);
      expect(w.onsetS, w.id).toBeLessThan(w.clipS);
    }
  });

  it("gives every word a file longer than the tone inside it", () => {
    // The third clock. `clipS` is what freezes the world and what `isCueAudible`
    // counts down, so a manifest where it collapses back onto the tone window
    // would re-open the mic while the cue's own tail is still playing.
    for (const w of words) {
      expect(w.clipS, w.id).toBeGreaterThanOrEqual(w.onsetS + w.durationS);
      expect(w.clipS, w.id).toBeLessThanOrEqual(3);
    }
  });

  it("restores the consonant on the aspirated onsets", () => {
    // The bug this field exists for: cut on voicing alone, chang2 said "hang".
    // These four were measured at 149-171ms of pre-voicing sound.
    for (const id of ["chang2", "chi1", "qi1", "shou3"]) {
      const w = words.find((x) => x.id === id)!;
      expect(w.onsetS, id).toBeGreaterThan(0.08);
    }
  });

  it("ships the whole take, at the length the manifest claims", () => {
    // The clip is the recording now — nothing is cut out of it — so `clipS` and
    // the file on disk are two statements of one fact and must agree. A drift
    // here is the cue and the world freeze coming apart by however much the
    // cutter dropped.
    for (const w of words) {
      const { samples, sampleRate } = decodeWav(
        new Uint8Array(readFileSync(`${root}public/ref/${w.file}`)),
      );
      expect(samples.length / sampleRate, w.id).toBeCloseTo(w.clipS, 3);
    }
  });

  it("gives every word a corridor that spans the whole gate", () => {
    for (const w of words) {
      const { polyline } = shapeForWord(w);
      expect(polyline[0][0], w.id).toBe(0);
      expect(polyline[polyline.length - 1][0], w.id).toBe(1);
      for (const [t, chao] of polyline) {
        expect(t, w.id).toBeGreaterThanOrEqual(0);
        expect(t, w.id).toBeLessThanOrEqual(1);
        expect(chao, w.id).toBeGreaterThanOrEqual(1);
        expect(chao, w.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it("keeps the corridor to a handful of vertices", () => {
    // A wall with 45 corners in it is measurement noise the player collides
    // with; it also makes the Lab's shape editor unusable.
    for (const w of words) expect(w.polyline.length, w.id).toBeLessThanOrEqual(8);
  });

  it("puts each tone where the tone mark says, not where she sang it", () => {
    // The normalisation in clipNormalize.ts, asserted end to end: a T1 corridor
    // is high and flat, a T4 starts high and ends low. Measured against her own
    // voice and left there, T1 lands at chao ~3.3.
    for (const w of words.filter((x) => x.tone === 1)) {
      // The level it *holds*, from t=0.3 on. A few takes ramp into the tone
      // over the first ~100ms (an aspirated onset — `kai1` climbs 2.7 → 4.3);
      // the review flags those for a human, and the ramp stays in the corridor
      // because it is what she said.
      const held = w.polyline.filter((p) => p[0] >= 0.3).map((p) => p[1]);
      expect(Math.min(...held), w.id).toBeGreaterThan(3.8);
    }
    for (const w of words.filter((x) => x.tone === 4)) {
      // Reaches the top and ends at the bottom. Not "starts at the top": after
      // a nasal onset her pitch climbs into the peak (`ma4b` opens at 3.1 and
      // reaches 5.0 by t=0.46), and that rise is measured, not invented.
      const chaos = w.polyline.map((p) => p[1]);
      expect(Math.max(...chaos), w.id).toBeGreaterThan(4);
      expect(chaos[chaos.length - 1], w.id).toBeLessThan(2.5);
    }
  });
});
