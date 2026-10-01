/**
 * Bakes each tone's averaged measured shape into a static, checked-in file
 * the tone classifier reads at zero cost — no fetch, no async, no dependency
 * on the catalog being loaded.
 *
 *   npm run make-tone-averages
 *
 * Reads `src/data/wordsFallback.json` — the bundled export of the published
 * catalog (`npm run export-fallback`) — parses it with the same
 * `wordsFromCatalog` the app itself uses, and for each tone averages every one of its recorded
 * words' own measured polylines via `averagePolyline` — the identical
 * measurement the Lab's `averages` tab and the landing page's "how it
 * works" cards already draw, so this is not a second implementation of that
 * average, just a third place it gets read.
 *
 * Rerun this whenever the catalog changes (new recordings via `npm run
 * process-clips`, then `npm run export-fallback`) and commit the
 * regenerated `src/game/toneAverages.ts`
 * — the same manual-but-explicit workflow this repo already uses for every
 * other derived-from-recordings artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { multiWords, toneComboKey, wordsFromCatalog, wordsOfTone } from "../game/words.ts";
import type { Tone } from "../game/gates.ts";
import { averagePolyline } from "../game/toneAverage.ts";
import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";

const root = new URL("../../", import.meta.url).pathname;
const fallbackPath = `${root}src/data/wordsFallback.json`;

const raw = readFileSync(fallbackPath, "utf8");
// The bundle omits speaker_id (it is the default speaker's catalog by
// construction), so stamp it the same way src/data/words.ts does at load —
// without it every row fails wordsFromCatalog's validation.
const words = wordsFromCatalog(
  (JSON.parse(raw) as { rows: Record<string, unknown>[] }).rows.map((r) => ({
    ...r,
    speaker_id: DEFAULT_SPEAKER_ID,
  })),
);
if (words.length === 0) {
  console.error(`No words parsed from ${fallbackPath}.`);
  process.exit(1);
}

const TONES: Tone[] = [1, 2, 3, 4];
const averaged: Record<Tone, number[]> = {} as Record<Tone, number[]>;

for (const tone of TONES) {
  const toneWords = wordsOfTone(words, tone);
  if (toneWords.length === 0) {
    console.error(`No words found for tone ${tone} in ${fallbackPath}.`);
    process.exit(1);
  }
  averaged[tone] = averagePolyline(toneWords);
  console.log(`T${tone}: averaged ${toneWords.length} clips.`);
}

// Pair averages, one per exact tone combo, for tone accuracy on two-syllable
// gates (src/game/toneAccuracy.ts). The bundle is the default speaker's
// TEXTBOOK catalog only, so these are too. A combo with a neutral (0)
// syllable is left out on purpose — tone accuracy returns null for it — and
// a combo is kept even with one clip: a thin average is still the speaker's
// own shape, and the alternative is no number at all.
const pairGroups = new Map<string, { tones: Tone[]; words: typeof words }>();
for (const w of multiWords(words)) {
  if (w.tones.includes(0 as Tone)) continue;
  const key = toneComboKey(w.tones);
  const group = pairGroups.get(key) ?? { tones: w.tones, words: [] };
  group.words.push(w);
  pairGroups.set(key, group);
}
const pairKeys = [...pairGroups.keys()].sort();
const pairAverages = new Map<string, number[]>();
for (const key of pairKeys) {
  const { words: group } = pairGroups.get(key)!;
  pairAverages.set(key, averagePolyline(group));
  console.log(`${key}: averaged ${group.length} clip${group.length === 1 ? "" : "s"}.`);
}

const formatRow = (values: number[]) =>
  values.map((v) => v.toFixed(4)).join(", ");

const output = `/**
 * GENERATED — do not hand-edit. Run \`npm run make-tone-averages\` to
 * regenerate after \`src/data/wordsFallback.json\` changes.
 *
 * Each tone's chao value averaged point-for-point, across every one of its
 * recorded words' own measured polyline, sampled at t = k/60 for k = 0..60.
 * The same measurement \`averagePolyline\` (src/ui/toneAverageChart.ts)
 * produces for the Lab's \`averages\` tab and the landing page's cards —
 * baked here so \`src/game/toneClassifier.ts\` and \`src/game/toneAccuracy.ts\`
 * can read it with zero I/O.
 *
 * These are the **default speaker's** averages, and they stay that way on
 * purpose even now that there is a roster. This is a tone *shape* reference in
 * Chao space, and Chao space is normalised per speaker — a man's Tone 2 and a
 * woman's Tone 2 already describe the same curve here, in different Hz. Making
 * this a per-speaker table would change the classifier's reading for every
 * player to gain nothing a second voice actually needs.
 */

import type { Tone } from "./gates.ts";

export const AVERAGED_TONE_SHAPE: Record<Tone, number[]> = {
  1: [${formatRow(averaged[1])}],
  2: [${formatRow(averaged[2])}],
  3: [${formatRow(averaged[3])}],
  4: [${formatRow(averaged[4])}],
};

/**
 * Two-syllable words, averaged per exact tone combo (keyed by
 * \`toneComboKey\`, e.g. "3-2") over the whole word's polyline, same 61-point
 * grid. Textbook style only (all the bundle holds); combos with a neutral
 * syllable are left out. Read by \`src/game/toneAccuracy.ts\` — never by the
 * classifier, which judges single syllables only.
 */
export const AVERAGED_PAIR_SHAPE: Record<string, number[]> = {
${pairKeys.map((k) => `  "${k}": [${formatRow(pairAverages.get(k)!)}],`).join("\n")}
};
`;

const outPath = `${root}src/game/toneAverages.ts`;
writeFileSync(outPath, output);
console.log(`\nWrote ${outPath}.`);
