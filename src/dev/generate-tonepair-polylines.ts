// CLI, exploration-only: measures the four `fixtures/tonepairs/wav/*.wav`
// recordings and writes their raw pitch contours to
// `src/dev/tonePairPolylines.json`, for the Lab's "tonepairs" tab to draw.
//
// The span comes from `clipCutMulti.ts` now — the same `multiSyllableSpan`
// the real pipeline uses — rather than the bespoke copy this file used to
// carry. There is one multi-syllable measurement, and this is a reader of
// it, not a second implementation of it.
//
// Usage: node --experimental-strip-types src/dev/generate-tonepair-polylines.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { multiSyllableSpan } from "./clipCutMulti.ts";
import {
  MEASURE_RANGE_SEMITONES,
  measureContour,
  measurePitchReference,
  resampleContour,
} from "./clipCut.ts";
import { SEED_F0_CENTER } from "./clipPipeline.ts";
import { decodeWav, encodeWav } from "./wav.ts";

/**
 * These are Jane's takes (same voice as every shipped single-syllable clip),
 * so this reuses her real pipeline constants rather than re-deriving a
 * per-file f0Center/range: seeded at `SEED_F0_CENTER` (168, her
 * `speakers.f0_seed`) and measured at `MEASURE_RANGE_SEMITONES` (±15,
 * deliberately wider than any voice so a real excursion isn't clipped before
 * `clipNormalize` places it — see clipCut.ts). Using the tracker's narrower
 * default range instead (±5) would pin these contours against 1/5 more
 * aggressively than the shipped single-syllable corridors ever are.
 */

const PAD_MS = 80;
const POLYLINE_POINTS = 48;

interface Fixture {
  id: string;
  file: string;
  hanzi: string;
  pinyin: string;
  /** Citation tones, read off the pinyin — not yet sandhi-adjusted. */
  tones: [number, number];
}

const FIXTURES: Fixture[] = [
  { id: "haowan", file: "hao_wan.wav", hanzi: "好玩", pinyin: "hǎowán", tones: [3, 2] },
  { id: "meiguo", file: "mei_guo.wav", hanzi: "美國", pinyin: "měiguó", tones: [3, 2] },
  { id: "xiaoshi", file: "xiao_shi.wav", hanzi: "小時", pinyin: "xiǎoshí", tones: [3, 2] },
  { id: "yiqian", file: "yi_qian.wav", hanzi: "以前", pinyin: "yǐqián", tones: [3, 2] },
];

function processFixture(fixture: Fixture): {
  id: string;
  hanzi: string;
  pinyin: string;
  tones: [number, number];
  f0Center: number;
  durationMs: number;
  points: Array<number | null>;
  croppedFile: string;
} {
  const path = fileURLToPath(new URL(`../../fixtures/tonepairs/wav/${fixture.file}`, import.meta.url));
  const { sampleRate, samples } = decodeWav(readFileSync(path));

  // Same measurement `measurePitchReference` runs on a real recording
  // session: seeded at Jane's pinned `SEED_F0_CENTER`, recentred off this
  // take's own voiced frames. Falls back to the seed itself if the take is
  // too short for `computeF0Center` to say anything (single-word fixtures
  // are far below `MIN_REFERENCE_FRAMES`, so this is the expected path, not
  // an error case).
  const reference = measurePitchReference([{ samples, sampleRate }], SEED_F0_CENTER);
  const f0Center = reference?.f0Center ?? SEED_F0_CENTER;

  const span = multiSyllableSpan(samples, sampleRate, f0Center, fixture.tones.length);
  if (!span) throw new Error(`${fixture.file}: no voiced frames`);

  const pad = (PAD_MS / 1000) * sampleRate;
  const a = Math.max(0, Math.round(span.start - pad));
  const b = Math.min(samples.length - 1, Math.round(span.end + pad));
  const cropped = samples.slice(a, b + 1);

  // MEASURE_RANGE_SEMITONES, not the tracker's default — the same call
  // shape `process-clips.ts` makes for every shipped single-syllable clip.
  const { contour } = measureContour(cropped, sampleRate, f0Center, MEASURE_RANGE_SEMITONES);
  const points = resampleContour(contour, POLYLINE_POINTS, 0.08);

  // The exact span the contour was measured over, as playable audio — so a
  // synced playhead dot maps directly onto `points`' t axis (0 = sample 0 of
  // this file, 1 = its end) rather than onto the original recording, which
  // still carries lead-in/trailing silence outside the measured span.
  const croppedFile = `${fixture.id}-cropped.wav`;
  writeFileSync(
    fileURLToPath(new URL(`../../fixtures/tonepairs/wav/${croppedFile}`, import.meta.url)),
    encodeWav(cropped, sampleRate),
  );

  return {
    id: fixture.id,
    hanzi: fixture.hanzi,
    pinyin: fixture.pinyin,
    tones: fixture.tones,
    f0Center: Math.round(f0Center),
    durationMs: (cropped.length / sampleRate) * 1000,
    points,
    croppedFile,
  };
}

const results = FIXTURES.map(processFixture);
const outPath = fileURLToPath(new URL("./tonePairPolylines.json", import.meta.url));
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), words: results }, null, 2));
console.log(`wrote ${results.length} tone-pair contours to ${outPath}`);
for (const r of results) {
  console.log(`  ${r.id} (${r.hanzi} ${r.pinyin} [${r.tones.join("-")}]) — f0Center ${r.f0Center}Hz, ${r.durationMs.toFixed(0)}ms`);
}
