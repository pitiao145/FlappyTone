-- 0019_sampler_lists_published_only.sql
-- Fixes 0018's sampler seeding: it picked 30 candidates per proficiency from
-- the FULL 972-word HSK/TOCFL import, most of which are still `pending`
-- (unrecorded). A word with no published clip never becomes a `Word` object
-- at all (`wordsFromCatalog`'s `word_clips!inner` join drops it upstream),
-- so most of 0018's picks were invisible padding, not playable content —
-- sampler-intermediate ended up with only 2 of 30 slots actually playable,
-- while 4 real recorded two-syllable words (the tonepairs-v1 batch) sat
-- unused because they weren't in 0018's candidate pool (`tocfl1`-tagged) at
-- all. Reseeds from `word_clips.status = 'published'` directly.

delete from public.word_lists where list_id in ('sampler-beginner', 'sampler-intermediate');

insert into public.word_lists (word_id, list_id)
select w.id, 'sampler-beginner'
from public.words w
join public.word_clips wc on wc.word_id = w.id and wc.speaker_id = 'jane' and wc.status = 'published'
where w.syllables = 1 and w.tone between 1 and 4
order by w.position
limit 30;

insert into public.word_lists (word_id, list_id)
select w.id, 'sampler-intermediate'
from public.words w
join public.word_clips wc on wc.word_id = w.id and wc.speaker_id = 'jane' and wc.status = 'published'
where w.syllables = 2
order by w.position
limit 30;
