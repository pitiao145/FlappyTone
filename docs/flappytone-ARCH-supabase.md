# ARCHITECTURE — FlappyTone on Supabase

**Status:** design reference (3 Sep 2026). The forward-looking blueprint the phased build follows. Scoped delivery lives in `flappytone-SPEC-supabase-phase1.md`; this doc is the *why* and the shape everything grows into. Region: **Tokyo (ap-northeast-1)**, permanent.

Sources for the non-obvious calls are cited inline as `[n]`; the list is at the bottom. The rule for this doc: **secure by default, cheap now, no dead-ends later.** Nothing here forces work before it's needed — it just makes sure today's tables don't have to be torn out when the app grows.

---

## Vendor decision — Supabase for DB + Auth, Cloudflare R2 for object storage (LOCKED, 5 Sep 2026)

Evaluated against Cloudflare's stack (already have the account + `flappytone.com` + DNS there). Outcome: **use each vendor for what it is best at, not one for everything.**

- **Database + Auth → Supabase.** The deciding factor is **auth**: Cloudflare has no managed *consumer* auth product (Cloudflare Access gates internal/employee apps, not app users), so an all-Cloudflare path means hand-rolling auth (Better Auth / Clerk / Lucia) on top of D1 and rebuilding the anonymous→permanent upgrade flow ourselves. Supabase Auth gives it first-party, including the anonymous sign-in this whole architecture depends on (§1). On the DB side, Supabase's **Postgres** suits the tone-analytics/rollup roadmap (§4) better than Cloudflare **D1** (serverless SQLite — fine for simple edge reads, weaker for aggregation, with per-DB size limits).
- **Object storage (voice clips, Phase 3) → Cloudflare R2.** R2's **zero egress** wins for serving audio at volume, we are already on Cloudflare, and this is already the repo's decided plan (`docs/R2_SETUP.md`, `docs/flappytone-SPEC-r2-clip-storage.md`). Supabase Storage would work but bills egress.
- **The "one less vendor" pull toward all-Cloudflare is real but weak here** — the one thing it would consolidate (auth) is exactly the core need it can't cover. Multi-vendor (Supabase DB/Auth + Cloudflare DNS/R2) is normal and costs nothing.
- **Free-tier gotcha to remember:** Supabase pauses a project after ~1 week of inactivity (the existing "FlashAI" project is paused for this reason); D1 does not. Manageable, just expect it on a quiet new project.

Don't re-open this. Sources: getdeploying Cloudflare-vs-Supabase; DevToolReviews D1-vs-Neon-vs-Supabase (2026); Mahesh Waghmare "D1 vs Supabase, 6 months in production".

## 0. The one mental model to hold: three temperatures of data

Almost every scaling mistake in an app like this comes from mixing three kinds of data that behave completely differently. Keep them in separate tables and the system scales; blur them and it seizes up at a few thousand players.

| Temperature | What it is | Write rate | Read rate | Example |
|---|---|---|---|---|
| **Identity** (cold) | who a player is | once | rare | `profiles` |
| **State / aggregates** (warm) | the *current* answer to a question | occasional | constant | `leaderboard_scores`, `tone_stats` |
| **Events** (hot) | raw log of everything that happened | huge | almost never (batch only) | `run_events` |

The golden rule: **you never compute a warm answer by scanning hot events at read time.** A leaderboard that runs `SELECT ... FROM run_events` on every page load dies the day you get traffic. Instead, events flow *in*, and small aggregate rows are updated *incrementally* — the read is always a tiny indexed lookup. This is the standard rollup pattern for analytics on Postgres [5][6].

This single idea is what lets "just a name and a score" today become "per-tone accuracy trends for 50,000 players" later without a rewrite.

---

## 1. Auth: use Supabase **Anonymous Sign-In**, not a hand-rolled guest id

This is the finding that improves on the Phase 1 spec's `localStorage` guest_id.

Supabase has native **anonymous sign-in**: on first load, the app calls `signInAnonymously()`, which creates a **real `auth.users` row** (`is_anonymous = true`) and issues a JWT. From that moment `auth.uid()` works in every RLS policy — the anonymous player is a first-class user [7].

Why this is strictly better than a `guest_id` column you manage yourself:
- **`user_id` is never null.** Every row everywhere is owned by a real `auth.uid()`. RLS is uniform — no "guest OR user" branching.
- **Signup is a *conversion*, not a migration.** When the player later adds an email (magic link), the **same user row** upgrades to permanent (`is_anonymous` flips to false). Their scores, stats, and progress are already theirs — **there is no "claim guest rows" step to build.** That whole class of bug disappears.
- **It's the idiomatic Supabase pattern** for exactly this "play now, account later" flow.

