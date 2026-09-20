/**
 * Writes `src/dev/fixtureWords.json` and the playable audio beside it, from
 * `fixtures/tonepairs/wav/*.wav`.
 *
 *   npm run tonepairs:fixtures
 *
 * Every measurement goes through the shipped pipeline — `cutClip` with
 * `syllables`, then the same cohort normalisation `process-clips` applies —
 * so a corridor flown in the Lab is the corridor this word would get if it
 * were recorded and published for real. The only thing that is not real is
 * where the audio comes from.
 *
 * Output is dev-only and gitignored: `public/dev-fixtures/tonepairs/`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  FADE_MS,
  MEASURE_RANGE_SEMITONES,
  cutClip,
  measurePitchReference,
  type ContourPoint,
} from "./clipCut.ts";
import { multiSyllablePolyline } from "./clipCutMulti.ts";
import { applyChaoMap, chaoMapFor, cohortSpan, polylineSpan } from "./clipNormalize.ts";
import { SEED_F0_CENTER } from "./clipPipeline.ts";
import { reviewClip } from "./clipReview.ts";
import { DEFAULT_POLYLINES } from "../game/tuning.ts";
import type { Tone } from "../game/gates.ts";
import { decodeWav, encodeWav } from "./wav.ts";

const root = new URL("../../", import.meta.url).pathname;
const audioDir = `${root}public/dev-fixtures/tonepairs`;

interface Fixture {
  id: string;
  file: string;
  hanzi: string;
  pinyin: string;
  english: string;
  tones: [Tone, Tone];
}

/**
 * All four are Jane, all 3+2. Hanzi Traditional (好玩 美國 小時 以前) — checked
 * against a Traditional reference per CLAUDE.md hard rule 9, not by eye.
 */
const FIXTURES: Fixture[] = [
  { id: "haowan", file: "hao_wan.wav", hanzi: "好玩", pinyin: "hǎowán", english: "fun", tones: [3, 2] },
  { id: "meiguo", file: "mei_guo.wav", hanzi: "美國", pinyin: "měiguó", english: "America", tones: [3, 2] },
  { id: "xiaoshi", file: "xiao_shi.wav", hanzi: "小時", pinyin: "xiǎoshí", english: "hour", tones: [3, 2] },
  { id: "yiqian", file: "yi_qian.wav", hanzi: "以前", pinyin: "yǐqián", english: "before", tones: [3, 2] },
];

function fadeEdges(samples: Float32Array, sampleRate: number): Float32Array {
  const out = samples.slice();
  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < out.length; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return out;
}

const cuts = FIXTURES.map((fixture) => {
  const path = fileURLToPath(new URL(`fixtures/tonepairs/wav/${fixture.file}`, `file://${root}`));
  const { sampleRate, samples } = decodeWav(readFileSync(path));
  // Seeded at Jane's `speakers.f0_seed`, recentred off this take's own voiced
  // frames — the same two steps `process-clips` runs per session. A single
  // word is far below `MIN_REFERENCE_FRAMES`, so the seed is the expected
  // fallback here rather than an error case.
  const reference = measurePitchReference([{ samples, sampleRate }], SEED_F0_CENTER);
  const f0Center = reference?.f0Center ?? SEED_F0_CENTER;
  const clip = cutClip(samples, sampleRate, f0Center, MEASURE_RANGE_SEMITONES, undefined, 2);
  return { fixture, samples, sampleRate, f0Center, clip };
});

// One cohort — every fixture is 3+2 — normalised exactly as `process-clips`
// does it: measured shape, canonical height, target the union of the spans
// this combination's own tones reach.
const targets = FIXTURES[0].tones.map((t) => polylineSpan(DEFAULT_POLYLINES[t]));
const target = {
  low: Math.min(...targets.map((t) => t.low)),
  high: Math.max(...targets.map((t) => t.high)),
};
const span = cohortSpan(cuts.map((c) => c.clip.contour));
const map = chaoMapFor(span, target);
console.log(
  `T3-2: measured ${span.low.toFixed(2)}–${span.high.toFixed(2)} chao -> ` +
    `${target.low.toFixed(2)}–${target.high.toFixed(2)}  (×${map.a.toFixed(2)} ${map.b >= 0 ? "+" : ""}${map.b.toFixed(2)})  ` +
    `from ${cuts.length} take(s)`,
);

mkdirSync(audioDir, { recursive: true });

const words = cuts.map(({ fixture, samples, sampleRate, clip }) => {
  const contour = applyChaoMap(clip.contour, map);
  const polyline = multiSyllablePolyline(contour, clip.syllableSpans!);

  // The whole take, faded — the same thing `process-clips` uploads, for the
  // same reason: the cue is the recording, and `onsetS`/`durationS` say which
  // part of it the corridor covers.
  writeFileSync(`${audioDir}/${fixture.id}.wav`, encodeWav(fadeEdges(samples, sampleRate), sampleRate));

  const flags = reviewClip({
    id: fixture.id,
    tone: fixture.tones[0],
    tones: fixture.tones,
    syllableSpans: clip.syllableSpans,
    underSegmented: clip.underSegmented,
    overSegmented: clip.overSegmented,
    durationMs: clip.durationMs,
    contour,
    pinnedFraction: clip.pinnedFraction,
    // The run's own cuts, which is what `process-clips` falls back to for a
    // speaker's first session. There is nothing published to compare against.
    cohortMedianMs: 0,
    speaker: "jane",
  });

  console.log(
    `${flags.length ? "⚠" : " "} ${fixture.id.padEnd(9)} ${fixture.hanzi} ${fixture.pinyin} ` +
      `[${fixture.tones.join("-")}]  ${clip.durationMs.toFixed(0)}ms tone / ${clip.sourceMs.toFixed(0)}ms clip  ` +
      `${polyline.length} nodes`,
  );
  for (const flag of flags) console.log(`    ⚠ ${flag.kind}: ${flag.message}`);

  return {
    id: fixture.id,
    hanzi: fixture.hanzi,
    pinyin: fixture.pinyin,
    english: fixture.english,
    speakerId: "jane",
    tone: fixture.tones[0],
    tones: fixture.tones,
    syllables: 2,
    clipKey: `fixture:${fixture.id}`,
    durationS: Number((clip.durationMs / 1000).toFixed(4)),
    onsetS: Number((clip.toneStartMs / 1000).toFixed(3)),
    clipS: Number((clip.sourceMs / 1000).toFixed(4)),
    polyline: polyline as ContourPoint[],
    minTier: "free" as const,
    listIds: [],
    // Fixed, not `new Date()`: this is the clip cache's version key, and a
    // value that changes every run would make a no-op regeneration a diff —
    // the same reason `export-fallback` dropped its `exportedAt`.
    updatedAt: "2026-09-18T00:00:00.000Z",
  };
});

writeFileSync(
  fileURLToPath(new URL("./fixtureWords.json", import.meta.url)),
  `${JSON.stringify({ words }, null, 2)}\n`,
);
console.log(`\nwrote ${words.length} fixture words and their audio (${audioDir}).`);
