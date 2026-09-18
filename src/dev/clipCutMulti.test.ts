import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeWav } from "./wav.ts";
import { measurePitchReference } from "./clipCut.ts";
import { SEED_F0_CENTER } from "./clipPipeline.ts";
import { multiSyllableSpan } from "./clipCutMulti.ts";
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