Tradeoffs to handle (all cheap):
- Anonymous users still live per-device (localStorage holds the session) — same limitation as a guest_id, which is fine: "sign up to save across devices" stays the hook.
- Anonymous rows accumulate in `auth.users`. Add a periodic cleanup (delete anonymous users with no activity older than N days) — a scheduled SQL job, later, not now [7].
- Enable it deliberately in Auth settings; keep email confirmations on for real signups.

**So the model is:** anonymous user (day one) → same user adds email (Phase 2) → permanent account. One identity throughout.

`profiles` table mirrors `auth.users` for app-facing fields:
```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) between 1 and 24),
  is_public     boolean not null default true,   -- show on leaderboard?
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
```

---

## 1b. What lives where — local-first now, server-sync on signup (LOCKED)

The single most important operational decision, and the answer to "should we just write everything to Supabase now that we have it?" — **no.** Here is the rule the build follows.

| Data | Anonymous user | After email signup |
|---|---|---|
| Streak, daily-limit counter | **localStorage (source of truth)** | synced to Supabase |
| Per-tone accuracy **aggregates**, lifetime counts, best | **localStorage (source of truth)** | synced to Supabase (`tone_stats`, `profiles`) |
| Last-5 run history (display cache) | **localStorage only** | localStorage only (raw runs are hot data — Ring 3, not synced) |
| Leaderboard score | **written to Supabase** (only server write for anon) | written to Supabase |

**Why anonymous personal stats stay local, not on the server:**
- **No durability gain before signup.** An anonymous session *also* lives in localStorage. Clearing it loses the wristband, which loses the pointer to any server rows anyway — so server-side is no more durable than local for an anon user, at strictly higher cost.
- **Write volume for disposable identities.** With a ~6% return rate, most anonymous players play once. Mirroring every run to the DB spends rows/writes/egress on drive-bys who evaporate.
- **Latency & offline.** The game is a per-frame voice loop; localStorage is instant and works offline. A server round-trip per run adds latency and a new failure mode ("did my run save?").
- **It protects the signup hook.** "Sign up to save your progress across devices" is only true *because* anon progress is local and fragile. Pre-syncing it silently would gut the pitch.

**Why the leaderboard is the exception:** it is shared and contestable — it cannot live in one browser — so it must be server-side from day one. The anonymous identity exists mainly to submit the score (Lane B). Sending the score up does **not** mean mirroring all stats up.

**The sync-on-signup step:** when a player adds an email, upload their local aggregates once into their (now permanent) user's rows; from then on Supabase is the source of truth, synced across devices. This is simple and safe — same anon→permanent identity, so it's "read localStorage, write my own rows," not the messy guest-ID stitching we avoided.

### Shape-for-sync rule (do this now, it's free)
The durable thing to sync is the **aggregate object**, not raw runs. So the local aggregate's field names should **mirror the DB columns 1:1** (`tone_stats`: `tone`, `attempts`, `hits`, `sum_accuracy`, `best_accuracy`; profile: `display_name`, `streak`, lifetime counts). Then the signup upload is a plain field-for-field copy, not a translation layer. There is almost no data to move (only ~5 runs are stored locally) — the point is **field-shape alignment today** so the future write is trivial. Keep using the existing `runHistory.ts` / `dailyLimit.ts` local modules as that local layer; just align their aggregate shape to the columns above.

## 2. RLS is the security backbone — and it must be written for performance from line one

RLS enforced at the database means a stolen anon key still can't read or write anything the policy forbids — security lives in Postgres, not in hope that the client behaves [1]. **Every table in `public` gets RLS enabled**, no exceptions [1].

But naive RLS silently becomes a performance bomb as tables grow, because a helper like `auth.uid()` can run **once per row** instead of once per query [2][3]. The research gives four rules that turn 170ms scans into sub-millisecond ones — we bake them in from the start, not as a later "optimization":

