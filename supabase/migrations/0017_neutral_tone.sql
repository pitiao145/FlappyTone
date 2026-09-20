-- 0017_neutral_tone.sql
-- Widens `words.tone` to allow 0 (neutral tone, e.g. 的/了) alongside the
-- existing 1-4. `tones[]` already used 0 for a neutral syllable inside a
-- multi-syllable word; this reuses that same sentinel for the singular
-- `tone` field on a fully-neutral single syllable, rather than inventing a
-- second neutral-tone concept. `wordsFromCatalog` (src/game/words.ts) still
-- only accepts `tone` in {1,2,3,4} for the live game/visualiser inventory,
-- so a tone-0 word stays recordable and catalogued but never reaches a
-- player — see docs/DECISIONS.md's "Neutral tone gets a sentinel, not a new
-- concept" entry.

alter table public.words drop constraint words_tone_check;
alter table public.words add constraint words_tone_check check (tone between 0 and 4);
