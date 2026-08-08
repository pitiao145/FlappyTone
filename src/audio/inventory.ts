/**
 * Fetches the clip inventory and hands it to the game as words.
 *
 * The impure half of `src/game/words.ts`, kept out of it so the parsing and the
 * selection stay testable without a network. Lives next to `reference.ts`
 * because the two describe the same files from opposite ends: this one says
 * which clips exist, that one plays them.
 *
 * Cached at module scope and started as early as anything asks. A run must
 * never wait on this to *finish* — an empty inventory is a valid run on the
 * tuning defaults — but it is a small same-origin JSON, so in practice it has
 * landed long before the first gate.
 */

import { loadWords, type Word } from "../game/words.ts";

let cache: Promise<Word[]> | null = null;
let resolved: Word[] | null = null;

/**
 * The inventory if it has already landed, else null.
 *
 * A Run is constructed synchronously inside an effect, and words are needed at
 * construction because the first gates spawn there. So the fetch is started at
 * app start and read here — by the time the player has been through the mic
 * gesture and calibration, a same-origin JSON has long since arrived. When it
 * has not, `Run.setWords` catches up the moment it does.
 */
export function inventoryNow(): Word[] | null {
  return resolved;
}

export function loadInventory(): Promise<Word[]> {
  cache ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}ref/manifest.json`);
    if (!res.ok) throw new Error(`manifest: ${res.status}`);
    return loadWords(await res.json());
  })().catch(() => {
    // A failed fetch degrades to the tuning defaults rather than to a blank
    // screen. Not retried: the run has already started by the time anyone
    // notices, and a second failure would cost the same silence.
    return [];
  }).then((words) => {
    resolved = words;
    return words;
  });
  return cache;
}
