import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeWav } from "./wav.ts";
import {
  MEASURE_RANGE_SEMITONES,
  PAD_MS,
  measureContour,
  measurePitchReference,
  type ContourPoint,
} from "./clipCut.ts";
import { SEED_F0_CENTER } from "./clipPipeline.ts";
import { multiSyllablePolyline, multiSyllableSpan } from "./clipCutMulti.ts";
import { cutClip } from "./clipCut.ts";
import { corridorChaoAt, shapeForWord } from "../game/gates.ts";
import reference from "./tonePairPolylines.json" with { type: "json" };

const root = new URL("../../", import.meta.url).pathname;

/**
 * The Lab's `tonepairs:generate` pads its crop by 80ms either side before
 * reporting `durationMs`; `multiSyllableSpan` reports the unpadded voiced
 * span. Comparing like for like is what makes this a port check rather than
 * a new number.
 */
const LAB_PAD_MS = 80;

/** The four fixtures, all Jane, all 3+2. Traditional hanzi. */
const FIXTURES = [
  { id: "haowan", file: "hao_wan.wav", hanzi: "好玩", runs: 1 },
  { id: "meiguo", file: "mei_guo.wav", hanzi: "美國", runs: 1 },
  { id: "xiaoshi", file: "xiao_shi.wav", hanzi: "小時", runs: 2 },
  { id: "yiqian", file: "yi_qian.wav", hanzi: "以前", runs: 2 },
] as const;

function fixture(file: string) {
  const { sampleRate, samples } = decodeWav(
    new Uint8Array(readFileSync(`${root}fixtures/tonepairs/wav/${file}`)),
  );
  const measured = measurePitchReference([{ samples, sampleRate }], SEED_F0_CENTER);
  return { sampleRate, samples, f0Center: measured?.f0Center ?? SEED_F0_CENTER };
}

function labDurationMs(id: string): number {
  const row = reference.words.find((w) => w.id === id);
  if (!row) throw new Error(`no reference row for ${id}`);
  return row.durationMs;
}

describe("multiSyllableSpan", () => {
  for (const f of FIXTURES) {
    it(`${f.id} (${f.hanzi}) spans the same window the Lab measured`, () => {
      const { samples, sampleRate, f0Center } = fixture(f.file);
      const span = multiSyllableSpan(samples, sampleRate, f0Center, 2);
      expect(span).not.toBeNull();
      const ms = ((span!.end - span!.start) / sampleRate) * 1000;
      expect(Math.abs(ms - (labDurationMs(f.id) - 2 * LAB_PAD_MS))).toBeLessThan(30);
    });

    it(`${f.id} (${f.hanzi}) returns one run per syllable, flagging where voicing did not`, () => {
      const { samples, sampleRate, f0Center } = fixture(f.file);
      const span = multiSyllableSpan(samples, sampleRate, f0Center, 2)!;
      // Always exactly `syllables` runs — the polyline builder needs a
      // boundary per syllable whether or not the speaker gave it a pause.
      expect(span.runs.length).toBe(2);
      // ...but the flag records which fixtures needed the energy-dip split.
      expect(span.underSegmented).toBe(f.runs < 2);
      expect(span.overSegmented).toBe(false);
      // Runs are ordered, disjoint and inside the span.
      expect(span.runs[0].start).toBeGreaterThanOrEqual(span.start);
      expect(span.runs[0].end).toBeLessThan(span.runs[1].start);
      expect(span.runs[1].end).toBeLessThanOrEqual(span.end);
    });
  }

  it("returns null on silence", () => {
    expect(multiSyllableSpan(new Float32Array(44100), 44100, 168, 2)).toBeNull();
  });

  it("keeps the `syllables` longest runs and flags over-segmentation", () => {
    const { samples, sampleRate, f0Center } = fixture("xiao_shi.wav");
    const span = multiSyllableSpan(samples, sampleRate, f0Center, 1)!;
    expect(span.runs.length).toBe(1);
    expect(span.overSegmented).toBe(true);
  });
});

/**
 * The measurement Task 1.3 folds into `cutClip`, inlined here so this file
 * tests the two new functions rather than the branch that will call them.
 */
function measureFixture(file: string) {
  const { samples, sampleRate, f0Center } = fixture(file);
  const span = multiSyllableSpan(samples, sampleRate, f0Center, 2)!;
  const pad = (PAD_MS / 1000) * sampleRate;
  const a = Math.max(0, Math.round(span.start - pad));
  const b = Math.min(samples.length - 1, Math.round(span.end + pad));
  const cropped = samples.slice(a, b + 1);
  const { contour } = measureContour(cropped, sampleRate, f0Center, MEASURE_RANGE_SEMITONES);
  const toT = (s: number) => (s - a) / cropped.length;
  const spans = span.runs.map((r) => [toT(r.start), toT(r.end)] as [number, number]);
  return { contour, spans, polyline: multiSyllablePolyline(contour, spans) };
}

/** Reads the polyline the way a gate does, through the real spline evaluator. */
function corridor(polyline: ContourPoint[]) {
  const shape = shapeForWord({ tone: 3, polyline, durationS: 1 });
  return (t: number) => corridorChaoAt(shape, t);
}

/**
 * Comfortably inside the tightest corridor the difficulty ramp ever draws
 * (0.07H, about 0.47 chao) — so a player who reproduces the recording exactly
 * is still centred at the hardest setting, not scraping a wall. The four
 * fixtures measure 0.15 / 0.30 / 0.31 / 0.21 chao.
 */
