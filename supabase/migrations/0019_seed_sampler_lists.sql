-- 0019_seed_sampler_lists.sql
-- The original guest-sampler seed: first 30 by `position` within `tocfl1`,
-- per proficiency, with NO publication filter. Kept here for an accurate
-- migration history (this is what actually ran) — it's superseded by
-- 0020, which reseeds from `word_clips.status = 'published'` after most of
-- these picks turned out to be unrecorded, invisible padding rather than
-- playable content (see 0020's own header).

insert into public.word_lists (word_id, list_id)
select w.id, 'sampler-beginner'
from public.words w
join public.word_lists wl on wl.word_id = w.id and wl.list_id = 'tocfl1'
where w.syllables = 1 and w.tone between 1 and 4
order by w.position
limit 30
on conflict do nothing;

insert into public.word_lists (word_id, list_id)
select w.id, 'sampler-intermediate'
from public.words w
join public.word_lists wl on wl.word_id = w.id and wl.list_id = 'tocfl1'
where w.syllables = 2
order by w.position
limit 30
on conflict do nothing;
