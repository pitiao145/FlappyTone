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
 * Rerun and commit the JSON after any change to the `words` table's published
 * rows.
 */

import { writeFileSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";

const root = new URL("../../", import.meta.url).pathname;
const outPath = `${root}src/data/wordsFallback.json`;

/**
 * Spelled out rather than `*` so a column added to the table later has to be
 * opted in here, and so `contour` cannot come back by accident.
 */
const COLUMNS = [
  "id",
  "hanzi",
  "pinyin",
  "english",
  "tone",
  "tones",
  "syllables",
  "position",
  "status",
  "min_tier",
  "clip_key",
  "duration_s",
  "onset_s",
  "clip_s",
  "polyline",
  "meta",
  "recorded_at",
  "created_at",
  "updated_at",
].join(",");

const supabase = serviceClient();

const { data, error } = await supabase
  .from("words")
  .select(COLUMNS)
  .eq("status", "published")
  .order("position", { ascending: true });

if (error) {
  console.error(`words select failed: ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];
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

const payload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  rows: rows.map((row) => sortKeys(row as unknown as Record<string, unknown>)),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${rows.length} published word(s) to ${outPath}.`);