const MAX_CORRIDOR_ERROR_CHAO = 0.35;

describe("multiSyllablePolyline", () => {
  for (const f of FIXTURES) {
    it(`${f.id} (${f.hanzi}) tracks its own measured contour`, () => {
      const { contour, polyline } = measureFixture(f.file);
      const at = corridor(polyline);
      let worst = 0;
      for (const [t, chao] of contour) worst = Math.max(worst, Math.abs(at(t) - chao));
      expect(worst).toBeLessThan(MAX_CORRIDOR_ERROR_CHAO);
    });

    it(`${f.id} (${f.hanzi}) invents no pitch between the syllables`, () => {
      const { spans, polyline } = measureFixture(f.file);
      const [, gapStart] = spans[0];
      const [gapEnd] = spans[1];
      // No node inside the pause: there is no measurement there to place one
      // from, and the monotone spline bridges it without overshoot.
      // `1e-3` because node times are rounded to 4dp, so a boundary node can
      // land a hair inside its own boundary.
      expect(
        polyline.filter((p) => p[0] > gapStart + 1e-3 && p[0] < gapEnd - 1e-3),
      ).toEqual([]);

      // ...and the bridge is monotone, so the corridor never doubles back
      // through a stretch the speaker was silent for.
      const at = corridor(polyline);
      const samples = Array.from({ length: 24 }, (_, i) =>
        at(gapStart + ((gapEnd - gapStart) * i) / 23),
      );
      const rising = samples[samples.length - 1] >= samples[0];
      for (let i = 1; i < samples.length; i++) {
        expect(rising ? samples[i] - samples[i - 1] : samples[i - 1] - samples[i]).toBeGreaterThanOrEqual(-1e-9);
      }
    });

    it(`${f.id} (${f.hanzi}) spans the whole gate`, () => {
      const { polyline } = measureFixture(f.file);
      expect(polyline[0][0]).toBe(0);
      expect(polyline[polyline.length - 1][0]).toBe(1);
    });
  }

  it("keeps a bend its own extrema would miss", () => {
    // `wán` in `hǎowán`: level, then a rise. The interior minimum and maximum
    // both sit on the chord from start to end, so selecting extrema drops
    // both nodes and draws a ramp through a shape that does not ramp. The
    // plateau is 0.5 chao off that ramp — three quarters of base tolerance.
    const contour: ContourPoint[] = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return [t, t < 0.5 ? 3 : 3 + (t - 0.5) * 4] as ContourPoint;
    });
    const polyline = multiSyllablePolyline(contour, [[0, 1]]);
    const at = corridor(polyline);
    expect(Math.abs(at(0.35) - 3)).toBeLessThan(MAX_CORRIDOR_ERROR_CHAO);
  });

  it("gives a monotone syllable no interior node", () => {
    const contour: ContourPoint[] = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return [t, 4 - t * 2] as ContourPoint;
    });
    expect(multiSyllablePolyline(contour, [[0, 1]]).length).toBe(2);
  });

  it("returns nothing for an empty contour", () => {
    expect(multiSyllablePolyline([], [[0, 1]])).toEqual([]);
  });
});

describe("cutClip's syllables branch", () => {
  for (const f of FIXTURES) {
    it(`${f.id} (${f.hanzi}) comes back measured, with its own polyline`, () => {
      const { samples, sampleRate, f0Center } = fixture(f.file);
      const cut = cutClip(samples, sampleRate, f0Center, MEASURE_RANGE_SEMITONES, 3, 2);
      // The three clocks, still three: the clip carries lead-in the tone
      // window does not, and neither is the source's length.
      expect(cut.durationMs).toBeGreaterThan(1400);
      expect(cut.samples.length / sampleRate * 1000).toBeGreaterThanOrEqual(cut.durationMs - 1);
      expect(cut.sourceMs).toBeGreaterThan(cut.durationMs);
      expect(cut.polyline!.length).toBeGreaterThanOrEqual(4);
      expect(cut.polyline![0][0]).toBe(0);
      expect(cut.polyline![cut.polyline!.length - 1][0]).toBe(1);
      expect(cut.underSegmented).toBe(f.runs < 2);
      expect(cut.overSegmented).toBe(false);

      const at = corridor(cut.polyline!);
      let worst = 0;
      for (const [t, chao] of cut.contour) worst = Math.max(worst, Math.abs(at(t) - chao));
      expect(worst).toBeLessThan(MAX_CORRIDOR_ERROR_CHAO);
    });
  }

  it("leaves the single-syllable path alone", () => {
    const { samples, sampleRate, f0Center } = fixture("xiao_shi.wav");
    const one = cutClip(samples, sampleRate, f0Center, MEASURE_RANGE_SEMITONES, 2);
    // No polyline and no segmentation flags: the single path is untouched and
    // its caller still builds the shape with `templateContour`.
    expect(one.polyline).toBeUndefined();
    expect(one.underSegmented).toBeUndefined();
    // And it measures one syllable, not the word: `longestVoicedRun` keeps
    // the longer side of 小時's 235ms pause and discards the other.
    const two = cutClip(samples, sampleRate, f0Center, MEASURE_RANGE_SEMITONES, 2, 2);
    expect(one.durationMs).toBeLessThan(two.durationMs * 0.6);
  });
});
