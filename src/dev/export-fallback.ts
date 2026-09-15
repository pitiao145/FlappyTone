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
 * Selects `*`, not `CATALOG_SELECT`: `contour` is not part of the runtime
 * catalog read (the game only needs `polyline`), but the Lab and the averaged
 * tone shapes are measured from it. Rerun and commit the JSON after any change
 * to the `words` table's published rows.
 */

import { writeFileSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";

const root = new URL("../../", import.meta.url).pathname;
const outPath = `${root}src/data/wordsFallback.json`;

const supabase = serviceClient();

const { data, error } = await supabase
  .from("words")
  .select("*")
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
  rows: rows.map((row) => sortKeys(row as Record<string, unknown>)),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${rows.length} published word(s) to ${outPath}.`);
