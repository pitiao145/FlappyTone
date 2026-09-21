-- 0021_reseed_samplers_balanced.sql
-- 0019/0020 both picked `order by w.position limit 30`, but `words.position`
-- is grouped by tone, not interleaved across tones — so `sampler-beginner`
-- came out as 30 Tone-1 words and nothing else, and `sampler-intermediate`
-- was just the 4 `tonepairs-v1` words (all tone combo 3-2), because that was
-- the entire published two-syllable inventory when 0020 ran. `pickWord`
-- returns null when a tone has no candidates in the pool, so an all-Tone-1
-- sampler makes three in four guest gates degrade to a bare-tone corridor
-- with a synthetic sweep instead of a real recorded clip.
--
-- Jane has since recorded all of TOCFL 1-3: 214 published single-syllable
-- words and 244 published two-syllable words. Reseed both lists balanced
-- across tone (beginner) and tone combo (intermediate) instead of taking
-- an arbitrary position-ordered prefix.

delete from public.word_lists where list_id in ('sampler-beginner', 'sampler-intermediate');

-- sampler-beginner: 30 single-syllable words, spread evenly across tones 1-4
-- (~7-8 each) by taking the first few of each tone in position order.
insert into public.word_lists (word_id, list_id)
select id, 'sampler-beginner'
from (
  select
    w.id,
    row_number() over (partition by w.tone order by w.position) as rn
  from public.words w
  join public.word_clips wc on wc.word_id = w.id and wc.speaker_id = 'jane' and wc.status = 'published'
  where w.syllables = 1 and w.tone between 1 and 4
) ranked
where rn <= 8
order by rn, id
limit 30;

-- sampler-intermediate: 30 two-syllable words, spread across distinct tone
-- combos rather than exhausting one combo first.
insert into public.word_lists (word_id, list_id)
select id, 'sampler-intermediate'
from (
  select
    w.id,
    row_number() over (partition by w.tones order by w.position) as rn
  from public.words w
  join public.word_clips wc on wc.word_id = w.id and wc.speaker_id = 'jane' and wc.status = 'published'
  where w.syllables = 2
) ranked
order by rn, id
limit 30;
