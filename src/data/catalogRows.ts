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

/**
 * The speaker `wordsFallback.json`'s bundled rows belong to. The bundle
 * carries no `speaker_id` of its own (`export-fallback` exports `is_default`
 * only), so `src/data/words.ts`'s fallback path stamps this on at the call
 * site rather than defaulting it inside `wordsFromCatalog` — a live row still
 * gets dropped if it arrives without one, so a clip is never silently
 * attributed to Jane.
 */
export const DEFAULT_SPEAKER_ID = "jane";

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
  speaker_id: string;
  /**
   * `word_clips.style` — on the wire inside the embed only. `flattenCatalogRows`
   * splits on it and strips it: the top-level fields are always textbook.
   */
  style?: string;
  clip_key: string | null;
  duration_s: number | null;
  onset_s: number | null;
  clip_s: number | null;
  polyline: unknown;
  contour?: unknown;
  updated_at: string;
  /**
   * The natural take's clip columns, when one is published — set by
   * `flattenCatalogRows`, never on the wire. The textbook take is the
   * top-level fields above.
   */
  natural?: Record<string, unknown>;
  /** TOCFL/HSK/sampler list ids this word belongs to (`lists.id`), via `word_lists`. */
  lists?: string[];
}

/**
 * The measurement fields, which now live on `word_clips` rather than `words`.
 * Named once so the select and the flattener cannot drift apart.
 */
const CLIP_COLUMNS = [
  "speaker_id",
  "style",
  "status",
  "clip_key",
  "duration_s",
  "onset_s",
  "clip_s",
  "polyline",
  "updated_at",
] as const;

/**
 * `!inner` matters: a word with no clip for the selected speaker must not
 * arrive at all. An outer join would deliver it with a null polyline, which
 * `wordsFromCatalog` drops anyway — but only after the row has travelled, and
 * only as long as nobody later "fixes" the parser to be lenient.
 */
export const CATALOG_SELECT =
  `id,hanzi,pinyin,english,tone,tones,syllables,position,min_tier,word_clips!inner(${CLIP_COLUMNS.join(",")}),word_lists(list_id)`;

/**
 * Lifts the embedded clips onto the word, producing the flat shape
 * `wordsFromCatalog` parses: the textbook clip's columns at the top level
 * (as they always were), the natural clip's under `natural`.
 *
 * Exactly one clip per style or the row is dropped, and a textbook clip is
 * required. More than one of a style means the query was not speaker-scoped
 * — a query bug, and serving a word with the wrong voice's geometry is worse
 * than serving one word fewer. A clip with no `style` (a row cached before
 * the column was selected) counts as textbook.
 */
export function flattenCatalogRows(rows: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const clips = rec.word_clips;
    if (!Array.isArray(clips)) continue;
    const byStyle = new Map<string, Record<string, unknown>[]>();
    for (const c of clips) {
      if (!c || typeof c !== "object") continue;
      const cr = c as Record<string, unknown>;
      const style = typeof cr.style === "string" ? cr.style : "textbook";
      byStyle.set(style, [...(byStyle.get(style) ?? []), cr]);
    }
    const textbook = byStyle.get("textbook");
    const natural = byStyle.get("natural");
    if (!textbook || textbook.length !== 1) continue;
    if (natural && natural.length !== 1) continue;
    const { style: _style, ...clip } = textbook[0];
    const { word_clips: _drop, word_lists, ...word } = rec;
    const lists = Array.isArray(word_lists)
      ? word_lists
          .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>).list_id : null))
          .filter((id): id is string => typeof id === "string")
      : [];
    const nat = natural?.[0];
    out.push({ ...word, ...clip, lists, ...(nat ? { natural: nat } : {}) });
  }
  return out;
}

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

/**
 * Not part of `FALLBACK_COLUMNS` (that's a `words` table select list) — the
 * fallback exporter joins this separately and stamps it on as `lists`, the
 * same shape `flattenCatalogRows` produces for a live fetch.
 */
export const FALLBACK_LISTS_SELECT = "word_lists(list_id)";
