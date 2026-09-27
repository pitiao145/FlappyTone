-- 0024_clip_style.sql
-- A recording gains a pronunciation style: 'textbook' (today's slow,
-- exaggerated citation-form takes) or 'natural'. Style is a property of a
-- RECORDING, not of a word or a speaker — same reasoning as 0015's
-- "speaker, not a voice enum" (docs/DECISIONS.md): a word doesn't have a
-- style, a given take of it does, so it goes on `word_clips`.
--
-- The game itself does not change in this migration. `catalogRows.ts`'s
-- `CATALOG_SELECT` keeps filtering to speaker via `word_clips!inner`, and
-- gains an explicit `.eq("word_clips.style", "textbook")` so a natural row
-- can never leak into a run before the game-side slice lands.

alter table public.word_clips
  add column style text not null default 'textbook'
    check (style in ('textbook', 'natural'));

-- Existing rows are all textbook takes; the column default backfills them
-- with no separate UPDATE needed.

-- The primary key widens to include style, since a speaker now has up to two
-- rows per word. Drop and recreate rather than ALTER ... ADD, since a PK
-- change isn't expressible as a single ALTER of the existing constraint.
alter table public.word_clips drop constraint word_clips_pkey;
alter table public.word_clips add primary key (word_id, speaker_id, style);

-- The old (speaker_id) and (speaker_id, status) indexes are superseded by a
-- style-scoped version — every read that used to filter by speaker+status
-- (the booth split, clipReview's medians) now also filters by style.
drop index if exists word_clips_speaker_idx;
drop index if exists word_clips_speaker_status_idx;
create index word_clips_speaker_style_idx on public.word_clips (speaker_id, style);
create index word_clips_speaker_style_status_idx on public.word_clips (speaker_id, style, status);

-- RLS policies and grants are unaffected — style is just another selected
-- column on a row anon/authenticated could already read.
