# SPEC — Supabase Phase 1: connect, guest leaderboard, dev-only auth seed

**Status:** proposed (updated 3 Sep 2026). Phase 1 of the DB migration. Reads together with `flappytone-ARCH-supabase.md` (the blueprint) — this is the scoped build.
**Goal:** the app is connected to Supabase and can read/write; a **leaderboard** is live for all players (anonymous included); a **dev-only login + profile page** exists so Pierre can build the account UI and seed his own profile — without shipping public accounts yet.
**NOT this phase:** public email accounts (Phase 2), voice-clip storage (Phase 3), any change to the pitch/audio engine.

> Region **Tokyo (ap-northeast-1)**, permanent. Chosen over EU because Phase 1 stores no audio and only a name + score, and the audience is in Taiwan.

---

## 1. Identity — Supabase **Anonymous Sign-In** (supersedes the old localStorage guest_id plan)

On first load the app calls `signInAnonymously()`: Supabase creates a real `auth.users` row (`is_anonymous = true`) and issues a JWT, silently. `auth.uid()` then works in every RLS policy — the anonymous player is a first-class, secured user. When they later add an email (Phase 2), the **same row upgrades to permanent** — no "claim guest rows" migration to build. See ARCH §1.

Per-device caveat (accepted, and the point): the anon session lives in localStorage, so clearing it / another browser / incognito = a new anonymous identity. That fragility *is* the "sign up to save across devices" hook.

## 2. What lives where — local-first now, sync on signup (LOCKED — see ARCH §1b)

- **Personal gameplay state stays local-first** for anonymous users: streak, daily-limit, per-tone accuracy aggregates, last-5 run history. Keep the existing `runHistory.ts` / `dailyLimit.ts` modules as that layer. Do **not** mirror these to Supabase for anon users.
- **The leaderboard score is the only thing written to Supabase for anonymous users** — it's shared/contestable, so it can't live in one browser.
- **Sync turns on at email signup (Phase 2):** upload local aggregates once into the now-permanent user's rows; Supabase becomes source of truth thereafter.
- **Shape-for-sync now (free):** make the local aggregate object's fields mirror the DB columns 1:1 (see ARCH §1b) so the future upload is a plain copy. Only ~5 runs stored locally today — this is about field-shape alignment, not data volume.

## 3. Project & wiring
1. Create project **flappytone**, org `pitiao145's Org`, region `ap-northeast-1` (free tier; 2nd active project alongside FlashAI is fine).
2. `src/data/supabase.ts` — single `createClient(url, publishableKey)`; call `signInAnonymously()` on load if no session.
3. Env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable, safe in bundle — RLS is the guard) in `.env.local` + Vercel. **Service-role key: Vercel server env only, never bundled.**
4. Add `@supabase/supabase-js` to `dependencies`. Enable **Anonymous + Email** sign-in in Auth settings.

## 4. Schema (migration `0001_leaderboard`)
```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) between 1 and 24),
  is_public     boolean not null default true,
  created_at    timestamptz not null default now()
);
create table public.leaderboard_scores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_id     text not null,                       -- ISO week "2026-W36"
  best_score  int  not null check (best_score between 0 and 1000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_id)
);
create index lb_week_rank on public.leaderboard_scores (week_id, best_score desc);
```

## 5. RLS (write it performance-correct from line one — ARCH §2)
```sql
alter table public.profiles enable row level security;
alter table public.leaderboard_scores enable row level security;

-- profiles: public read (names on the board), owner writes own row
create policy prof_read on public.profiles for select to authenticated, anon using (true);
create policy prof_upsert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy prof_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- leaderboard: anyone reads; NO client write policy → only api/score.ts (service role) writes
create policy lb_read on public.leaderboard_scores for select to authenticated, anon using (true);
```
Rules baked in: `(select auth.uid())`, `TO` roles set, policy columns indexed (`id` is PK; `user_id` FK indexed). Because tables are created via SQL migration (not the dashboard Table Editor), the migration must **also** `enable row level security` and `GRANT` privileges to `anon` / `authenticated` / `service_role` — the Table Editor does these automatically, raw SQL does not. Run `get_advisors` after applying and clear WARNs.

