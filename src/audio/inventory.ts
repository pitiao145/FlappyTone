/**
 * Fetches the word catalog and hands it to the game as words.
 *
 * The impure half of `src/game/words.ts`, kept out of it so the parsing and the
 * selection stay testable without a network. Lives next to `reference.ts`
 * because the two describe the same clips from opposite ends: this one says
 * which words exist, that one plays them.
 *
 * The source is the `words` table now, not `public/ref/manifest.json` —
 * `src/data/words.ts` owns the read and its cache/bundled-fallback ladder, and
 * cannot throw. This module is what everything upstream already calls, so the
 * swap is invisible to callers.
 *
 * Cached at module scope and started as early as anything asks. A run must
 * never wait on this to *finish* — an empty inventory is a valid run on the
 * tuning defaults — and on a returning visit it does not have to: `resolved`
 * is seeded synchronously from the cache below.
 */

import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";
import { catalogFromCache, fetchCatalog } from "../data/words.ts";
import { type Word } from "../game/words.ts";

let cache: Promise<Word[]> | null = null;

/**
 * Seeded from the cached catalog at module load, so `inventoryNow()` answers
 * on the first frame of a returning visit rather than after a round trip.
 * Replaced by the live list the moment `loadInventory()` resolves.
 */
// The speaker is passed explicitly rather than defaulted inside
// `fetchCatalog`, so the task that introduces a resolved speaker cannot miss a
// call site by leaving one silently on Jane.
let resolved: Word[] | null = catalogFromCache(DEFAULT_SPEAKER_ID);

/**
 * The inventory if it has already landed, else null.
 *
 * A Run is constructed synchronously inside an effect, and words are needed at
 * construction because the first gates spawn there. So the fetch is started at
 * app start and read here — by the time the player has been through the mic
 * gesture and calibration, the catalog has long since arrived. When it has
 * not, `Run.setWords` catches up the moment it does.
 */
export function inventoryNow(): Word[] | null {
  return resolved;
}

export function loadInventory(): Promise<Word[]> {
  cache ??= fetchCatalog({ speaker: DEFAULT_SPEAKER_ID }).then((words) => {
    // `fetchCatalog` never rejects and never returns an empty list unless the
    // bundled export is itself empty, so there is nothing left to catch here.
    resolved = words;
    return words;
  });
  return cache;
}
