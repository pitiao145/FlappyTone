-- 0013_words_catalog.sql
-- The word catalog: single source of truth for every word the game and the
-- booth know about. Metadata is public (select for anon+authenticated); no
-- client write policy exists at all — the pipeline and the clips Worker write
-- with the service role. Same enforcement shape as leaderboard_scores.

create table public.words (
  id               text primary key,
  hanzi            text not null,
  pinyin           text not null,
  english          text not null default '',
  tone             smallint not null check (tone between 1 and 4),
  tones            smallint[] not null default '{}',
  syllables        smallint not null default 1 check (syllables >= 1),
  position         integer not null,
  status           text not null default 'pending'
                   check (status in ('pending','recorded','published','retired')),
  min_tier         text not null default 'free' check (min_tier in ('free','pro')),
  clip_key         text,
  duration_s       numeric,
  onset_s          numeric,
  clip_s           numeric,
  polyline         jsonb,
  contour          jsonb,
  raw_key          text,
  recorded_session text,
  recorded_at      timestamptz,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index words_tone_idx on public.words (tone);
create index words_status_idx on public.words (status);
create index words_position_idx on public.words (position);

create table public.lists (
  id     text primary key,
  name   text not null,
  source text,
  meta   jsonb not null default '{}'::jsonb
);

create table public.word_lists (
  word_id text not null references public.words (id) on delete cascade,
  list_id text not null references public.lists (id) on delete cascade,
  primary key (word_id, list_id)
);
create index word_lists_list_idx on public.word_lists (list_id);

create or replace function public.words_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.words_touch_updated_at() from public, anon, authenticated;
create trigger words_touch_updated_at
  before update on public.words
  for each row execute function public.words_touch_updated_at();

alter table public.words      enable row level security;
alter table public.lists      enable row level security;
alter table public.word_lists enable row level security;

create policy words_select      on public.words      for select to anon, authenticated using (true);
create policy lists_select      on public.lists      for select to anon, authenticated using (true);
create policy word_lists_select on public.word_lists for select to anon, authenticated using (true);

grant select on public.words, public.lists, public.word_lists to anon, authenticated;
