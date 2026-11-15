/**
 * Brief 45: the tone averages and default corridors on the one ruler, from the
 * brief 43 shapes (`src/dev/local/shapes-v2.json`). Writes
 * `src/game/toneAveragesV2.ts`, read only when `tuning().playerRulerV2` is on
 * (off in production until brief 48).
 *
 *   npm run make-tone-averages-v2
 *
 * Same measurement and grouping as `make-tone-averages.ts` (`averagePolyline`,
 * grouped by the SPOKEN tone), with each word's polyline swapped for its
 * shapes-v2 polyline. Textbook words come from `src/data/wordsFallback.json`.
 * Natural words (and their spoken tones) come from the live catalog with ONE
 * read-only select, exactly as `make-tone-averages.ts` does; nothing is written
 * anywhere but the output file.
 *
 * `DEFAULT_POLYLINES_V2`: the tutorial / fallback corridor per tone, from the
 * `ma` words (ma1b, ma2, ma3b, ma4b), the same syllable `DEFAULT_POLYLINES`
 * was built from, now with their one-ruler shapes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { spokenTones } from "../game/sandhi.ts";
import {
  isSingle,
  multiWords,
  toneComboKey,
  wordsFromCatalog,
  wordsInStyle,
  type SpeechStyle,
  type Word,
} from "../game/words.ts";
import type { Tone } from "../game/gates.ts";
import { averagePolyline } from "../game/toneAverage.ts";
import { CATALOG_SELECT, DEFAULT_SPEAKER_ID, flattenCatalogRows } from "../data/catalogRows.ts";
import { serviceClient } from "./serviceClient.ts";

const root = new URL("../../", import.meta.url).pathname;
const TONES: Tone[] = [1, 2, 3, 4];
type Shape = { polyline: [number, number][] };
const shapes = JSON.parse(readFileSync(`${root}src/dev/local/shapes-v2.json`, "utf8")) as Record<SpeechStyle, Record<string, Shape>>;

function withV2(words: Word[], style: SpeechStyle): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const s = shapes[style][w.id];
    if (s?.polyline?.length >= 2) out.push({ ...w, polyline: s.polyline });
  }
  console.log(`${style}: ${out.length} of ${words.length} words have a shapes-v2 polyline.`);
  return out;
}

const textbook = wordsFromCatalog(
  (JSON.parse(readFileSync(`${root}src/data/wordsFallback.json`, "utf8")) as { rows: Record<string, unknown>[] }).rows.map(
    (r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID }),
  ),
);
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
const natural = wordsInStyle(wordsFromCatalog(flattenCatalogRows((data ?? []) as unknown[])), "natural");

interface StyleAverages {
  tones: Record<Tone, number[]>;
  pairs: Map<string, number[]>;
}
function averagesOf(style: SpeechStyle, source: Word[]): StyleAverages {
  const tones = {} as Record<Tone, number[]>;
  for (const tone of TONES) {
    const group = source.filter((w) => isSingle(w) && spokenTones(w)[0] === tone);
    if (group.length === 0) throw new Error(`no ${style} T${tone} words`);
    tones[tone] = averagePolyline(group);
    console.log(`${style} T${tone}: ${group.length} clips`);
  }
  const groups = new Map<string, Word[]>();
  for (const w of multiWords(source)) {
    const spoken = spokenTones(w);
    if (spoken.includes(0 as Tone)) continue;
    const key = toneComboKey(spoken);
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const pairs = new Map<string, number[]>();
  for (const key of [...groups.keys()].sort()) pairs.set(key, averagePolyline(groups.get(key)!));
  return { tones, pairs };
}
const byStyle: Record<SpeechStyle, StyleAverages> = {
  textbook: averagesOf("textbook", withV2(textbook, "textbook")),
  natural: averagesOf("natural", withV2(natural, "natural")),
};
const STYLES: SpeechStyle[] = ["textbook", "natural"];
const row = (v: number[]) => v.map((x) => x.toFixed(4)).join(", ");
const MA: Record<Tone, string> = { 1: "ma1b", 2: "ma2", 3: "ma3b", 4: "ma4b" };

const output = `/**
 * GENERATED — do not hand-edit. Run \`npm run make-tone-averages-v2\`.
 *
 * Brief 45: \`toneAverages.ts\` measured again on the one ruler (brief 43
 * shapes, \`src/dev/local/shapes-v2.json\`). Same 61-point grid, same grouping
 * by spoken tone. Read instead of \`toneAverages.ts\` / \`DEFAULT_POLYLINES\`
 * only when \`tuning().playerRulerV2\` is on (off in production until brief 48).
 */

import type { Tone } from "./gates.ts";
import type { Polyline } from "./tuning.ts";
import type { SpeechStyle } from "./words.ts";

export const AVERAGED_TONE_SHAPE_V2: Record<SpeechStyle, Record<Tone, number[]>> = {
${STYLES.map((st) => `  ${st}: {\n${TONES.map((t) => `    ${t}: [${row(byStyle[st].tones[t])}],`).join("\n")}\n  },`).join("\n")}
};

export const AVERAGED_PAIR_SHAPE_V2: Record<SpeechStyle, Record<string, number[]>> = {
${STYLES.map((st) => `  ${st}: {\n${[...byStyle[st].pairs].map(([k, v]) => `    "${k}": [${row(v)}],`).join("\n")}\n  },`).join("\n")}
};

/** The tutorial / fallback corridor per tone: the \`ma\` words' one-ruler shapes (${TONES.map((t) => MA[t]).join(", ")}). */
export const DEFAULT_POLYLINES_V2: Record<Tone, Polyline> = {
${TONES.map((t) => `  ${t}: ${JSON.stringify(shapes.textbook[MA[t]].polyline)},`).join("\n")}
};
`;
writeFileSync(`${root}src/game/toneAveragesV2.ts`, output);
console.log("Wrote src/game/toneAveragesV2.ts");
