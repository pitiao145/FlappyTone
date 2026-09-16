/**
 * The word catalog, read from the `words` table.
 *
 * Three sources, in order, and the order is the whole design:
 *
 *   1. **Live** — the published rows, ordered by `position`. The catalog is
 *      editable now; a word added or unpublished in the database has to reach
 *      players without a deploy.
 *   2. **The `localStorage` cache** — the last successful read. A returning
 *      player on a dead network still gets the words they had yesterday, and
 *      `catalogFromCache()` is what lets `inventoryNow()` answer
 *      *synchronously* on the second visit, which the game loop needs (a Run
 *      is built inside an effect and the first gates spawn there).
 *   3. **`wordsFallback.json`** — the published catalog as it stood at build
 *      time, bundled. The floor under a first-time visitor whose network or
 *      whose Supabase project is down. Regenerate with `npm run
 *      export-fallback`.
 *
 * Obeys `supabase.ts`'s first rule without exception: **nothing here throws
 * into a caller.** `fetchCatalog` cannot reject. Every failure is one
 * `warn()` line and a step down the list — a broken catalog read costs the
 * player freshness, never a run.
 */

import { wordsFromCatalog, type Word } from "../game/words.ts";
import { CATALOG_SELECT, DEFAULT_SPEAKER_ID, flattenCatalogRows } from "./catalogRows.ts";
import fallback from "./wordsFallback.json";
import { getSupabase, warn } from "./supabase.ts";

/**
 * v2 because the row shape changed (the measurements moved to `word_clips`),
 * and per-speaker because a cache keyed on neither would hand a player the
 * other voice's geometry with no error and no way to notice.
 *
 * Old `toneflap.catalog.v1` entries are deliberately not migrated and not
 * cleaned up: a stale catalog cache costs exactly one cold fetch, and a
 * removal pass would be code that exists forever to reclaim a few kB once.
 */
export const CATALOG_KEY_PREFIX = "toneflap.catalog.v2.";

const keyFor = (speaker: string): string => `${CATALOG_KEY_PREFIX}${speaker}`;

interface CachedCatalog {
  savedAt: number;
  rows: unknown[];
}

/**
 * The words from the last successful live read, or `null` when there is no
 * usable cache — no storage, nothing stored, unparseable JSON, or rows that
 * no longer survive `wordsFromCatalog` (a schema the current code can't
 * read is the same as no cache).
 *
 * Deliberately not time-limited. A stale word list is a playable word list;
 * expiring it would trade a working offline game for freshness the live read
 * already provides whenever it can.
 */
export function catalogFromCache(speaker: string): Word[] | null {
  try {
    const raw = localStorage.getItem(keyFor(speaker));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCatalog>;
    if (!Array.isArray(parsed?.rows)) return null;
    // Cached rows are already flattened by `writeCache`, so they parse
    // directly. Flattening again here would find no `word_clips` key and drop
    // every row — a silent fall-through to the bundled snapshot on every cold
    // start.
    const words = wordsFromCatalog(parsed.rows);
    return words.length > 0 ? words : null;
  } catch {
    // Corrupt value, blocked storage, or no `localStorage` at all (a Node
    // test, a prerender). All of them mean the same thing to a caller.
    return null;
  }
}

function writeCache(speaker: string, rows: unknown[]): void {
  try {
    localStorage.setItem(keyFor(speaker), JSON.stringify({ savedAt: Date.now(), rows }));
  } catch (err) {
    // Full or blocked storage. The words are already in hand; only the next
    // cold start loses out.
    warn("catalog", "could not cache the catalog", err);
  }
}

/**
 * The bundled export, parsed. The last resort, and never empty in practice.
 *
 * `wordsFromCatalog` drops any row without a non-empty `speaker_id`, and the
 * bundle carries none — `export-fallback` writes `is_default` only, not
 * `speaker_id`. Stamping the default speaker id on here (rather than
 * defaulting it inside the parser) is deliberate: the bundle is the default
 * speaker's catalog by construction, but a *live* row missing `speaker_id`
 * must still be dropped, not silently attributed to Jane.
 */
function catalogFromFallback(): Word[] {
  return wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
}

/**
 * The published catalog: live if it can be had, else cached, else bundled.
 * Never rejects and never returns an empty array unless the bundled export is
 * itself empty.
 *
 * `listId` narrows to one curated list through the `word_lists` join table.
 * Unused by the game today — every player gets the whole catalog — and here
 * because the join is the one part of the query shape that would otherwise be
 * guessed at later.
 */
export async function fetchCatalog(opts: { speaker: string; listId?: string }): Promise<Word[]> {
  try {
    const supabase = getSupabase();
    if (supabase) {
      const select = opts.listId
        ? `${CATALOG_SELECT},word_lists!inner(list_id)`
        : CATALOG_SELECT;
      // No `words.status` filter, and its absence is deliberate: publication is
      // a property of the *recording* now, not of the word, so it is filtered
      // inside the embed (`word_clips.status`) below. The `words.status`
      // column still physically exists until a later contract migration, so
      // the old filter would keep working and mask the change.
      let query = supabase
        .from("words")
        .select(select)
        .eq("word_clips.speaker_id", opts.speaker)
        .eq("word_clips.status", "published");
      if (opts.listId) query = query.eq("word_lists.list_id", opts.listId);
      const { data, error } = await query.order("position", { ascending: true });
      if (error) {
        warn("catalog", `words select failed: ${error.message}`);
      } else {
        // Flattened once, before both the parse and the cache write: caching
        // the raw embed rows would make every later cold start parse them to
        // zero words and silently fall through to the bundled snapshot.
        const rows = flattenCatalogRows((data ?? []) as unknown[]);
        const words = wordsFromCatalog(rows);
        if (words.length > 0) {
          writeCache(opts.speaker, rows);
          return words;
        }
        // A live read that parses to nothing is a misconfiguration, not an
        // empty catalog — publishing every word away is not a thing anyone
        // does. Keep the cache and fall through rather than caching it.
        warn("catalog", "live catalog parsed to zero words; keeping the cached/bundled list");
      }
    }
  } catch (err) {
    warn("catalog", "catalog read threw", err);
  }
  return catalogFromCache(opts.speaker) ?? catalogFromFallback();
}
