import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cutClip, measurePitchReference, templateContour, MAX_ONSET_MS, type ContourPoint } from "./clipCut.ts";
import { decodeWav } from "./wav.ts";

const root = new URL("../../", import.meta.url).pathname;

function capture(name: string) {
  return decodeWav(new Uint8Array(readFileSync(`${root}fixtures/captures/${name}.wav`)));
}

/**
 * The two takes the onset behaviour is pinned against, committed because the
 * rest of `fixtures/captures/` cannot cover this: every `jane_ma*` take is a
 * nasal onset, which is voiced throughout and so exercises none of the backoff.
 * `jane_chang2` is the bug case (an aspirated affricate the cutter used to
 * discard, leaving "hang"); `jane_ba1` is the control that must gain nothing.
 */
function recording(id: string) {
  return capture(`jane_${id}`);
}

/** That session's own measured f0Center — see manifest.json's `sessions`. */
const JANE_SESSION_F0 = 201.4;

function contourOf(f: (t: number) => number, n = 45): ContourPoint[] {
  return Array.from({ length: n }, (_, i) => [i / (n - 1), f(i / (n - 1))] as ContourPoint);
}

/** Reads a polyline the way `corridorChaoAt` does, so the tests ask what the wall asks. */
function chaoAt(poly: ContourPoint[], t: number): number {
  for (let i = 0; i < poly.length - 1; i++) {
    if (t >= poly[i][0] && t <= poly[i + 1][0]) {
      const span = poly[i + 1][0] - poly[i][0];
      const f = span === 0 ? 0 : (t - poly[i][0]) / span;
      return poly[i][1] + f * (poly[i + 1][1] - poly[i][1]);
    }
  }
  return poly[poly.length - 1][1];
}

describe("templateContour", () => {
  it("spans the whole gate, holding the first measured value at t=0", () => {
    // Voicing starts after the clip does. A corridor that started where the
    // voicing did would have no wall at the front.
    const contour: ContourPoint[] = [
      [0.12, 4.4],
      [0.5, 4.4],
      [0.88, 4.4],
    ];
    const poly = templateContour(1, contour);
    expect(poly[0]).toEqual([0, 4.4]);
  });

  it("gives every tone its fixed node count", () => {
    expect(templateContour(1, contourOf(() => 4.6)).length).toBe(2);
    expect(
      templateContour(2, contourOf((t) => (t < 0.3 ? 3 - t * 3 : 2 + (t - 0.3) * 4))).length,
    ).toBe(3);
    expect(
      templateContour(
        3,
        contourOf((t) => (t < 0.5 ? 3 - t * 3.5 : 1.25 + Math.max(0, t - 0.7) * 12)),
      ).length,
    ).toBe(4);
    expect(
      templateContour(4, contourOf((t) => (t < 0.6 ? 5 : 5 - ((t - 0.6) / 0.35) * 4))).length,
    ).toBe(3);
  });

  it("reduces a flat tone to a flat line, even a wobbly one", () => {
    const poly = templateContour(1, contourOf((t) => 4.45 + Math.sin(t * 97) * 0.06));
    expect(poly.length).toBe(2);
    expect(poly[0][1]).toBeCloseTo(poly[1][1], 3);
  });

  it("puts T2's interior node on the real dip and holds the peak, not the release", () => {
    // Rises to a peak at t=0.8, then releases back down — the release is not
    // part of the tone and must not be modelled.
    const poly = templateContour(
      2,
      contourOf((t) => (t < 0.3 ? 3 - t * 4 : t < 0.8 ? 1.8 + (t - 0.3) * 6.4 : 5 - (t - 0.8) * 5)),
    );
    expect(poly.length).toBe(3);
    expect(chaoAt(poly, 0.3)).toBeLessThan(2.5);
    expect(poly[2][0]).toBe(1);
    expect(poly[2][1]).toBeGreaterThan(4.5);
  });

  it("keeps a T3 dip and the rise after it, with a real sample as the mid-rise node", () => {
    // A slight downward slope through the "floor" (real contours never hold
    // an exact tie) so the true minimum sits near where the rise begins.
    const contour = contourOf((t) =>
      t < 0.5 ? 3 - t * 3.5 : t < 0.7 ? 1.25 - (t - 0.5) * 0.1 : 1.23 + (t - 0.7) * 12,
    );
    const poly = templateContour(3, contour);
    expect(poly.length).toBe(4);
    expect(poly[1][1]).toBeLessThan(1.6); // the min node itself
    expect(chaoAt(poly, 1)).toBeGreaterThan(4);
    // The mid-rise node is an actual measured sample, not an invented point.
    expect(
      contour.some(([t, c]) => Math.abs(t - poly[2][0]) < 1e-3 && Math.abs(c - poly[2][1]) < 1e-3),
    ).toBe(true);
  });

  it("holds T4's floor rather than any recovery after it", () => {
    const poly = templateContour(
      4,
      contourOf((t) => (t < 0.6 ? 5 : t < 0.9 ? 5 - ((t - 0.6) / 0.3) * 4 : 1 + (t - 0.9) * 3)),
    );
    expect(poly.length).toBe(3);
    expect(poly[2][0]).toBe(1);
    expect(poly[2][1]).toBeLessThan(1.5);
  });

  it("ignores an edge spike when hunting for the real extremum", () => {
    // A loud onset spike right at t=0 must not be picked over the real dip.
    const poly = templateContour(
      2,
      contourOf((t) => (t < 0.03 ? 0.5 : t < 0.3 ? 3 - t * 2 : 2.4 + (t - 0.3) * 4)),
    );
    expect(poly[1][1]).toBeGreaterThan(1);
  });

  it("returns nothing for an empty contour rather than inventing a wall", () => {
    expect(templateContour(1, [])).toEqual([]);
  });
});

