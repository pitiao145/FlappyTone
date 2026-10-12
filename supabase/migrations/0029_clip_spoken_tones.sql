-- 0029: word_clips.spoken_tones — the tones a RECORDING was spoken with, when
-- the sandhi rules (src/game/sandhi.ts) cannot derive them. Null = derive by
-- rule. Written tones stay on `words` (TOCFL); everything measured from a voice
-- (tone accuracy reference, per-combo stats, tone shapes, averages) keys on the
-- spoken tones. A recording attribute, like `style` (DECISIONS.md).
-- Length vs words.syllables is checked in code (readSpokenTones), not here.

alter table public.word_clips
  add column spoken_tones smallint[] null
  constraint word_clips_spoken_tones_check check (
    spoken_tones is null
    or (cardinality(spoken_tones) between 1 and 4
        and spoken_tones <@ array[0,1,2,3,4]::smallint[])
  );

comment on column public.word_clips.spoken_tones is
  'Tones this take was spoken with, when sandhi rules cannot derive them (e.g. 和 natural = hàn {4}). Null = derive by rule.';

-- Jane's natural 和 is the spoken Taiwan reading hàn.
update public.word_clips set spoken_tones = '{4}'
  where word_id = 'he2' and style = 'natural';