1. **Wrap auth helpers in a subquery.** `(select auth.uid()) = user_id`, never bare `auth.uid() = user_id`. Caches the value per-query. (Up to ~100x; this is exactly what Supabase's own advisor lint `0003_auth_rls_initplan` flags.) [2][3]
2. **Index every column used in a policy.** A policy on `user_id` needs a btree index on `user_id`. (171ms → <0.1ms on a 100k-row table.) [2]
3. **Always add `TO authenticated`** (anonymous users count as authenticated). Stops the policy from even running for the `anon` role. [2]
4. **Filter in the query too, not just in the policy** — `.eq('user_id', uid)` even though RLS already enforces it, so Postgres builds a better plan. [2]

For anything that needs to check another table (e.g. "is this user Pro?"), use a **`security definer` function in a private (non-exposed) schema** instead of a join inside the policy — it bypasses the joined table's RLS and is dramatically faster [2]. Never put a security-definer function in an exposed schema.

`auth.jwt()` note: authorization facts (like `is_pro`) go in `app_metadata` (user cannot edit it), **never** `user_metadata` (user can) [1].

---

## 3. Write paths: two lanes, chosen by trust

Not every write needs a server function, and not every write can be trusted to the client. Split by whether the client is allowed to decide the value.

**Lane A — client-direct through RLS (default for owned data).**
For a player writing *their own* profile, settings, or personal stats, the browser writes straight to Supabase via `supabase-js`; RLS guarantees they can only touch their own rows. No server code. This is the whole point of Supabase and it's secure *because* of RLS [1].

**Lane B — server-authoritative through a Vercel function (for anything contestable).**
A **leaderboard score** is contestable — a player must not be able to write "I scored 999,999." So that write goes through a Vercel serverless function (`api/score.ts`) holding the **service-role key** (server-only env var, never bundled), which validates and writes. This reuses your existing `api/` pattern (`auth.ts`, `upload.ts`) — no new Deno/Edge runtime to learn.

Rule of thumb: **if the client could lie about the value and it matters, it goes through Lane B.** Score submission, granting Pro after payment, anything anti-cheat — Lane B. Everything a user simply owns — Lane A.

> Serverless + Postgres connection note: if a Vercel function ever opens a **direct** Postgres connection (e.g. Prisma), it must use Supabase's **transaction-mode pooler (Supavisor, port 6543)**, not a direct connection, or serverless concurrency exhausts the connection limit [8][9]. But if the function uses `supabase-js` (HTTP/PostgREST, as recommended here), that layer already pools for you — one less thing to manage. Prefer `supabase-js` in the functions.

---

## 4. The schema, grown in three rings

### Ring 1 — ship now (Phase 1): identity + leaderboard
```sql
-- current-best per player per week. WARM: written on a new best, read constantly.
create table public.leaderboard_scores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_id     text not null,                       -- ISO week "2026-W36"
  best_score  int  not null check (best_score between 0 and 1000000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_id)
);
alter table public.leaderboard_scores enable row level security;
create index lb_week_rank on public.leaderboard_scores (week_id, best_score desc);

-- read: top N for a week + a player's own rank. Write: Lane B only.
create policy lb_read on public.leaderboard_scores
  for select to authenticated, anon using (true);
-- no insert/update policy → clients cannot write; api/score.ts (service role) does.
```
Weekly reset is implicit — reads filter to the current `week_id`, no cron. Display name is joined from `profiles` at read time (or denormalized in — see §6).

### Ring 2 — near future (Phase 2+): per-tone progress as a *warm aggregate*
The thing you specifically want — per-player tone accuracy and progress over time — lives as a **rollup**, updated as runs finish, not recomputed from raw events:
```sql
-- one row per player per tone. WARM aggregate. This is what Progress/Profile reads.
create table public.tone_stats (
  user_id       uuid not null references auth.users(id) on delete cascade,
  tone          smallint not null check (tone between 1 and 4),
  attempts      bigint not null default 0,
  hits          bigint not null default 0,
  sum_accuracy  double precision not null default 0,  -- for a running mean
  best_accuracy real not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, tone)
);
```
Accuracy = `hits / attempts`; trend needs periodic snapshots (Ring 3). Owner-only RLS: `(select auth.uid()) = user_id`, indexed on `user_id`, `TO authenticated`.

### Ring 3 — later, only if analytics demand it: raw events + snapshots
```sql
-- HOT. One row per gate attempt. Append-only. Never read at request time —
-- batch-rolled into tone_stats. Partition by month when it gets big [4][5].
create table public.run_events (
  id         bigint generated always as identity,
  user_id    uuid not null,
  run_id     uuid not null,
  tone       smallint,
  accuracy   real,
  created_at timestamptz not null default now()
);
-- weekly/daily snapshot of tone_stats → powers "accuracy over time" charts.
create table public.tone_stat_snapshots (
  user_id uuid, tone smallint, week_id text,
  attempts bigint, hits bigint, mean_accuracy real,
  primary key (user_id, tone, week_id)
);
```
Ring 3 is explicitly deferred. **You do not need raw events to ship progress** — `tone_stats` (Ring 2) gives per-tone accuracy directly. Add `run_events` only when you want analysis you didn't pre-aggregate, and **partition it by time** so old data prunes cheaply and queries stay fast [4][5]. Postgres handles this scale for a very long time; the day it genuinely doesn't is a "pipe events to a columnar store" problem, years away and a good problem to have [5].

**Why this ordering is safe:** every ring adds tables; none rewrites an earlier one. `leaderboard_scores` and `tone_stats` never change shape when `run_events` arrives. That is the whole point.

---

## 5. Storage (Phase 3, voice clips) — sketch only, do not build yet
Private bucket, RLS on `storage.objects`, files namespaced by `user_id` prefix; downloads via **signed URLs**, never a public bucket [1]. Set a **max upload size and allowed content-types at the bucket level**, and a high `cache-control` to cut egress [10]. Index the storage RLS columns [10]. This still respects the standing rule — *never store raw voice; store derived numbers* — so this bucket is for things like user-recorded reference takes if that feature is ever validated, not raw gameplay audio. Reassess against the deferred R2 plan when the time comes.

---

## 6. Denormalization: allowed, on purpose, in one place
Joining `profiles` for a display name on every leaderboard read is fine at small scale. If the board ever gets hot, copy `display_name` into `leaderboard_scores` at write time (Lane B already runs there) so the read touches one table. This is a deliberate, documented trade (write a bit more to read a lot faster) — not the default, but the right tool for the single hottest read.

---

## 7. Security checklist (run before every deploy that touches the DB)
- [ ] RLS **enabled** on every `public` table; policies exist for each needed operation [1].
- [ ] Every policy uses `(select auth.uid())`, has `TO authenticated`, and its columns are indexed [2][3].
- [ ] Service-role key exists **only** in Vercel server env — never in any `VITE_` var, never in the bundle. (Grep the build for it.) [1]
- [ ] `app_metadata` for authorization flags (e.g. `is_pro`), never `user_metadata` [1].
- [ ] Contestable writes (score, Pro-grant) go through Lane B, validated server-side.
- [ ] Run the **Supabase Security & Performance Advisors** after each migration and clear WARNs [2] — I can do this via the connector (`get_advisors`).
- [ ] `security definer` functions live in a **private, non-exposed** schema [2].

---

## 8. Migration discipline
- Every schema change is a **numbered migration** applied via the connector (`apply_migration`), never a hand edit in the dashboard — so the schema is reproducible and reviewable.
- **Regenerate TypeScript types** (`generate_typescript_types`) after each migration and commit them, so the client is type-safe against the real DB.
- Update the CLAUDE.md hard rule the first time accounts/backend land (deliberate exception, documented like the record-booth one), and again when `run_events` breaks "no gameplay backend."
- Test locally (Supabase CLI) before touching the remote project where practical.

---

## 9. What to actually do first (unchanged scope, better foundation)
Phase 1 stays small. The only change this doc makes to the earlier spec: **use anonymous sign-in instead of a localStorage guest_id**, which deletes the future "claim guest rows" work. Concretely: enable anonymous + email auth → `profiles` + `leaderboard_scores` (Ring 1) with the RLS rules above → `api/score.ts` (Lane B) → leaderboard UI (free teaser / Pro full) → dev-gated login to build the Profile page. Rings 2–3 wait.

## Sources
1. Supabase — Row Level Security. https://supabase.com/docs/guides/database/postgres/row-level-security
2. Supabase — RLS Performance and Best Practices. https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
3. Supabase — Advisor lint 0003_auth_rls_initplan. https://supabase.com/docs/guides/database/database-advisors?lint=0003_auth_rls_initplan
4. jusDB — Database Schema Design for Scalability (2026). https://www.jusdb.com/blog/database-schema-design-for-scalability-summary-and-best-practices
5. Gameball Eng — Scaling Analytics with PostgreSQL Rollup Tables. https://engineering.gameball.co/posts/scaling-analytics-with-postgresql-rollup-tables
6. Citus Data — Scalable incremental data aggregation on Postgres. https://www.citusdata.com/blog/2018/06/14/scalable-incremental-data-aggregation/
7. Supabase — Anonymous Sign-Ins. https://supabase.com/docs/guides/auth/auth-anonymous
8. dev.to — Supabase Connection Pooling with PgBouncer on Vercel Serverless. https://dev.to/mahdi_benrhouma_fe1c6005/supabase-connection-pooling-with-pgbouncer-on-vercel-serverless-1o33
9. Supabase — Connect to your database (pooler modes). https://supabase.com/docs/guides/database/connecting-to-postgres
10. Supabase — Storage Optimizations / Scaling. https://supabase.com/docs/guides/storage/production/scaling
