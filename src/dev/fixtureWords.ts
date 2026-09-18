/**
 * The four tone-pair recordings, as `Word`s the game can actually fly —
 * without a database, a Worker or a play ticket.
 *
 * Dev-only, and the reason it exists: the plan's rule is that pairs must be
 * playable before any multi-syllable word is imported into the live catalog,
 * so the engine and UI work can be flown and tuned against real audio instead
 * of against a schema. Nothing in `src/` imports this outside a
 * `import.meta.env.DEV` branch, and the audio it names lives in
 * `public/dev-fixtures/`, which only exists on a machine that has run
 * `npm run tonepairs:fixtures`.
 *
 * The JSON is generated, not hand-written — by `generate-fixture-words.ts`,
 * through the real `cutClip(…, syllables)` and the real cohort
 * normalisation, so what the Lab flies is measured the same way a published
 * clip would be. Regenerate it rather than editing it.
 */

import type { Word } from "../game/words.ts";
import generated from "./fixtureWords.json" with { type: "json" };

/**
 * `clipKey` prefix that tells `src/audio/reference.ts` to fetch the audio
 * from `public/dev-fixtures/` instead of the clips Worker. A published row's
 * `clip_key` is an R2 object path and can never start with this.
 */
export const FIXTURE_CLIP_PREFIX = "fixture:";

/** Traditional hanzi, checked against a Traditional reference, not by eye. */
export const FIXTURE_WORDS = generated.words as unknown as Word[];
