-- 0015_voice_roster.sql
-- A word stops having one recording.
--
-- `speakers` is the roster; `word_clips` holds everything that is MEASURED
-- from a recording, keyed (word_id, speaker_id). `words` keeps only what is
-- true of the word regardless of who says it — including `min_tier`, which is
-- game access and identical for every voice.
--
-- The old measurement columns on `words` are deliberately LEFT IN PLACE here.
-- They are dropped in a later migration, after the app reads the new shape, so
-- there is a window where both work and a rollback loses nothing.

create table public.speakers (
  id         text primary key check (id ~ '^[a-z0-9]{1,16}$'),
  name       text not null,
  gender     text not null check (gender in ('female','male')),
  accent     text not null default 'tw',
  -- The clip pipeline's pitch-search SEED, not a measurement. Jane's is the
  -- literal 168 that `clipPipeline.ts` pinned; seeding from anything else
  -- moved 90 of 120 polylines in the 3rd decimal (see DECISIONS.md).
  f0_seed    numeric not null,
  is_default boolean not null default false,
  -- False until this speaker's set is complete enough to expose to players.
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one default, enforced rather than assumed: resolution falls back to
-- it, so two defaults would make which voice a player hears non-deterministic.
create unique index speakers_one_default on public.speakers (is_default) where is_default;

create table public.word_clips (
  word_id          text not null references public.words(id) on delete cascade,
  speaker_id       text not null references public.speakers(id) on delete restrict,
  status           text not null default 'pending'
                   check (status in ('pending','recorded','published','retired')),
  clip_key         text,
  raw_key          text,
  duration_s       numeric,
  onset_s          numeric,
  clip_s           numeric,
  polyline         jsonb,
  contour          jsonb,
  recorded_session text,
  recorded_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (word_id, speaker_id)
);

-- The primary key already indexes `word_id` (it leads the key), so only the
-- other foreign key needs its own — an unindexed FK is the standard
-- `get_advisors` performance lint.
create index word_clips_speaker_idx on public.word_clips (speaker_id);
create index word_clips_speaker_status_idx on public.word_clips (speaker_id, status);

-- Reuses `words_touch_updated_at`, whose search_path was pinned in 0014. Do
-- not write a second function: a copy would arrive unpinned and re-trigger the
-- `function_search_path_mutable` advisor.
create trigger word_clips_touch before update on public.word_clips
  for each row execute function public.words_touch_updated_at();

alter table public.speakers   enable row level security;
alter table public.word_clips enable row level security;

create policy speakers_select   on public.speakers   for select to anon, authenticated using (true);
create policy word_clips_select on public.word_clips for select to anon, authenticated using (true);

-- RLS narrows; it does not grant. Without these, correct policies still yield
-- "permission denied for table".
grant select on public.speakers   to anon, authenticated;
grant select on public.word_clips to anon, authenticated;

insert into public.speakers (id, name, gender, accent, f0_seed, is_default, active)
values ('jane', 'Jane', 'female', 'tw', 168, true, true);

-- Backfill, preserving clip_key/raw_key VERBATIM: they are explicit columns,
-- not conventions, so every existing R2 object keeps its current key and no
-- bulk move is needed.
insert into public.word_clips (
  word_id, speaker_id, status, clip_key, raw_key,
  duration_s, onset_s, clip_s, polyline, contour,
  recorded_session, recorded_at, updated_at
)
select
  id, 'jane', status, clip_key, raw_key,
  duration_s, onset_s, clip_s, polyline, contour,
  recorded_session, recorded_at, updated_at
from public.words;
