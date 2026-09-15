/**
 * Pins the pipeline's seed — the line the Task 12 regression check caught, and
 * the one nothing else guards.
 *
 * `SEED_F0_CENTER` does not look load-bearing. It is only where the pitch
 * search starts, and `measurePitchReference` recentres off the session's own
 * frames afterwards, so a reader is very likely to "tidy" it into reading
 * `speakers.json` again, or deriving it from the catalog. Measured, that
 * second option moves 90 of the 120 shipped polylines in the third decimal.
 *
 * Asserting the number alone would be a tautology a refactor could carry along
 * with it, so the golden cut below asserts the CONSEQUENCE: the four committed
 * `fixtures/anchors/ma*.wav` cut at this seed, to the values they produce
 * today. Those four files are the only committed audio this can be pinned
 * against — `fixtures/recordings/` is gitignored on purpose (the takes are
 * re-pullable evidence, not an artefact), so a fixture from a real session is
 * not available to a test.
 *
 * If this fails, the measurement moved. Do not update the numbers to make it
 * pass: re-cut the whole inventory with `npm run process-clips -- --all` and
 * re-run the regression check in the Task 12 report, or put the seed back.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { MEASURE_RANGE_SEMITONES, cutClip, templateContour } from "./clipCut.ts";
import { MIN_REFERENCE_FRAMES, SEED_F0_CENTER } from "./clipPipeline.ts";
import { decodeWav } from "./wav.ts";
import speakers from "../../fixtures/captures/speakers.json" with { type: "json" };

const root = new URL("../../", import.meta.url).pathname;

describe("SEED_F0_CENTER", () => {
  it("is the value the old pipeline used", () => {
    // `make-clips.ts` read this out of speakers.json. The constant is not an
    // import of it — the seed is a property of the pipeline now, not of a
    // speaker — but it must still be the same number, or every shipped
    // corridor moves.
    expect(SEED_F0_CENTER).toBe(168);
    expect((speakers as Record<string, number>).jane).toBe(SEED_F0_CENTER);
  });
});

describe("MIN_REFERENCE_FRAMES", () => {
  it("is Decision 9's threshold", () => {
    expect(MIN_REFERENCE_FRAMES).toBe(400);
  });
});

/**
 * What the four anchors cut to at this seed. Regenerated only alongside a
 * deliberate, reported re-cut of the inventory.
 *
 * `onsetMs` here is `toneStartMs` — the offset into the source take, which is
 * what `process-clips` writes to `onset_s`. Three clocks, and this is the
 * middle one; `clipMs` is the whole file and `durationMs` the tone window.
 * `ma2`, `ma3` and `ma4` all have `clipMs > onsetMs + durationMs`, which is
 * the distinction itself, asserted below.
 */
const GOLDEN = {
  1: { durationMs: 879.3542, onsetMs: 0, clipMs: 879.3542, frames: 37, poly: [[0, 3.528], [1, 3.528]] },
  2: { durationMs: 1069.0208, onsetMs: 0, clipMs: 1071.3542, frames: 46, poly: [[0, 2.996], [0.2794, 2.611], [1, 3.896]] },
  3: { durationMs: 1306.0208, onsetMs: 19, clipMs: 1327.3542, frames: 58, poly: [[0, 2.74], [0.5554, 2.394], [0.7841, 2.95], [1, 4.516]] },
  4: { durationMs: 599.6875, onsetMs: 0, clipMs: 602.0208, frames: 24, poly: [[0, 3.88], [0.3913, 4.847], [1, 2.404]] },
} as const;

describe("the anchors, cut at the seed", () => {
  for (const tone of [1, 2, 3, 4] as const) {
    it(`ma${tone} cuts to the values the pipeline ships`, () => {
      const { samples, sampleRate } = decodeWav(
        new Uint8Array(readFileSync(`${root}fixtures/anchors/ma${tone}.wav`)),
      );
      const cut = cutClip(samples, sampleRate, SEED_F0_CENTER, MEASURE_RANGE_SEMITONES, tone);
      const golden = GOLDEN[tone];

      expect(cut.durationMs).toBeCloseTo(golden.durationMs, 3);
      expect(cut.toneStartMs).toBeCloseTo(golden.onsetMs, 3);
      expect(cut.sourceMs).toBeCloseTo(golden.clipMs, 3);
      // The frame count is what actually moves when the seed does: a shifted
      // search band voices or unvoices frames at the edges, and every chao
      // value downstream follows.
      expect(cut.contour.length).toBe(golden.frames);
      expect(templateContour(tone, cut.contour)).toEqual(golden.poly);
    });
  }

  it("keeps the three clocks apart on the anchors themselves", () => {
    for (const tone of [2, 3, 4] as const) {
      const g = GOLDEN[tone];
      expect(g.clipMs, `ma${tone}`).toBeGreaterThan(g.onsetMs + g.durationMs);
    }
  });
});
