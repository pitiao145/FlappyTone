/**
 * Bakes each tone's averaged measured shape into a static, checked-in file
 * the tone classifier reads at zero cost — no fetch, no async, no dependency
 * on the manifest being loaded.
 *
 *   npm run make-tone-averages
 *
 * Reads `public/ref/manifest.json`, parses it with the same `loadWords` the
 * app itself uses, and for each tone averages every one of its recorded
 * words' own measured polylines via `averagePolyline` — the identical
 * measurement the Lab's `averages` tab and the landing page's "how it
 * works" cards already draw, so this is not a second implementation of that
 * average, just a third place it gets read.
 *
 * Rerun this whenever `public/ref/manifest.json` changes (new recordings via
 * `npm run make-clips`) and commit the regenerated `src/game/toneAverages.ts`
 * — the same manual-but-explicit workflow this repo already uses for every
 * other derived-from-recordings artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { loadWords, wordsOfTone } from "../game/words.ts";
import type { Tone } from "../game/gates.ts";
import { averagePolyline } from "../game/toneAverage.ts";

const root = new URL("../../", import.meta.url).pathname;
const manifestPath = `${root}public/ref/manifest.json`;

const raw = readFileSync(manifestPath, "utf8");
const words = loadWords(JSON.parse(raw));
if (words.length === 0) {
  console.error(`No words parsed from ${manifestPath}.`);
  process.exit(1);
}

const TONES: Tone[] = [1, 2, 3, 4];
const averaged: Record<Tone, number[]> = {} as Record<Tone, number[]>;

for (const tone of TONES) {
  const toneWords = wordsOfTone(words, tone);
  if (toneWords.length === 0) {
    console.error(`No words found for tone ${tone} in ${manifestPath}.`);
    process.exit(1);
  }
  averaged[tone] = averagePolyline(toneWords);
  console.log(`T${tone}: averaged ${toneWords.length} clips.`);
}

const formatRow = (values: number[]) =>
  values.map((v) => v.toFixed(4)).join(", ");

const output = `/**
 * GENERATED — do not hand-edit. Run \`npm run make-tone-averages\` to
 * regenerate after \`public/ref/manifest.json\` changes.
 *
 * Each tone's chao value averaged point-for-point, across every one of its
 * recorded words' own measured polyline, sampled at t = k/60 for k = 0..60.
 * The same measurement \`averagePolyline\` (src/ui/toneAverageChart.ts)
 * produces for the Lab's \`averages\` tab and the landing page's cards —
 * baked here so \`src/game/toneClassifier.ts\` can read it with zero I/O.
 */

import type { Tone } from "./gates.ts";

export const AVERAGED_TONE_SHAPE: Record<Tone, number[]> = {
  1: [${formatRow(averaged[1])}],
  2: [${formatRow(averaged[2])}],
  3: [${formatRow(averaged[3])}],
  4: [${formatRow(averaged[4])}],
};
`;

const outPath = `${root}src/game/toneAverages.ts`;
writeFileSync(outPath, output);
console.log(`\nWrote ${outPath}.`);
