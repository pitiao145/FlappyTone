import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cutClip, measurePitchReference, simplifyContour, type ContourPoint } from "./clipCut.ts";
import { decodeWav } from "./wav.ts";

const root = new URL("../../", import.meta.url).pathname;

function capture(name: string) {
  return decodeWav(new Uint8Array(readFileSync(`${root}fixtures/captures/${name}.wav`)));
}

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
