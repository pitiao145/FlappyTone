-- 0003_score_profile_fk — point leaderboard_scores at profiles, not just auth.users.
--
-- Both tables referenced `auth.users` and nothing else, so PostgREST saw no
-- relationship between them and could not resolve the one query the board
-- actually makes: "top scores, with each player's display name". Without this
-- the client would have to fetch scores, collect the ids, and fetch profiles in
-- a second round trip.
--
-- The constraint also states an invariant the product already relies on: a
-- score cannot exist without a profile, because joining the board is what
-- creates the profile. An attempt to write a score for a player who never
-- joined now fails in the database rather than producing a nameless row.
--
-- `auth.users` stays the ultimate owner — deleting a user cascades to their
-- profile, which cascades to their scores.

alter table public.leaderboard_scores
  drop constraint leaderboard_scores_user_id_fkey;

alter table public.leaderboard_scores
  add constraint leaderboard_scores_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
