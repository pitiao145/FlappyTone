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
import { catalogFromCache, catalogFromFallback, fetchCatalog } from "../data/words.ts";
import { type Word } from "../game/words.ts";

let cache: Promise<Word[]> | null = null;

/**
 * The speaker whose catalog is loaded. Starts at the default and moves only
 * when a resolved preference says so (`adoptInventory`), so a build with a
 * one-voice roster behaves exactly as it did before voices existed.
 */
let speaker = DEFAULT_SPEAKER_ID;

type Listener = (words: Word[]) => void;
const listeners = new Set<Listener>();

/**
 * The words `inventoryNow()` answers with, seeded synchronously.
 *
 * The cache first, then the BUNDLED fallback — never null on a real build.
 * That second step matters more than it looks: before it, a cold load with an
 * empty cache left this null until the Supabase fetch landed, and `Game.tsx`'s
 * warm-up gives that fetch only `warmupMaxMs` (2500ms) before starting the run
 * anyway. Past the cap it primed the gate queue from an EMPTY pool, so
 * `pickWord` returned null and gates 1-2 were built from a bare tone: the HUD
 * showed the generic `TONE_INFO` placeholder (mā/má/mǎ/mà — hence "it's always
 * ma"), and with no word there was no clip to fetch, so the cue was synthetic
 * by definition rather than by losing a race. The catalog landing a moment
 * later reached the run through `setWords`, but a gate already spawned keeps
 * the word it was built with, so those first gates stayed wrong for the whole
 * run.
 *
 * The fallback is the default speaker's published catalog as of build time and
 * is a static import, so this costs no round trip and no bundle weight that
 * `src/data/words.ts` was not already paying. The live fetch still runs and
 * still publishes over this through `loadInventory`.
 */
let resolved: Word[] | null = catalogFromCache(DEFAULT_SPEAKER_ID) ?? catalogFromFallback();

export function subscribeInventory(fn: Listener): () => void {
  listeners.add(fn);
  // Immediately notify the new subscriber with the current resolved
  // inventory, if any. This ensures components that mount after an
  // `adoptInventory` still receive the current catalog and avoids the
  // race where a late subscriber would otherwise miss an earlier publish.
  // Length-checked, not just non-null: `resolved` is seeded synchronously now
  // and is only ever EMPTY when there is genuinely nothing to say (no cache,
  // no bundled rows — tests, or a build with an empty export). Handing a
  // subscriber an empty array is a no-op that reads like an answer, so this
  // keeps the pre-seed contract: notify immediately when there is a catalog,
  // stay quiet when there isn't.
  if (resolved && resolved.length > 0) fn(resolved);
  return () => {
    listeners.delete(fn);
  };
}

function publish(words: Word[]): void {
  resolved = words;
  for (const fn of listeners) fn(words);
}

/** The speaker whose words `inventoryNow()` is currently answering with. */
export function inventorySpeaker(): string {
  return speaker;
}

/**
 * Point the inventory at a speaker whose catalog is already in hand.
 *
 * Takes the words rather than fetching them, because the only caller that
 * knows which speaker to use (the calibration screen) has to read that
 * speaker's catalog anyway to check its four flight clips are published.
 * Fetching again here would pay for the same round trip twice.
 *
 * The recorded speaker comes from the words themselves, not from `id` — a
 * catalog fetch for `id` can degrade to another speaker's rows (e.g. the
 * bundled fallback snapshot when nothing is cached for `id`), and `id` alone
 * would then mislabel what was actually adopted. `inventorySpeaker()` is the
 * sole source of the `run_end.voice` analytics property, so this must report
 * what was really flown, not what was asked for. `id` is kept as the
 * fallback for the empty-words case, where there is nothing else to read it
 * from.
 */
export function adoptInventory(id: string, words: Word[]): void {
  speaker = words[0]?.speakerId ?? id;
  cache = Promise.resolve(words);
  publish(words);
}

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
  const forSpeaker = speaker;
  cache ??= fetchCatalog({ speaker: forSpeaker }).then((words) => {
    // `fetchCatalog` never rejects and never returns an empty list unless the
    // bundled export is itself empty, so there is nothing left to catch here.
    // The speaker is captured above and re-checked here: a fetch started for
    // the previous voice must not overwrite a catalog that has since been
    // adopted for another one.
    if (speaker === forSpeaker) publish(words);
    return words;
  });
  return cache;
}
