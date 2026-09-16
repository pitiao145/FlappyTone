-- 0014_words_touch_search_path — pin the trigger function's search_path.
--
-- The security advisor flagged `words_touch_updated_at` as
-- `function_search_path_mutable`: with no `search_path` set, the function
-- resolves names against whatever the caller's path happens to be. It only
-- calls `now()`, so this is not exploitable today, but the same lint is why
-- `board_period` (0012) is written `set search_path = ''`. Fixed here rather
-- than by editing 0013, which has already been applied.
alter function public.words_touch_updated_at() set search_path = '';
