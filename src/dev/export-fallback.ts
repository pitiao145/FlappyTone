/**
 * Bakes the published catalog into `src/data/wordsFallback.json`, the copy of
 * the word list that ships inside the bundle.
 *
 *   npm run export-fallback
 *
 * Three readers, one file:
 *
 *   - `src/data/words.ts` — the last resort when the live query fails and no
 *     `localStorage` cache exists, so a first-time visitor on a dead network
 *     still gets a playable inventory instead of the tuning defaults.
 *   - `src/ui/Landing.tsx` — the marketing page, which may not import
 *     anything from `src/data/`, `src/audio/` or `src/pitch/`. A JSON import
 *     pulls in no module, so the tone cards read their contours from here.
 *   - the Lab and `make-tone-averages` — dev tooling that wants a fixed,
 *     offline inventory rather than whatever the database says today.
 *
 * Every catalog column except `contour`, `raw_key` and `recorded_session`. Nothing in `src/` reads a
 * fallback row's `contour`: `wordsFromCatalog` never looks at it, `Word` has
 * no such field, and the tone charts (landing page, Lab's averages tab,
 * `make-tone-averages`) all measure from `polyline` via `averagePolyline`.
 * It is by far the largest field, and this file is statically imported by the
 * marketing entry — so exporting it would put ~28 kB gzip of unread data on
 * the landing page's critical path. The column stays in the database; only
 * this snapshot drops it.
 *
 * `raw_key` and `recorded_session` are dropped for the same reason plus one
 * more: nothing in `src/` or `workers/` reads either from the fallback
 * (`verify-clips.ts` and `migrate-raw.ts` query Supabase directly), and they
 * are internal R2 object keys and session ids — no reason to ship them to
 * every visitor of the landing page.
 *
 * ## The DEFAULT SPEAKER only, on purpose
 *
 * Since the voice roster a word has one row per voice, and this snapshot takes
 * exactly one of them: the speaker whose `speakers.is_default` is true. Not a
 * simplification to revisit — the bundle is the dead-network path, and a dead
 * network means the clips Worker is unreachable too, so NO clip audio plays
 * whichever voice the player picked. A second voice's rows would add weight to
 * the landing page's critical path to describe geometry nobody can hear. The
 * live query (`src/data/words.ts`) is speaker-scoped and is what serves a
 * player who actually chose a voice.
 *
 * The rows therefore carry no `speaker_id`; `src/data/words.ts` stamps
 * `DEFAULT_SPEAKER_ID` on at the call site, so a LIVE row missing one is still
 * dropped rather than silently attributed.
 *
 * Rerun and commit the JSON after any change to the default speaker's
 * published clips.
 */

import { writeFileSync } from "node:fs";

import { FALLBACK_COLUMNS, FALLBACK_LISTS_SELECT } from "../data/catalogRows.ts";
import { serviceClient } from "./serviceClient.ts";

const root = new URL("../../", import.meta.url).pathname;
const outPath = `${root}src/data/wordsFallback.json`;

const supabase = serviceClient();

const { data: defaultSpeaker, error: speakerError } = await supabase
  .from("speakers")
  .select("id")
  .eq("is_default", true)
  .maybeSingle();
if (speakerError) {
  console.error(`speakers select failed: ${speakerError.message}`);
  process.exit(1);
}
if (!defaultSpeaker) {
  // A unique partial index guarantees at most one default; zero means the
  // roster is misconfigured, and guessing a speaker here would bundle whichever
  // voice sorted first.
  console.error("No speaker has is_default — refusing to guess which voice to bundle.");
  process.exit(1);
}

/**
 * The columns are spelled out rather than `*`, so one added to either table
 * later has to be opted in and `contour` cannot come back by accident. The
 * list lives in `src/data/catalogRows.ts` beside `CATALOG_SELECT`, where a
 * test can import it — this file cannot be imported, it queries on load.
 *
 * The word-level ones come from `words`; the clip-level ones from that
 * speaker's `word_clips` row. Split this way rather than read off `words`'
 * pre-roster measurement columns, which migration 0015 left in place and which
 * are the default speaker's regardless of the roster — right today, silently
 * wrong the moment they are dropped or a second voice is published.
 */
const WORD_LEVEL = new Set(["id", "hanzi", "pinyin", "english", "tone", "tones", "syllables", "position", "min_tier", "meta", "created_at"]);
const wordColumns = FALLBACK_COLUMNS.filter((c) => WORD_LEVEL.has(c));
const clipColumns = FALLBACK_COLUMNS.filter((c) => !WORD_LEVEL.has(c));

const { data, error } = await supabase
  .from("words")
  // `!inner`, so a word this speaker has not recorded does not arrive at all.
  .select(`${wordColumns.join(",")},word_clips!inner(${clipColumns.join(",")}),${FALLBACK_LISTS_SELECT}`)
  .eq("word_clips.speaker_id", defaultSpeaker.id)
  .eq("word_clips.status", "published")
  .order("position", { ascending: true });

if (error) {
  console.error(`words select failed: ${error.message}`);
  process.exit(1);
}

/** Lifts the single embedded clip onto the word, as `flattenCatalogRows` does. */
const rows = ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
  const clips = row.word_clips;
  if (!Array.isArray(clips) || clips.length !== 1) return [];
  const { word_clips: _drop, word_lists, ...word } = row;
  const lists = Array.isArray(word_lists)
    ? word_lists
        .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>).list_id : null))
        .filter((id): id is string => typeof id === "string")
    : [];
  return [{ ...word, ...(clips[0] as Record<string, unknown>), lists }];
});
if (rows.length === 0) {
  // A zero-row export would silently replace a working fallback with an empty
  // one, which reads downstream exactly like "the game works, there are just
  // no words". Refuse instead.
  console.error("No published words found — refusing to write an empty fallback.");
  process.exit(1);
}

/**
 * Stable key order, so a re-export with no data change produces no diff.
 * `JSON.stringify` follows insertion order, and PostgREST's own column order
 * is not something to depend on.
 */
function sortKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) out[key] = row[key];
  return out;
}

/**
 * No `exportedAt`. This file's whole job is to be diffable — a re-export with
 * no data change must produce an EMPTY `git diff`, which is what proves a
 * pipeline refactor moved no measurement. A timestamp made every run diff by
 * one line, so the one signal the file exists to give had to be read past
 * every time, and nothing in the repo ever read the value.
 */
const payload = {
  version: 1,
  rows: rows.map((row) => sortKeys(row as unknown as Record<string, unknown>)),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${rows.length} published word(s) to ${outPath}.`);
