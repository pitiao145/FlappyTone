import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cutClip, measurePitchReference, simplifyContour, MAX_ONSET_MS, type ContourPoint } from "./clipCut.ts";
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

describe("simplifyContour", () => {
  it("spans the whole gate, holding the first and last measured value", () => {
    // Voicing starts after the clip does and stops before it ends. A corridor
    // that stopped where the voicing did would have no wall at either end.
    const contour: ContourPoint[] = [
      [0.12, 4.4],
      [0.5, 4.4],
      [0.88, 4.4],
    ];
    const poly = simplifyContour(contour);
    expect(poly[0]).toEqual([0, 4.4]);
    expect(poly[poly.length - 1]).toEqual([1, 4.4]);
  });

  it("stays inside the vertex budget", () => {
    // Noise on top of a rise: every frame is a corner, none of them is shape.
    const poly = simplifyContour(
      contourOf((t) => 2 + 3 * t + Math.sin(t * 97) * 0.05),
    );
    expect(poly.length).toBeLessThanOrEqual(8);
  });

  it("spends its vertices on the shape, not on the flat", () => {
    // A T4: plateau to 0.6, then a cliff. The cliff must survive.
    const poly = simplifyContour(contourOf((t) => (t < 0.6 ? 5 : 5 - ((t - 0.6) / 0.35) * 4)));
    expect(chaoAt(poly, 0.3)).toBeCloseTo(5, 1);
    expect(chaoAt(poly, 0.55)).toBeGreaterThan(4.5);
    expect(chaoAt(poly, 0.95)).toBeLessThan(1.5);
  });

  it("keeps a T3 dip and the rise after it", () => {
    const poly = simplifyContour(
      contourOf((t) => (t < 0.5 ? 3 - t * 3.5 : 1.25 + Math.max(0, t - 0.7) * 12)),
    );
    expect(chaoAt(poly, 0.5)).toBeLessThan(1.6);
    expect(chaoAt(poly, 1)).toBeGreaterThan(4);
  });

  it("reduces a flat tone to a flat line", () => {
    const poly = simplifyContour(contourOf(() => 4.6));
    expect(poly.length).toBeLessThanOrEqual(3);
    for (const [, chao] of poly) expect(chao).toBeCloseTo(4.6, 3);
  });

  it("returns nothing for an empty contour rather than inventing a wall", () => {
    expect(simplifyContour([])).toEqual([]);
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
