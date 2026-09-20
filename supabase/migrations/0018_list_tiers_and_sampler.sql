-- 0018_list_tiers_and_sampler.sql
-- Adds a tier requirement to `lists` (which TOCFL level a tier can ever
-- unlock, regardless of proficiency) and two curated sampler lists for the
-- guest tier's fixed 30-word pools. See docs/DECISIONS.md and CLAUDE.md's
-- tier/gating sections for the full model: `lists.min_tier` expresses the
-- coarse union access a tier has to a level; the finer per-proficiency
-- split (e.g. free's Intermediate access to TOCFL1 only, not TOCFL2) is
-- enforced client-side by `src/game/tiers.ts`'s `tierLimits()`, not by this
-- column — the Worker only ever needs the coarse union to decide "may this
-- tier ever fetch this word's clip at all."

alter table public.lists
  add column min_tier text not null default 'free' check (min_tier in ('free', 'pro'));

-- Existing tocfl3/hsk3 rows require pro; everything else stays free (the
-- default). hsk* lists are unused by the game today (CLAUDE.md: "we don't do
-- anything with it for now") but are given the same tier as their TOCFL
-- counterpart so they don't silently diverge if that changes.
update public.lists set min_tier = 'pro' where id in ('tocfl3', 'hsk3');

insert into public.lists (id, name, source, min_tier)
values
  ('sampler-beginner', 'Guest sampler (single syllable)', 'curated', 'free'),
  ('sampler-intermediate', 'Guest sampler (two syllable)', 'curated', 'free')
on conflict (id) do nothing;
