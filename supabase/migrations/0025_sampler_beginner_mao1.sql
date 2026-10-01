-- 0025_sampler_beginner_mao1.sql
-- The calibration flight (`CALIBRATION_WORD_IDS`) flies mao1 as its second
-- Tone 1 gate. mao1 is in `tocfl3` and no sampler list, so the clips Worker's
-- level gate 403'd it for guest and free tickets and the cue silently fell back
-- to the synthetic sweep. Sampler words bypass that gate (`SAMPLER_LIST_IDS` in
-- workers/clips/src/routes/clip.ts), so list it in sampler-beginner.
--
-- ⚠ 0021 reseeds samplers with `delete` + `insert`; a future reseed must keep
-- every CALIBRATION_WORD_IDS member in sampler-beginner or this regresses.

insert into public.word_lists (word_id, list_id)
values ('mao1', 'sampler-beginner')
on conflict do nothing;
