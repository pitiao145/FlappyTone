/**
 * The `words` table's row shape, as it comes off the wire — and nothing else.
 *
 * Pure on purpose: no Supabase import, no other imports at all. `src/game/`
 * needs this shape to parse a catalog fetch into `Word[]` (`wordsFromCatalog`
 * in `src/game/words.ts`), but `src/game/` may only reference `CatalogRow` via
 * `import type` — a value import here would drag a `src/data/` module into
 * the landing-page chunk, which the marketing-page import ban exists to
 * prevent. `CATALOG_SELECT` is a value; it is consumed only by `src/data/`
 * fetch code (a later task), never imported from `src/game/`.
 */

export interface CatalogRow {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  tone: number;
  tones: number[];
  syllables: number;
  position: number;
  status: string;
  min_tier: string;
  clip_key: string | null;
  duration_s: number | null;
  onset_s: number | null;
  clip_s: number | null;
  polyline: unknown;
  contour?: unknown;
  updated_at: string;
}

export const CATALOG_SELECT =
  "id,hanzi,pinyin,english,tone,tones,syllables,position,status,min_tier,clip_key,duration_s,onset_s,clip_s,polyline,updated_at";

/**
 * The columns `export-fallback` bakes into `src/data/wordsFallback.json`.
 *
 * Here rather than in `src/dev/export-fallback.ts` so the seam this file
 * defines can be pinned by a test: `export-fallback.ts` is a script with
 * top-level effects (it queries Supabase on import), so a test cannot import
 * anything from it.
 *
 * A superset of `CATALOG_SELECT`'s live columns plus the bookkeeping the Lab
 * wants offline, minus `contour`, `raw_key` and `recorded_session` — see that
 * script's header for why each is dropped.
 */
export const FALLBACK_COLUMNS = [
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
] as const;