## 6. Write path — Vercel `api/score.ts` (Lane B; reuse existing api/ pattern, not a Deno Edge Function)
`POST /api/score { score }` with the caller's JWT →
- read `user_id` from the verified JWT (don't trust a client-sent id);
- validate `0 ≤ score ≤ 1_000_000`; rate-limit ~1 write / user / few seconds;
- compute `week_id` server-side (not from client clock);
- UPSERT `(user_id, week_id)`, raising `best_score` only.

Holds the service-role key. **Scope note:** stops casual devtools spoofing, not a determined attacker calling the endpoint directly — full anti-cheat is out of scope and not worth it now.

## 7. Leaderboard reads + UI (free-vs-paid split, per Notion)
- `getTopScores(weekId, limit)` → `order by best_score desc limit N` (join `profiles.display_name`).
- `getMyRank(weekId)` → `count(*) where best_score > mine) + 1`.
- **Free/guest:** top 3 + "you're #N of M". **Pro teaser:** full top-50 as a legible locked preview (existing dashed-gold 🔒 pattern) + EarlyBird CTA — don't give free the full list.
- Not on the board yet: game-over / leaderboard view shows a **"Join the board"** modal (opt-in, dismissible, can join later). Joining captures the display name, creates the `profiles` row, then submits.
- Already on the board: score submit on game-over is fire-and-forget; never blocks/crashes the end screen. `best_score` only rises (single-run best).
- A `profiles` row is created **only** on join-the-board or email signup — never automatically on anonymous sign-in. An anon who never joins has no profile and no leaderboard row.
- **Instrument from day one** — add to the `AnalyticsEvent` union in `src/analytics/session.ts`, fire via `track()` (`src/analytics/client.ts`), following existing events (`run_start`, `share_clicked`): `leaderboard_viewed`, `join_board_shown`, `join_board_submitted`, `score_submitted` (score, is_best, ok/failed). Without these we can't tell if the board drives anything.

## 8. Dev-only login + profile (the accounts seed)
- Enable Supabase **email magic-link** auth now (the Phase 2 foundation).
- Build the **Profile page** for real (it's the future account UI): in dev it reads the logged-in user; in prod it reads the anon identity + local stats.
- **Login UI gated behind `import.meta.env.DEV`, at the usage site** (hard rule 7 — a flag inside a component only hides it; gate the JSX where it mounts and verify it's absent from `dist/`).
- ⚠️ Seeding yourself as "#1": fine as a **dev fixture**. Do not ship a rigged production board — a board real users can't top kills the competitiveness that made it worth building.

## 9. Docs to update when this lands (not as an "exception" — as the new direction)
The project has outgrown v1's client-only boundary; accounts + backend are now the decided direction, already reflected in `CLAUDE.md`, `docs/PRD.md`, and `docs/DECISIONS.md` (5 Sep 2026). When Ring 1 actually ships, update those three to describe what is *in the code* — name `profiles` + `leaderboard_scores` + `api/score.ts` + anonymous auth + the dev-gated login, and the model (RLS read-open, server-only leaderboard write, personal stats local-first with sync-on-signup). Do not frame it as an exception to a rule; the rule is gone.

## 10. Order of work
1. Create project (Tokyo) + client + `signInAnonymously()` + env.
2. Migration `0001_leaderboard` + RLS; run advisors.
3. `api/score.ts` (Lane B).
4. Align local aggregate shapes to DB columns (shape-for-sync).
5. Leaderboard reads + UI (free teaser).
6. Dev-only magic-link login + Profile page.
7. CLAUDE.md update + `dist/` boundary check.
8. Deploy; watch engagement before Phase 2 (public accounts + sync-on-signup).

## 11. Codebase anchors (for the coding agent)

| Work item | Files (NEW = create) |
|---|---|
| Supabase client + `signInAnonymously()` at load | NEW `src/data/supabase.ts` (new `src/data/` dir) |
| Generated DB types (committed) | NEW `src/data/database.types.ts` via `generate_typescript_types` |
| Migration SQL (source of truth, committed) | NEW `supabase/migrations/0001_leaderboard.sql` — applied via the Supabase MCP `apply_migration` |
| Server write path | NEW `api/score.ts` — mirror `api/newsletter.ts` (`process.env` secrets, POST handler, shares `api/tsconfig.json`); tests mirror `api/_passcode.test.ts` |
| Score submit + Join-the-board modal | `src/ui/GameOver.tsx` (already has `stats.score`, `history.bestScore`, `isNewBest`); run stats type in `src/game/run.ts` |
| Local-first stats (source of truth; shape-for-sync) | `src/game/runHistory.ts` (bestScore + per-tone), `src/game/streak.ts`, `src/game/dailyLimit.ts` — keep as-is; align aggregate field names to the DB columns |
| Leaderboard UI (reusable component) | NEW `src/ui/Leaderboard.tsx` — self-contained, no new tab; render it **inside `src/ui/Progress.tsx`**, and reuse elsewhere later (e.g. game-over). Keep data-fetching in the component (or a small `src/data/leaderboard.ts` hook) so it drops in anywhere. |
| Pro teaser / free-vs-pro copy | `src/ui/plan.ts` (`FREE_FEATURES`, `PRO_FEATURES`, `PRO_PRICE`), shown in `src/ui/Profile.tsx` / `src/ui/Progress.tsx`; locked-preview via the existing `src/ui/ComingSoon.tsx` pattern |
| Analytics | `src/analytics/session.ts` (event union) + `src/analytics/client.ts` (`track`) |
| Dev-only login gate | follow the existing DEV-gate in `src/dev/Lab.tsx` + hard rule 7; verify absent from `dist/` |
| Env | add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to `.env.local` + Vercel; service-role key = Vercel server env only; add both public vars to `.env.example` |

## 12. Easy to miss (read before planning)

- **localStorage prefix is `toneflap.`**, not `flappytone.` (see `settings.ts`, `dailyLimit.ts`, `streak.ts`). Any new local key follows it — e.g. a display-name prefill cache `toneflap.identity.v1`.
- **`week_id` (ISO week) is computed server-side** in `api/score.ts` from the request time — never trust the client clock for the write. The client may compute the same value for display only.
- **Score submit is fire-and-forget and must never throw into the game-over UI** (same contract as `src/share/share.ts` and analytics). Read the caller's `user_id` from the verified JWT server-side; don't accept a client-sent id. A retry queue is a later nicety, not Phase 1.
- **Anon session must exist before the first submit** — `signInAnonymously()` runs at load in `src/data/supabase.ts`; guard the submit on a ready session.
- **Daily-run limit stays LOCAL for anon** (decided) — `dailyLimit.ts` unchanged; a server-enforced limit waits for real accounts (Phase 2), because clearing storage mints a new anon identity anyway.
- **Keep migration SQL in the repo and regenerate+commit `database.types.ts` after each migration** — reproducible + type-safe.
- **Currency reconcile (minor, not a blocker):** `PRO_PRICE` is `"$19"` in `src/ui/plan.ts` but the docs/Notion say €19 — pick one before pricing is marketed.

## Decided (3 Sep 2026)
- **`best_score` = single best run** (the highest score of one run), NOT cumulative across runs.
- **Name capture = a "Join the board" modal** — opt-in, not forced. A player can keep playing without joining; the modal offers it (on game-over / when viewing the leaderboard) and can be taken up later. Joining = capture display name -> create `profiles` row -> submit score. Until they join, the anon user simply has no profile/leaderboard row.
