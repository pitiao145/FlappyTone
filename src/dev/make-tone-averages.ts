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
 * Two styles (speech style spec §3.4). TEXTBOOK comes from the bundle, as
 * above, so it stays offline and reproducible. NATURAL comes from the live
 * catalog (the bundle is textbook-only by design): the default speaker's
 * published natural \`word_clips\`, read with the service client — so this
 * script needs \`.env.local\`'s \`SUPABASE_URL\` + \`SUPABASE_SERVICE_ROLE_KEY\`.
 *
 * Rerun this whenever the catalog changes (new recordings via `npm run
 * process-clips`, then `npm run export-fallback`) and commit the
 * regenerated `src/game/toneAverages.ts`
 * — the same manual-but-explicit workflow this repo already uses for every
 * other derived-from-recordings artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  multiWords,
  toneComboKey,
  wordsFromCatalog,
  wordsInStyle,
  wordsOfTone,
  type SpeechStyle,
  type Word,
} from "../game/words.ts";
import type { Tone } from "../game/gates.ts";
import { averagePolyline } from "../game/toneAverage.ts";
import { CATALOG_SELECT, DEFAULT_SPEAKER_ID, flattenCatalogRows } from "../data/catalogRows.ts";
import { serviceClient } from "./serviceClient.ts";

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

/** The default speaker's published natural takes, from the live catalog. */
async function naturalWords(): Promise<Word[]> {
  const { data, error } = await serviceClient()
    .from("words")
    .select(CATALOG_SELECT)
    .eq("word_clips.speaker_id", DEFAULT_SPEAKER_ID)
    .eq("word_clips.status", "published")
    .order("position", { ascending: true });
  if (error) {
    console.error(`words select failed: ${error.message}`);
    process.exit(1);
  }
  return wordsInStyle(wordsFromCatalog(flattenCatalogRows((data ?? []) as unknown[])), "natural");
}

interface StyleAverages {
  tones: Record<Tone, number[]>;
  pairKeys: string[];
  pairs: Map<string, number[]>;
}

function averagesOf(style: SpeechStyle, source: Word[]): StyleAverages {
  console.log(`\n${style}:`);
  const tones = {} as Record<Tone, number[]>;
  for (const tone of TONES) {
    const toneWords = wordsOfTone(source, tone);
    if (toneWords.length === 0) {
      console.error(`No ${style} words found for tone ${tone}.`);
      process.exit(1);
    }
    tones[tone] = averagePolyline(toneWords);
    console.log(`T${tone}: averaged ${toneWords.length} clips.`);
  }

  // Pair averages, one per exact tone combo, for tone accuracy on
  // two-syllable gates (src/game/toneAccuracy.ts). A combo with a neutral (0)
  // syllable is left out on purpose — tone accuracy returns null for it — and
  // a combo is kept even with one clip: a thin average is still the speaker's
  // own shape, and the alternative is no number at all.
  const groups = new Map<string, Word[]>();
  for (const w of multiWords(source)) {
    if (w.tones.includes(0 as Tone)) continue;
    const key = toneComboKey(w.tones);
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const pairKeys = [...groups.keys()].sort();
  const pairs = new Map<string, number[]>();
  for (const key of pairKeys) {
    const group = groups.get(key)!;
    pairs.set(key, averagePolyline(group));
    console.log(`${key}: averaged ${group.length} clip${group.length === 1 ? "" : "s"}.`);
  }
  return { tones, pairKeys, pairs };
}

const STYLES: SpeechStyle[] = ["textbook", "natural"];
const byStyle: Record<SpeechStyle, StyleAverages> = {
  textbook: averagesOf("textbook", words),
  natural: averagesOf("natural", await naturalWords()),
};

const formatRow = (values: number[]) =>
  values.map((v) => v.toFixed(4)).join(", ");

const toneBlock = (a: StyleAverages) =>
  TONES.map((t) => `    ${t}: [${formatRow(a.tones[t])}],`).join("\n");
const pairBlock = (a: StyleAverages) =>
  a.pairKeys.map((k) => `    "${k}": [${formatRow(a.pairs.get(k)!)}],`).join("\n");

const output = `/**
 * GENERATED — do not hand-edit. Run \`npm run make-tone-averages\` to
 * regenerate after the catalog changes (textbook: \`src/data/wordsFallback.json\`;
 * natural: the live catalog's published natural takes).
 *
 * Each tone's chao value averaged point-for-point, across every one of its
 * recorded words' own measured polyline, sampled at t = k/60 for k = 0..60.
 * The same measurement \`averagePolyline\` (src/ui/toneAverageChart.ts)
 * produces for the Lab's \`averages\` tab and the landing page's cards —
 * baked here so \`src/game/toneClassifier.ts\` and \`src/game/toneAccuracy.ts\`
 * can read it with zero I/O.
 *
 * Keyed by speech style: a natural gate is judged against natural averages
 * (speech style spec, decision 4). The classifier reads \`.textbook\`
 * explicitly — its anchors are not style-aware (decision 7).
 *
 * These are the **default speaker's** averages, and they stay that way on
 * purpose even now that there is a roster. This is a tone *shape* reference in
 * Chao space, and Chao space is normalised per speaker — a man's Tone 2 and a
 * woman's Tone 2 already describe the same curve here, in different Hz. Making
 * this a per-speaker table would change the classifier's reading for every
 * player to gain nothing a second voice actually needs.
 */

import type { Tone } from "./gates.ts";
import type { SpeechStyle } from "./words.ts";

export const AVERAGED_TONE_SHAPE: Record<SpeechStyle, Record<Tone, number[]>> = {
${STYLES.map((st) => `  ${st}: {\n${toneBlock(byStyle[st])}\n  },`).join("\n")}
};

/**
 * Two-syllable words, averaged per exact tone combo (keyed by
 * \`toneComboKey\`, e.g. "3-2") over the whole word's polyline, same 61-point
 * grid, per style. Combos with a neutral syllable are left out. Read by
 * \`src/game/toneAccuracy.ts\` — never by the classifier, which judges single
 * syllables only.
 */
export const AVERAGED_PAIR_SHAPE: Record<SpeechStyle, Record<string, number[]>> = {
${STYLES.map((st) => `  ${st}: {\n${pairBlock(byStyle[st])}\n  },`).join("\n")}
};
`;

const outPath = `${root}src/game/toneAverages.ts`;
writeFileSync(outPath, output);
console.log(`\nWrote ${outPath}.`);
