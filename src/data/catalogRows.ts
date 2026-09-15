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