describe("measurePitchReference", () => {
  it("measures the speaker's centre from the takes, not from the seed", () => {
    // jane_ma1 is a level tone at ~212Hz; the seed is deliberately far off.
    const ma1 = capture("jane_ma1");
    const ref = measurePitchReference([ma1], 120);
    expect(ref).not.toBeNull();
    expect(ref!.f0Center).toBeGreaterThan(195);
    expect(ref!.f0Center).toBeLessThan(230);
  });

  it("returns null on a capture too sparse to say anything", () => {
    const silence = { samples: new Float32Array(48000), sampleRate: 48000 };
    expect(measurePitchReference([silence], 200)).toBeNull();
  });

  it("does not change what cutClip cuts", () => {
    // The reference sets the pitch scale, not the segmentation: the anchors are
    // committed audio and a range argument must never move their bytes.
    const { samples, sampleRate } = capture("jane_ma4");
    const a = cutClip(samples, sampleRate, 168);
    const b = cutClip(samples, sampleRate, 168, 15);
    expect(b.samples.length).toBe(a.samples.length);
    expect(b.durationMs).toBeCloseTo(a.durationMs, 6);
  });
});

describe("consonant onset", () => {
  // chang2's affricate runs from ~85ms to ~256ms at rms 0.006-0.0135, against
  // a room floor of 0.0008, and carries no voicing at all. Cutting at the
  // vowel throws it away and the clip sounds like "hang".
  it("keeps the aspirated onset of chang2", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeGreaterThan(100);
    expect(cut.onsetMs).toBeLessThanOrEqual(MAX_ONSET_MS);
  });

  // ba1's stop burst is inside the 45ms pad already, and the 250ms before it
  // is genuine silence (rms 0.0009 == the floor). Walking back must stop
  // immediately rather than dragging room tone in.
  it("takes nothing extra from ba1, which is silent before the vowel", () => {
    const { samples, sampleRate } = recording("ba1");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeLessThan(30);
  });

  // The tone window is what the corridor is measured over. Extending the audio
  // must not move it, or every shipped polyline and duration shifts.
  it("does not change the tone window", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    // 1.007s is the duration the shipped manifest already records for chang2.
    expect(cut.durationMs).toBeCloseTo(1007, -1);
  });

  it("returns audio long enough to hold both windows", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    const totalMs = (cut.samples.length / sampleRate) * 1000;
    expect(totalMs).toBeCloseTo(cut.onsetMs + cut.durationMs, -1);
  });
});

describe("the source-relative offsets", () => {
  // `make-clips` ships the take itself and never touches `cut.samples`, so the
  // tone window has to be located in the *file*, not in the cut. These two
  // fields are the only thing carrying that, and getting them wrong points the
  // demo dot and the world freeze at the wrong part of the audio.
  it("reports where the tone window sits in the source", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    // The cut drops the lead-in; the difference between the two onsets is
    // exactly what it dropped, so the file-relative one is never the smaller.
    expect(cut.toneStartMs).toBeGreaterThanOrEqual(cut.onsetMs);
    expect(cut.sourceMs).toBeCloseTo((samples.length / sampleRate) * 1000, 6);
    // Everything after the tone window still fits inside the take.
    expect(cut.toneStartMs + cut.durationMs).toBeLessThanOrEqual(cut.sourceMs + 1);
  });

  // ba1 begins with ~250ms of genuine silence. That silence is in the shipped
  // clip now, and the dot must hold through it rather than starting at t=0.
  it("counts the lead-in silence even where the onset takes nothing", () => {
    const { samples, sampleRate } = recording("ba1");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeLessThan(30);
    expect(cut.toneStartMs).toBeGreaterThan(100);
  });
});
