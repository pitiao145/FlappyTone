# Audio Migration (Word Catalog + Cloudflare Clips) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move word metadata into a Supabase `words` table, move all clip audio (raw takes and processed clips) into two private Cloudflare R2 buckets served through a ticket-gated Worker, make the recording booth database-driven so Jane only ever sees unrecorded words, and retire Vercel Blob, `public/ref/*.wav` and `manifest.json`.

**Architecture:** Supabase Postgres is the single source of truth for words, lists and pipeline status; the app reads it live (cached in localStorage) with a bundled JSON snapshot as offline fallback. A Cloudflare Worker (`workers/clips/`) owns both buckets through R2 bindings: it issues short-lived signed "play tickets" to guests and accounts alike, serves `/clip/:id` against a ticket with edge caching and a Pro gate, receives booth uploads into the raw bucket and flips the word's status, and serves the booth its pending/recorded word lists. A local `process-clips` script turns recorded takes into published clips using the existing, unchanged `clipCut`/`clipNormalize`/`clipReview` measurement.

**Tech Stack:** React 19 + Vite + TypeScript (unchanged), Supabase (Postgres + Auth, ES256 JWTs), Cloudflare Workers + R2 (bindings, no S3 SDK), `wrangler` (deploy + `r2 object get/put` for local scripts), `jose` (JWT verify/sign in the Worker), vitest.

**Spec:** `docs/SPECS/flappytone-SPEC-clip-catalog-r2.md`, as amended by the "Decisions that override the spec" section below. Read the spec first, then this plan. Where they disagree, this plan wins.

**Branch:** `audio-migration`, created off `main`. One commit per task minimum. Never push unless Pierre asks.

## Global Constraints

- Hard rules in `CLAUDE.md` all still apply. The ones this work touches: **#5** (`src/pitch/` has no Web Audio), **#7** (dev tooling behind `import.meta.env.DEV`, check the `dist/` grep after any dev-tooling change), **#9** (all hanzi Traditional).
- **`src/data/` never throws into a caller.** Every new function there resolves to a fallback value on failure and logs once through `warn()` from `src/data/supabase.ts`.
- **The game never waits on audio.** `loadClip` stays fire-and-forget; an unloaded clip plays the synthetic sweep. Do not add an await on a clip anywhere in `src/game/` or the run loop.
- **The marketing page (`src/ui/Landing.tsx` and its imports) must not import `src/audio/`, `src/pitch/` or `src/data/`.** After touching it: `npm run build && grep -l PitchTracker dist/assets/*.js` lists only the app + record chunks, and `grep -l supabase dist/assets/*.js` must not list the landing chunk.
- **`src/dev/clipCut.ts` is the only measurement.** Do not modify it, `clipNormalize.ts` or `clipReview.ts` in this plan. After Task 11, `git diff fixtures/anchors` must be empty.
- **Migrations are applied through the Supabase MCP `apply_migration`**, never by hand. Raw SQL must `enable row level security` and `GRANT` explicitly. Regenerate `src/data/database.types.ts` and run `get_advisors` (security and performance) after every migration.
- **Node-only scripts** go in `tsconfig.node.json`'s `include` and `tsconfig.app.json`'s `exclude`. Every new `src/dev/*.ts` script in this plan does both.
- **A test file in `api/` must be named `_*.test.ts`.**
- **Ask before adding a dependency** beyond the two approved here: `wrangler` and `jose` (plus `@cloudflare/workers-types` for typing, which is types-only).
- **Nothing is deleted in the same task that copies it.** Old clips, raw takes and Blob stay until the verify tasks pass.
- Word `id` is `^[a-z0-9]{1,32}$`; session id is `^[a-z0-9-]{1,40}$`. Both validated, never sanitised.

## Decisions that override the spec

These came out of the planning session and replace the matching parts of the spec.

1. **JWTs are ES256, not HS256.** The Supabase project signs with an asymmetric P-256 key (see `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). The Worker verifies Supabase tokens against that JWKS with `jose`'s `createRemoteJWKSet`. There is no `SUPABASE_JWT_SECRET`.
2. **Guests get clips.** Spec §0's "no JWT ⇒ no clips" is dropped. The Worker issues a **play ticket** (`POST /token`) to anyone. A signed-in caller's Supabase JWT is verified and the ticket carries their tier (`guest` | `free` | `pro`); no JWT means a `guest` ticket. Tickets are HS256 JWTs signed with the Worker's own `CLIP_TOKEN_SECRET`, expire in 30 minutes, and carry the requesting IP. `/clip/:id` verifies the ticket locally, no database call. Only words with `min_tier='pro'` need `tier='pro'`. Bulk-download resistance comes from: private bucket, no listing, one clip per request, a Cloudflare rate-limiting rule on `/clip/*`, short-lived IP-bound tickets. Turnstile is a later add-on, designed for but not built.
3. **`words.position integer not null`** defines inventory order (Jane's recording order and the free-tier rank). `created_at` is not an order.
4. **Booth status sync.** `POST /raw` sets `words.status='recorded'`, `raw_key`, `recorded_session`, `recorded_at` after the R2 put succeeds; if that DB write fails the Worker returns 500 so the booth's uploader retries (the put is idempotent). The booth reads `GET /booth/words` from the Worker (passcode-gated): pending words first, then a collapsed "recorded (tap to redo)" list. Server status wins over localStorage.
5. **Status values:** `pending → recorded → published`, plus `retired` for a word dropped from every list but already recorded. Re-recording a published word sets it back to `recorded`; the app keeps serving the old clip until `process-clips` re-publishes.
6. **Edge cache vs `private`.** Cloudflare's Cache API will not store a `Cache-Control: private` response. The Worker stores a copy with `public, max-age=604800, immutable` under a cache key that includes `?v=`, and returns the client a copy with `private, max-age=604800, immutable`.
7. **Catalog payload excludes `contour`.** `contour` is 68KB of a 92KB manifest and is used only by the landing page's tone charts and the Lab. `fetchCatalog` selects everything but `contour`; the bundled `wordsFallback.json` includes it and is what the landing page reads (static import, never Supabase).
8. **Raw takes migrate too.** Every session currently in Vercel Blob is pulled to disk and uploaded to `flappytone-raw` before Blob is removed.
9. **Pitch-reference fallback for small sessions.** `process-clips` measures the reference per session as today; when a session has fewer than `MIN_REFERENCE_FRAMES` voiced frames, it uses the reference stored in `words.meta.reference` of the most recently published word and says so in the report.
10. **Local dev** points `VITE_CLIPS_BASE_URL` at the live Worker; `http://localhost:5173` and `https://localhost:5173` are in the Worker's allowed origins. `wrangler dev` is optional.
11. **Traditional check on import.** `import-words` refuses a row whose hanzi contains a character from an embedded list of common Simplified-only characters.

## Slices and order

| Slice | Tasks | Ships as | Production state after |
|---|---|---|---|
| A. Catalog in the database | 1–4 | one PR | App reads words from Supabase (fallback JSON), clips still from `public/ref`. |
| B. Worker + clips in R2 | 5–9 | one PR | Clips served by the Worker; `public/ref` still in git as the safety net. |
| C. Booth + pipeline | 10–12 | one PR | Jane records against the DB; `process-clips` publishes to R2 + DB. |
| D. Retire | 13–14 | one PR | Blob, `public/ref`, manifest, old scripts, old API routes gone. Docs updated. |

Each slice must leave `npm run build && npm run typecheck && npm run test` green and be playable.

## File map

**Create**
- `supabase/migrations/0013_words_catalog.sql` — `words`, `lists`, `word_lists`, RLS, grants, indexes.
- `src/data/words.ts` — `fetchCatalog()`, localStorage cache, fallback. Never throws.
- `src/data/wordsFallback.json` — generated snapshot of published words (metadata only, with contour).
- `src/data/catalogRows.ts` — the row type shared by the app parser, the exporter and the seed (pure, no Supabase import).
- `src/audio/clipToken.ts` — fetches/refreshes the play ticket from the Worker. Never throws.
- `src/audio/prefetch.ts` — `prefetchPool(words)` warms a mode's pool; called from mode entry.
- `src/dev/env.ts` — the minimal `.env.local` reader, lifted out of `pull-recordings.ts`.
- `src/dev/r2.ts` — `r2Get(bucket, key, file)` / `r2Put(bucket, key, file)` wrappers around `npx wrangler r2 object ... --remote`.
- `src/dev/serviceClient.ts` — service-role Supabase client for scripts (reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` via `env.ts`).
- `src/dev/seed-words.ts` — one-time: 120 rows + `core-120` list from `wordlist.ts`/`glossary.ts`/`manifest.json`.
- `src/dev/upload-clips.ts` — one-time: `public/ref/*.wav` → `flappytone-clips`.
- `src/dev/migrate-raw.ts` — one-time: `fixtures/recordings/**` → `flappytone-raw` + `raw_key` on rows.
- `src/dev/verify-clips.ts` — reads every published clip back from R2 and compares size + SHA-256 with the local file.
- `src/dev/export-fallback.ts` — dumps published rows to `src/data/wordsFallback.json`.
- `src/dev/process-clips.ts` — replaces `pull-recordings` + `make-clips`.
- `src/dev/simplified.ts` — the Simplified-character blocklist + `hasSimplified(hanzi)`.
- `src/record/boothWords.ts` — fetches `/booth/words`; types for the booth list.
- `workers/clips/wrangler.toml`, `workers/clips/package.json`, `workers/clips/tsconfig.json`
- `workers/clips/src/index.ts` — router + CORS.
- `workers/clips/src/cors.ts`, `passcode.ts`, `tickets.ts`, `supabaseJwt.ts`, `db.ts`, `routes/token.ts`, `routes/clip.ts`, `routes/raw.ts`, `routes/auth.ts`, `routes/boothWords.ts`
- `workers/clips/test/*.test.ts` — unit tests with fake bindings.

**Modify**
- `src/game/words.ts` — parse catalog rows instead of manifest; `Word` gains `clipKey`, `updatedAt`, `minTier`, `tones`, `syllables`; loses `file`.
- `src/audio/inventory.ts` — calls `fetchCatalog()`.
- `src/audio/reference.ts` — `loadClip` fetches from the Worker with the ticket.
- `src/ui/Landing.tsx` — static import of `wordsFallback.json`.
- `src/ui/Visualiser.tsx`, `src/ui/ModeSelect.tsx`, `src/ui/Game.tsx` — tier filtering by `minTier`; prefetch on mode entry.
- `src/game/toneAverages.ts`, `src/dev/make-tone-averages.ts`, `src/dev/WordGates.tsx`, `src/dev/Lab.tsx` — read the fallback JSON / catalog instead of the manifest.
- `src/record/wordlist.ts` — types + registry helpers only; `WORDS` literal removed in Task 13 (kept until the seed has run).
- `src/record/upload.ts`, `src/record/RecordApp.tsx`, `src/record/Recorder.tsx`, `src/record/progress.ts`
- `src/dev/import-words.ts` — CSV → DB.
- `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.gitignore`, `.env.example`
- `CLAUDE.md`, `docs/PRD.md`, `docs/DECISIONS.md`, `docs/TESTING.md`, `docs/SPECS/R2_SETUP.md`

**Delete (Task 13 only)**
- `api/upload.ts`, `api/auth.ts`, `api/_passcode.ts`, `api/_passcode.test.ts`, `src/dev/pull-recordings.ts`, `src/dev/make-clips.ts`, `src/dev/manifest.test.ts`, `public/ref/manifest.json`, `public/ref/*.wav` (from git), `@vercel/blob`.

---

## Prerequisites (Pierre, before Task 5) — see "Cloudflare setup" at the end

Tasks 1–4 need only Supabase. Tasks 5+ need the two buckets, the Worker route and the secrets to exist.

---

## Slice A — Catalog in the database

### Task 1: `words` / `lists` / `word_lists` migration

**Files:**
- Create: `supabase/migrations/0013_words_catalog.sql`
- Modify: `src/data/database.types.ts` (regenerated)

**Interfaces:**
- Produces: tables `words`, `lists`, `word_lists` exactly as below. Later tasks select from `words` with the column names here.

- [ ] **Step 1: Inspect current schema** with the Supabase MCP `list_tables` so the migration number and naming match (`0013` follows `0012_board_period.sql`).

- [ ] **Step 2: Write the migration**

```sql
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
```

- [ ] **Step 3: Apply** with the Supabase MCP `apply_migration` (name `words_catalog`).
- [ ] **Step 4: Regenerate types** with `generate_typescript_types` into `src/data/database.types.ts`.
- [ ] **Step 5: Run `get_advisors`** for `security` and `performance`. Fix anything flagged with a follow-up migration `0014_...`, never by editing `0013`.
- [ ] **Step 6: Verify** with `execute_sql`: `select count(*) from words;` returns 0; as `anon` an insert is refused (`set role anon; insert into words ... ;` errors).
- [ ] **Step 7: Commit** `feat(db): words catalog tables (0013)`.

### Task 2: Catalog row type and parser in `src/game/words.ts`

**Files:**
- Create: `src/data/catalogRows.ts`
- Modify: `src/game/words.ts`, `src/game/words.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/data/catalogRows.ts  (pure — no Supabase import; the row on the wire)
  export interface CatalogRow {
    id: string; hanzi: string; pinyin: string; english: string;
    tone: number; tones: number[]; syllables: number; position: number;
    status: string; min_tier: string; clip_key: string | null;
    duration_s: number | null; onset_s: number | null; clip_s: number | null;
    polyline: unknown; contour?: unknown; updated_at: string;
  }
  export const CATALOG_SELECT = "id,hanzi,pinyin,english,tone,tones,syllables,position,status,min_tier,clip_key,duration_s,onset_s,clip_s,polyline,updated_at";
  ```
  ```ts
  // src/game/words.ts
  export interface Word { id; hanzi; pinyin; english; tone: Tone; tones: Tone[]; syllables: number;
    clipKey: string; durationS; onsetS; clipS; polyline: Polyline; minTier: "free" | "pro"; updatedAt: string; }
  export function wordsFromCatalog(rows: unknown): Word[];   // replaces loadWords; drops malformed rows, never throws
  export function wordsForTier(words: Word[], tier: Tier): Word[]; // pro → all; free/guest → minTier === "free"
  // wordsOfTone(words, tone, limit) and pickWord keep their signatures.
  ```

- [ ] **Step 1: Write failing tests** in `src/game/words.test.ts` (replace the manifest-shaped fixtures):
  - a valid row array parses into `Word[]` sorted by `position`;
  - a row with `status !== "published"` or `clip_key === null` is dropped;
  - a row with a bad polyline is dropped, the rest survive;
  - `onset_s` null → `onsetS` 0; `clip_s` null → `onsetS + durationS`;
  - `wordsForTier(words,"free")` excludes `minTier:"pro"`; `"pro"` includes all; `"guest"` behaves like `"free"`;
  - `wordsFromCatalog("garbage")` returns `[]`.
- [ ] **Step 2: Run** `npx vitest run src/game/words.test.ts` — fails on missing exports.
- [ ] **Step 3: Implement** `wordsFromCatalog` by adapting the existing `loadWords` checks field-by-field (keep `readOnsetS`/`readClipS`, `isPolyline`, `MAX_DURATION_S`). Keep `loadWords` exported as a thin adapter `loadWords(manifest) => wordsFromCatalog(manifestToRows(manifest))` until Task 13 removes it, so the Lab and tests keep working during Slice A.
- [ ] **Step 4: Fix compile errors** where `word.file` was used: `src/audio/reference.ts` (temporarily `${BASE_URL}ref/${word.clipKey}` — Task 7 replaces this line), `src/dev/WordGates.tsx`.
- [ ] **Step 5: Run** `npm run typecheck && npm run test` — green.
- [ ] **Step 6: Commit** `feat(words): parse catalog rows; Word carries clipKey/minTier/updatedAt`.

### Task 3: Seed the 120 words into the database

**Files:**
- Create: `src/dev/env.ts`, `src/dev/serviceClient.ts`, `src/dev/seed-words.ts`
- Modify: `package.json` (script `seed-words`), `tsconfig.node.json`, `tsconfig.app.json`, `src/dev/pull-recordings.ts` (use `env.ts`)

**Interfaces:**
- Produces:
  ```ts
  // src/dev/env.ts
  export function envVar(name: string): string;  // process.env first, then .env.local; throws with a clear message if absent
  // src/dev/serviceClient.ts
  export function serviceClient(): SupabaseClient<Database>; // createClient(url, serviceKey, { auth: { persistSession: false } })
  ```

- [ ] **Step 1: Write `env.ts`** by moving `loadToken()`'s parser out of `pull-recordings.ts` and generalising it to `envVar(name)`. Update `pull-recordings.ts` to call `envVar("BLOB_READ_WRITE_TOKEN")`.
- [ ] **Step 2: Write `serviceClient.ts`** as above, typed with `Database`.
- [ ] **Step 3: Write `seed-words.ts`**:
  - read `WORDS` (order = `position`), `GLOSSARY`, `public/ref/manifest.json`;
  - for each `WORDS[i]`: find manifest clip by id; build row `{ id, hanzi, pinyin, english: GLOSSARY[id] ?? "", tone, tones: [], syllables: 1, position: i, status: clip ? "published" : "pending", min_tier, clip_key: clip ? `${id}.wav` : null, duration_s, onset_s, clip_s, polyline, contour, meta: { reference: sessionRef } }` where `sessionRef` is the manifest `sessions[]` entry for that clip's session (`{ session, f0Center, rangeSemitones }`) — the pipeline's fallback reference (Decision 9) reads this;
  - `min_tier`: for each tone, words in `position` order; the first `TIER_LIMITS.free.wordsPerTone` are `free`, the rest `pro`;
  - upsert `lists` row `{ id: "core-120", name: "Core 120", source: "custom" }` and a `word_lists` row per word;
  - `upsert` in one batch each, `onConflict: "id"`; print counts per status and per tier;
  - `--dry-run` flag prints the rows and writes nothing.
- [ ] **Step 4: Register** in `package.json` (`"seed-words": "node --experimental-strip-types src/dev/seed-words.ts"`), `tsconfig.node.json` include, `tsconfig.app.json` exclude (also `env.ts`, `serviceClient.ts`).
- [ ] **Step 5: Run** `npm run seed-words -- --dry-run`, then `npm run seed-words`. Verify with `execute_sql`: `select status, min_tier, count(*) from words group by 1,2` → 120 published; per tone 5 free / 25 pro. `select count(*) from word_lists` → 120.
- [ ] **Step 6: Commit** `feat(db): seed-words script; catalog seeded with the 120`.

### Task 4: App reads the catalog live, with cache and bundled fallback

**Files:**
- Create: `src/data/words.ts`, `src/dev/export-fallback.ts`, `src/data/wordsFallback.json`
- Modify: `src/audio/inventory.ts`, `src/ui/Landing.tsx`, `src/ui/Visualiser.tsx`, `src/ui/ModeSelect.tsx`, `src/game/toneAverages.ts`, `src/dev/make-tone-averages.ts`, `src/dev/WordGates.tsx`, `src/dev/Lab.tsx`, `package.json`, tsconfigs
- Test: `src/data/words.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/data/words.ts
  export const CATALOG_KEY = "toneflap.catalog.v1";
  export async function fetchCatalog(opts?: { listId?: string }): Promise<Word[]>; // never throws; order: live → cache → fallback
  export function catalogFromCache(): Word[] | null;
  ```
  `src/audio/inventory.ts` keeps `loadInventory(): Promise<Word[]>` and `inventoryNow()` — callers unchanged.

- [ ] **Step 1: Write `export-fallback.ts`**: select `*` from `words` where `status='published'` order by `position`, write `src/data/wordsFallback.json` as `{ "version": 1, "exportedAt": ISO, "rows": CatalogRow[] }` (2-space, stable key order). Register script `export-fallback` + tsconfigs. Run it and commit the JSON.
- [ ] **Step 2: Write failing tests** for `src/data/words.ts` (mock `getSupabase` via `vi.mock("./supabase.ts")`):
  - live query ok → returns parsed words and writes `CATALOG_KEY` with `{ savedAt, rows }`;
  - live query throws → returns cached rows when present;
  - no cache and live fails → returns words parsed from `wordsFallback.json` (non-empty);
  - `listId` given → query goes through `word_lists!inner(list_id)` filter (assert the `.eq` call);
  - a corrupt cache value is ignored, not thrown.
- [ ] **Step 3: Implement** `fetchCatalog`: `getSupabase()` null → skip live; query `from("words").select(CATALOG_SELECT[, "word_lists!inner(list_id)"]).eq("status","published").order("position")`; on success cache + return `wordsFromCatalog(rows)`; on any failure `warn("catalog", ...)` and fall through. Wrap everything in try/catch.
- [ ] **Step 4: Rewire `inventory.ts`** to `fetchCatalog()` (drop the manifest fetch). The resolved-synchronously behaviour stays: seed `resolved` from `catalogFromCache()` at module load so `inventoryNow()` is non-null on a returning visit.
- [ ] **Step 5: Landing page**: replace `loadInventory` with `import fallback from "../data/wordsFallback.json"` and `wordsFromCatalog(fallback.rows)` in a `useMemo`. Confirm `src/game/words.ts` still has no `src/data/` or `src/audio/` import (it imports the type from `src/data/catalogRows.ts`, which is pure — acceptable; alternatively move `CatalogRow` under `src/game/`; either is fine, keep it pure).
- [ ] **Step 6: Tier filtering**: in `Visualiser.tsx` and `ModeSelect.tsx`, apply `wordsForTier(words, tier)` before `wordsOfTone(...)`; keep the existing `limits.wordsPerTone` slice as belt-and-braces for guests (0) so the guest/free/pro visualiser behaviour is unchanged. `pickWord` (scored runs) keeps the full pool.
- [ ] **Step 7: Lab + tone averages**: `toneAverages.ts`/`make-tone-averages.ts`/`WordGates.tsx`/`Lab.tsx` read `wordsFallback.json` (contour included) instead of `manifest.json`.
- [ ] **Step 8: Verify**: `npm run build`; `grep -l supabase dist/assets/*.js` must not include the landing chunk; `grep -l PitchTracker dist/assets/*.js` lists only app + record chunks. `npm run dev`, play a run: words come from the DB (check the Network tab shows a `words` request, no `manifest.json`). Block Supabase in devtools, reload: the game still lists words (from cache/fallback).
- [ ] **Step 9: Commit** `feat(catalog): app reads words from Supabase with cache + bundled fallback`. Open PR for Slice A.

---

## Slice B — Worker + clips in R2

### Task 5: Worker scaffold, CORS, passcode, tickets (pure parts)

**Files:**
- Create: `workers/clips/package.json`, `workers/clips/wrangler.toml`, `workers/clips/tsconfig.json`, `workers/clips/src/{index,cors,passcode,tickets,supabaseJwt,db}.ts`, `workers/clips/test/{cors,passcode,tickets}.test.ts`
- Modify: root `package.json` (workspace + scripts), root `tsconfig.json` (reference), `.gitignore` (`workers/clips/.wrangler/`)

**Interfaces:**
- Produces:
  ```ts
  // src/index.ts
  export interface Env {
    RAW: R2Bucket; CLIPS: R2Bucket;
    SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string;
    CLIP_TOKEN_SECRET: string; RECORD_PASSCODE: string;
    ALLOWED_ORIGINS: string;            // comma-separated; entries may be "https://*.vercel.app"
  }
  export default { fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> }
  // cors.ts
  export function corsHeaders(origin: string | null, allowed: string): HeadersInit; // {} when origin not allowed
  export function isAllowedOrigin(origin: string | null, allowed: string): boolean;
  // passcode.ts  (port of api/_passcode.ts, env-based)
  export const PASSCODE_HEADER = "x-record-passcode";
  export function checkPasscode(req: Request, expected: string | undefined): Response | null; // 503 unset, 401 wrong
  // tickets.ts
  export type Tier = "guest" | "free" | "pro";
  export interface Ticket { tier: Tier; sub?: string; ip: string }
  export const TICKET_TTL_S = 30 * 60;
  export async function signTicket(t: Ticket, secret: string, now?: Date): Promise<string>;   // jose SignJWT HS256
  export async function verifyTicket(jwt: string, secret: string, ip: string): Promise<Ticket | null>; // null on any failure or ip mismatch
  // supabaseJwt.ts
  export async function verifySupabaseJwt(jwt: string, supabaseUrl: string): Promise<{ sub: string; isAnonymous: boolean } | null>;
  // db.ts (service-role PostgREST via supabase-js; one client per isolate)
  export function serviceDb(env: Env): SupabaseClient<Database>;
  ```

- [ ] **Step 1: Scaffold** `workers/clips/package.json` with deps `jose`, `@supabase/supabase-js`; devDeps `wrangler`, `@cloudflare/workers-types`, `vitest`, `typescript`. Root `package.json`: `"workspaces": ["workers/clips"]`, scripts `"worker:dev": "npm -w workers/clips run dev"`, `"worker:deploy": "npm -w workers/clips run deploy"`, `"worker:test": "npm -w workers/clips test"`. `npm install`.
- [ ] **Step 2: `wrangler.toml`**
  ```toml
  name = "flappytone-clips-api"
  main = "src/index.ts"
  compatibility_date = "2026-09-01"
  routes = [{ pattern = "clips.flappytone.com", custom_domain = true }]
  [[r2_buckets]]
  binding = "RAW"
  bucket_name = "flappytone-raw"
  [[r2_buckets]]
  binding = "CLIPS"
  bucket_name = "flappytone-clips"
  [vars]
  ALLOWED_ORIGINS = "https://flappytone.com,https://www.flappytone.com,https://*.vercel.app,http://localhost:5173,https://localhost:5173"
  ```
  Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIP_TOKEN_SECRET`, `RECORD_PASSCODE`) are set with `wrangler secret put`, never in the file.
- [ ] **Step 3: Write failing tests** (`vitest` in the workspace, node environment, no workers pool needed for these):
  - `cors`: exact origin allowed; `https://foo.vercel.app` matches the wildcard; `https://evil.com` → `{}`; `null` origin → `{}`.
  - `passcode`: unset → 503; wrong → 401; right → null; compare is length-safe.
  - `tickets`: sign then verify round-trips; wrong secret → null; expired (pass `now` 31 min later) → null; different ip → null.
- [ ] **Step 4: Implement** the three modules. `verifyTicket` uses `jose.jwtVerify(jwt, new TextEncoder().encode(secret), { algorithms: ["HS256"] })` and checks `payload.ip === ip`. `verifySupabaseJwt` uses `createRemoteJWKSet(new URL(\`${supabaseUrl}/auth/v1/.well-known/jwks.json\`))` (cache the set per URL at module scope) and `jwtVerify(jwt, jwks, { issuer: \`${supabaseUrl}/auth/v1\` })`, returning `{ sub: payload.sub, isAnonymous: payload.is_anonymous === true }`, `null` on any throw.
- [ ] **Step 5: `index.ts` router**: handle `OPTIONS` (204 + CORS), then dispatch on `method + pathname` to the route modules added in Tasks 6 and 10; unknown → 404 JSON. Every response passes through `corsHeaders`. Read the caller IP from `CF-Connecting-IP`.
- [ ] **Step 6: Run** `npm run worker:test` green; `npm -w workers/clips run typecheck` green.
- [ ] **Step 7: Commit** `feat(worker): clips-api scaffold, CORS, passcode, play tickets`.

### Task 6: Worker routes `/token`, `/clip/:id`, `/auth`

**Files:**
- Create: `workers/clips/src/routes/{token,clip,auth}.ts`, `workers/clips/test/{token,clip}.test.ts`
- Modify: `workers/clips/src/index.ts`

**Interfaces:**
- Produces HTTP contract:
  - `POST /token` — optional `Authorization: Bearer <supabase access_token>`. Response `200 { token, expiresIn: 1800, tier }`. Invalid Supabase JWT → still a `guest` ticket (never a hard failure for the player).
  - `GET /clip/:id?v=<updated_at>` — `Authorization: Bearer <ticket>`. 401 no/invalid ticket, 400 bad id, 404 unknown/unpublished, 403 pro word without pro ticket, 200 `audio/wav` with `Cache-Control: private, max-age=604800, immutable`.
  - `GET /auth` and `POST /auth` — passcode pre-check: 200 / 401 / 503.

- [ ] **Step 1: Write failing tests** with fake `Env` (`RAW`/`CLIPS` as tiny in-memory objects exposing `get(key)`/`put(key, body)`; `serviceDb` mocked to return canned rows; `caches.default` stubbed on `globalThis`):
  - `/token` without header → tier `guest`, ticket verifies;
  - `/token` with a JWT whose `verifySupabaseJwt` mock returns `{sub, isAnonymous:false}` and entitlements `has_access:true` → `pro`; `has_access:false` → `free`; `isAnonymous:true` → `guest`;
  - `/clip/ba1` with no ticket → 401; bad id `../x` → 400; free ticket + free word → 200 + body bytes + `private` header; free ticket + pro word → 403; pro ticket + pro word → 200; unknown id → 404;
  - cache: second call for the same id+v serves from `caches.default.match` without hitting `CLIPS.get` (assert the fake's call count).
- [ ] **Step 2: Implement `routes/token.ts`**: parse Bearer → `verifySupabaseJwt`; if a non-anonymous `sub`, query `entitlements.has_access` via `serviceDb`; tier = pro/free/guest; `signTicket({ tier, sub, ip }, env.CLIP_TOKEN_SECRET)`.
- [ ] **Step 3: Implement `routes/clip.ts`**:
  - validate `id` against `^[a-z0-9]{1,32}$`;
  - `verifyTicket` → 401;
  - resolve the word: module-level `Map<id, { clipKey, minTier }>` refreshed from `words` (`select id,clip_key,min_tier where status=eq.published`) when older than 5 minutes (one query per isolate per 5 min, not per request);
  - 404 if absent, 403 if `minTier==="pro" && ticket.tier!=="pro"`;
  - cache key `new Request(\`https://clips.flappytone.com/clip/${id}?v=${v}\`)`; `caches.default.match` → on hit return a copy with `Cache-Control` rewritten to `private, max-age=604800, immutable`; on miss `CLIPS.get(clipKey)` → 404 if null → build `Response(obj.body, { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=604800, immutable", etag: obj.httpEtag } })`, `ctx.waitUntil(cache.put(key, resp.clone()))`, return the `private` copy.
- [ ] **Step 4: Implement `routes/auth.ts`** as `checkPasscode(req, env.RECORD_PASSCODE) ?? json(200, { ok: true })`.
- [ ] **Step 5: Wire routes** in `index.ts`. Run `npm run worker:test` green.
- [ ] **Step 6: Deploy** (needs Pierre's Cloudflare prerequisites done): `cd workers/clips && npx wrangler secret put SUPABASE_URL` (and the other three), `npx wrangler deploy`. Smoke: `curl -X POST https://clips.flappytone.com/token` returns a guest token; `curl -H "Authorization: Bearer <token>" https://clips.flappytone.com/clip/ba1` returns 404 (nothing uploaded yet — that is Task 8).
- [ ] **Step 7: Commit** `feat(worker): /token, /clip/:id with edge cache + pro gate, /auth`.

### Task 7: App plays clips from the Worker

**Files:**
- Create: `src/audio/clipToken.ts`, `src/audio/prefetch.ts`, `src/audio/clipToken.test.ts`
- Modify: `src/audio/reference.ts` (`loadClip`), `src/ui/Game.tsx`, `src/ui/Visualiser.tsx`, `src/app/GameApp.tsx`, `.env.example`, Vercel env (Pierre: `VITE_CLIPS_BASE_URL`)

**Interfaces:**
- Produces:
  ```ts
  // src/audio/clipToken.ts — never throws
  export async function getPlayTicket(): Promise<string | null>; // cached until 2 min before expiry; refetched on demand; null if base URL unset or fetch fails
  export function invalidatePlayTicket(): void;                 // call on 401 from /clip, and on auth state change
  export const CLIPS_BASE_URL: string | null;                   // import.meta.env.VITE_CLIPS_BASE_URL ?? null
  // src/audio/prefetch.ts
  export function prefetchPool(words: Word[]): void;             // fire-and-forget loadClip for each; caps concurrency at 4
  ```

- [ ] **Step 1: Write failing tests** for `clipToken.ts` (mock `fetch` and `currentSession`):
  - first call POSTs `/token` with `Authorization` when a session exists, without it otherwise; returns the token;
  - second call within TTL does not refetch;
  - fetch failure → `null`, no throw;
  - `invalidatePlayTicket()` forces a refetch.
- [ ] **Step 2: Implement `clipToken.ts`.** It may import `currentSession` from `src/data/supabase.ts` (audio → data is allowed; pitch → anything is not).
- [ ] **Step 3: Rewrite `loadClip`** in `reference.ts`:
  ```ts
  const ticket = await getPlayTicket();
  if (!CLIPS_BASE_URL || !ticket) throw new Error("no clips source");   // caught below → synth fallback
  const url = `${CLIPS_BASE_URL}/clip/${word.id}?v=${encodeURIComponent(word.updatedAt)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${ticket}` } });
  if (res.status === 401) { invalidatePlayTicket(); throw new Error("ticket"); }
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  ```
  Keep the decode cache, the `.catch(() => undefined)` and the `loads` map exactly as they are. **On a 401 the failed load is removed from `loads`** so the next gate retries with a fresh ticket.
- [ ] **Step 4: Ticket warm-up**: in `GameApp.tsx`, next to where `loadInventory()` is started, call `void getPlayTicket()`. Call `invalidatePlayTicket()` from the auth-state listener in `src/data/account.ts` (or wherever `onAuthStateChange` lives) so a signup/purchase upgrades the ticket.
- [ ] **Step 5: Prefetch**: on entering a scored/drill/learn mode (the place `Game.tsx` builds the `Run`) call `prefetchPool(wordsForTier(inventoryNow() ?? [], tier))` for the run's tone pool; the Visualiser already calls `loadClip` per tone — leave it. The one-gate look-ahead already exists in the HUD timer; do not change it.
- [ ] **Step 6: `.env.example`**: add `VITE_CLIPS_BASE_URL=https://clips.flappytone.com`. Pierre sets it in Vercel (Production + Preview) and `.env.local`.
- [ ] **Step 7: Verify** locally (`npm run dev`, Worker live, Task 8 done): a run plays real clips (Network: `/clip/...` 200s, then `(disk cache)`); sign in as a free account → a `pro` word cues synthetically, a free word plays; block `clips.flappytone.com` in devtools → every cue is the synthetic sweep, the run never stalls.
- [ ] **Step 8: Commit** `feat(audio): clips fetched from the Worker with play tickets; pool prefetch`.

### Task 8: One-time upload of the 120 clips and the raw takes, with verification

**Files:**
- Create: `src/dev/r2.ts`, `src/dev/upload-clips.ts`, `src/dev/migrate-raw.ts`, `src/dev/verify-clips.ts`
- Modify: `package.json` scripts, tsconfigs, `.gitignore` (`fixtures/clips/`)

**Interfaces:**
- Produces:
  ```ts
  // src/dev/r2.ts — thin wrappers over wrangler; throw on non-zero exit
  export function r2Put(bucket: "flappytone-raw" | "flappytone-clips", key: string, file: string, contentType = "audio/wav"): void;
  export function r2Get(bucket, key: string, file: string): void;
  // both run: npx wrangler r2 object <get|put> <bucket>/<key> --file <file> --remote [--content-type ...]  (cwd workers/clips)
  ```

- [ ] **Step 1: Write `r2.ts`** with `execFileSync("npx", [...], { cwd: "workers/clips", stdio: "inherit" })`.
- [ ] **Step 2: `upload-clips.ts`**: for each `public/ref/<id>.wav` where `words.id` exists → `r2Put("flappytone-clips", `${id}.wav`, file)`; `--only <id>` and `--dry-run` flags. Print count.
- [ ] **Step 3: `migrate-raw.ts`**: first run `npm run pull-recordings` (all sessions). Then for each `fixtures/recordings/<session>/<id>.wav`: `r2Put("flappytone-raw", `raw/${session}/${id}.wav`, file)`; for each id, take the **latest** session (sorted name) and `update words set raw_key, recorded_session` where id matches. Print counts per session.
- [ ] **Step 4: `verify-clips.ts`**: for every `words` row with `clip_key` → `r2Get` into `fixtures/clips/verify/`, compare byte length and SHA-256 with `public/ref/<id>.wav`; print a table; exit 1 on any mismatch. `--raw` variant does the same for `raw_key` against `fixtures/recordings/`.
- [ ] **Step 5: Run** `npm run upload-clips`, `npm run migrate-raw`, `npm run verify-clips`, `npm run verify-clips -- --raw`. All must report 0 mismatches. Then Task 7 Step 7's manual play check.
- [ ] **Step 6: Commit** `chore(clips): one-time upload of clips + raw takes to R2, verified`. Open PR for Slice B.

### Task 9: Cloudflare rate limit + preview-deploy check (Pierre + agent)

- [ ] Pierre adds the rate-limiting rule (see Cloudflare setup §5).
- [ ] Agent verifies from a Vercel preview deploy (`*.vercel.app`) that `/token` and `/clip` succeed (CORS wildcard works) and that 100 rapid `/clip` requests from one IP get a 429 after the limit.
- [ ] Commit nothing; record the result in the PR description.

---

## Slice C — Booth + pipeline

### Task 10: Worker routes `/raw` and `/booth/words`

**Files:**
- Create: `workers/clips/src/routes/{raw,boothWords}.ts`, `workers/clips/test/{raw,boothWords}.test.ts`
- Modify: `workers/clips/src/index.ts`

**Interfaces:**
- HTTP contract:
  - `POST /raw?id=&session=` — header `x-record-passcode`; body = WAV bytes, `MAX_BYTES = 4 MiB`. 400 bad id/session/empty, 413 too large, 401/503 passcode, 404 if `id` is not a `words` row, 500 if the DB status write fails after the put. 200 `{ ok: true, key }`.
  - `GET /booth/words` — header `x-record-passcode`. 200 `{ pending: BoothWord[], recorded: BoothWord[] }` where `BoothWord = { id, hanzi, pinyin, tone, status }`; `pending` = `status='pending'` by `position`; `recorded` = `status in ('recorded','published')` by `position`.

- [ ] **Step 1: Write failing tests**: `/raw` happy path puts `raw/<session>/<id>.wav` into the fake `RAW` and calls the mocked db update with `{ status: "recorded", raw_key, recorded_session, recorded_at }`; db update rejects → 500 and the object is still in `RAW`; bad id → 400; unknown id → 404; wrong passcode → 401. `/booth/words` splits statuses and orders by position; wrong passcode → 401.
- [ ] **Step 2: Implement** both routes (port `api/upload.ts`'s validation verbatim). Wire in `index.ts`. Tests green.
- [ ] **Step 3: Deploy** the Worker. Smoke with curl: `GET /booth/words` with the passcode returns 0 pending / 120 recorded.
- [ ] **Step 4: Commit** `feat(worker): /raw upload flips word status; /booth/words`.

### Task 11: Booth is database-driven

**Files:**
- Create: `src/record/boothWords.ts`, `src/record/boothWords.test.ts`
- Modify: `src/record/upload.ts` (+ test), `src/record/RecordApp.tsx`, `src/record/Recorder.tsx`, `src/record/progress.ts` (+ test), `src/record/record.css`

**Interfaces:**
- Produces:
  ```ts
  // src/record/boothWords.ts
  export interface BoothWord { id: string; hanzi: string; pinyin: string; tone: 1|2|3|4; status: "pending"|"recorded"|"published" }
  export async function fetchBoothWords(passcode: string, fetchImpl = fetch): Promise<{ pending: BoothWord[]; recorded: BoothWord[] }>; // throws on failure — the booth shows an error, it is not a player surface
  export const RECORD_BASE_URL: string; // import.meta.env.VITE_CLIPS_BASE_URL; the booth cannot run without it
  ```
  `Uploader` posts to `${RECORD_BASE_URL}/raw?id=&session=`; `RecordApp` pre-checks `${RECORD_BASE_URL}/auth`.

- [ ] **Step 1: Update `upload.test.ts`** expectations to the new URL, then change `upload.ts`.
- [ ] **Step 2: Write `boothWords.ts`** + tests (200 parses; 401 throws with "Wrong code."; network error throws).
- [ ] **Step 3: `progress.ts`**: keep `sessionId` persistence; drop `done` (server status is the truth). Update its tests.
- [ ] **Step 4: `Recorder.tsx`**:
  - on mount `fetchBoothWords(passcode)` → state `{ pending, recorded }`; loading and error states with a Retry button;
  - the working list is `pending`; `index` starts at 0; when the uploader confirms `id`, move that word from `pending` to `recorded` locally (no refetch needed; a manual "Refresh list" button refetches);
  - the chip strip shows `pending` as today; below it a collapsed "Recorded (N) — tap to redo" section listing `recorded`; tapping a recorded word makes it the current word (re-record path), and its confirmed upload leaves it in `recorded`;
  - "All done" shows when `pending` is empty;
  - counter reads `recorded.length / (pending.length + recorded.length)`.
- [ ] **Step 5: `RecordApp.tsx`**: `/api/auth` → `${RECORD_BASE_URL}/auth`.
- [ ] **Step 6: Manual test** (`npm run dev`, `/record`): the list shows 0 pending / 120 recorded; import one test word (Task 12 must be done first — or insert a row with `execute_sql`: `insert into words (id,hanzi,pinyin,tone,position) values ('ce4','測','cè',4,999)`); it appears as pending; record it on a phone; the object appears in `flappytone-raw` and the row flips to `recorded`; reload on another device → it is no longer pending. Delete the test row afterwards.
- [ ] **Step 7: Commit** `feat(booth): word list from the database; pending-only with a redo section; uploads to the Worker`.

### Task 12: `import-words` (CSV → DB) and `process-clips`

**Files:**
- Create: `src/dev/simplified.ts` (+ test), `src/dev/process-clips.ts`
- Modify: `src/dev/import-words.ts`, `package.json`, tsconfigs, `.gitignore` (`fixtures/clips/`)

**Interfaces:**
- `npm run import-words path/to/list.csv` — columns `hanzi,pinyin,english,lists` (header row required; `lists` is `;`-separated list ids; english/lists optional). Derives `id` via `assignIds(existingRowsFromDb, incoming)` so ids never move; `tone` = first toned syllable; `tones` = all syllables' tones; `syllables`. Upserts `words` (`status='pending'` for new; existing rows keep status, only `hanzi/pinyin/english/tones/syllables` refresh), `lists` (id = the cell, `name` = the cell unless it exists), `word_lists`. New words get `position = max(position)+1` in file order. Refuses the whole file on: parse error, `hasSimplified(hanzi)`, duplicate key in file. `--dry-run` supported.
- `npm run process-clips [--all] [--session <id>]` — selects `words` with `status='recorded'` (or `published` too with `--all`); downloads each `raw_key` to `fixtures/recordings/<session>/<id>.wav` if not present; groups by session; per session `measurePitchReference` over that session's takes, falling back per Decision 9 when voiced frames < `MIN_REFERENCE_FRAMES = 400` (state the number used in the report); cuts with `cutClip`, normalises with `clipNormalize`, reviews with `reviewClip` (cohort median from all published words of that tone in the DB); writes `fixtures/clips/<id>.wav`; `r2Put("flappytone-clips", `${id}.wav`, file)`; updates the row: `clip_key, duration_s, onset_s, clip_s, polyline, contour, status='published', meta.reference={session,f0Center,rangeSemitones}`; then recomputes `min_tier` for every tone touched (rank by `position` among published words of that tone: first `TIER_LIMITS.free.wordsPerTone` → `free`). Prints the same review report `make-clips` prints. A flagged clip is still written. Ends by running `export-fallback` and printing "commit src/data/wordsFallback.json".

- [ ] **Step 1: `simplified.ts`** + tests: `hasSimplified("妈")` true, `hasSimplified("媽")` false, mixed string true. Embed ~200 of the most common Simplified-only characters (the set that differs from Traditional — e.g. 妈马骂书东车说这个们国过时发对会来学… ); say in the file header that it is a screen, not a converter.
- [ ] **Step 2: Rework `import-words.ts`** per the contract. Reuse `parseWord`, `AmbiguousPinyinError`, `assignIds`. Existing rows for `assignIds` come from `select id,hanzi,pinyin from words` (all statuses, including retired — ids stay reserved).
- [ ] **Step 3: Write `process-clips.ts`** by lifting the cut/measure/review loop out of `make-clips.ts` unchanged (same imports from `clipCut.ts`, `clipNormalize.ts`, `clipReview.ts`) and replacing the filesystem-in/manifest-out ends with DB-in/R2+DB-out as above.
- [ ] **Step 4: Regression check**: run `npm run process-clips -- --all --dry-run` (cut everything, write nothing) and diff the computed `polyline`/`duration_s`/`onset_s`/`clip_s` per word against the current DB values (seeded from the manifest). They must match to the printed precision. Also `git diff fixtures/anchors` empty (nothing here touches `make-ref-clips`, but check).
- [ ] **Step 5: Register scripts** (`process-clips`, `import-words` already exists) + tsconfigs. Remove the `make-clips`/`pull-recordings` scripts from `package.json` only in Task 13.
- [ ] **Step 6: End-to-end**: `npm run import-words fixtures/test-words.csv` with two new words → pending in the booth → Jane (or you) records them → `npm run process-clips` → they play in the app for a Pro account and show as locked for free. Commit `wordsFallback.json`.
- [ ] **Step 7: Commit** `feat(pipeline): import-words writes the DB; process-clips publishes to R2 + DB`. Open PR for Slice C.

---

## Slice D — Retire the old path

### Task 13: Remove Blob, `public/ref`, manifest, old scripts and API routes

**Files:**
- Delete: `api/upload.ts`, `api/auth.ts`, `api/_passcode.ts`, `api/_passcode.test.ts`, `src/dev/pull-recordings.ts`, `src/dev/make-clips.ts`, `src/dev/manifest.test.ts`, `public/ref/manifest.json`
- Modify: `.gitignore` (`public/ref/*.wav`, `fixtures/clips/`), `package.json` (drop `@vercel/blob`, `pull-recordings`, `make-clips`, `upload-clips`, `migrate-raw`; keep `verify-clips`, `seed-words` marked one-time in their headers), `src/record/wordlist.ts` (drop `WORDS`; keep `Tone`, `WordItem`), `src/record/wordlist.test.ts` (keep only the pinyin/id-derivation tests, pointed at `wordsFallback.json` rows), `src/game/words.ts` (drop `loadWords`/`manifestToRows`), `api/_imports.test.ts` (update the expected file list), tsconfigs, `.env.example` (drop `BLOB_READ_WRITE_TOKEN`, `RECORD_PASSCODE` from the Vercel section; note they live on the Worker now)

- [ ] **Step 1: Precondition check**: Task 8's verify passed, a full run has been played off R2 in production, the booth has recorded at least one new word end to end. Do not start otherwise.
- [ ] **Step 2: `git rm --cached public/ref/*.wav`**, add ignore line. `git rm public/ref/manifest.json`.
- [ ] **Step 3: Delete the files listed**, `npm uninstall @vercel/blob`, fix every import that breaks (`grep -rn "manifest.json\|@vercel/blob\|WORDS\b\|loadWords" src api`).
- [ ] **Step 4: Run** `npm run build && npm run typecheck && npm run test`. Then the hard-rule-7 grep and the landing-chunk greps from Global Constraints.
- [ ] **Step 5: Pierre** removes `BLOB_READ_WRITE_TOKEN` and `RECORD_PASSCODE` from Vercel env and deletes the Blob store after the next production deploy is verified.
- [ ] **Step 6: Commit** `chore: retire Vercel Blob, public/ref and the manifest pipeline`.

### Task 14: Documentation

**Files:** `CLAUDE.md`, `docs/PRD.md` (§4 table, §9), `docs/DECISIONS.md`, `docs/TESTING.md`, `docs/SPECS/R2_SETUP.md`, `docs/SPECS/flappytone-SPEC-clip-catalog-r2.md` (status line + pointer to the override decisions)

- [ ] **Step 1: CLAUDE.md**: rewrite "The clip inventory" to the DB/R2 pipeline (`import-words` → booth → `process-clips` → `export-fallback`); add `workers/clips/` to Layout; add `src/data/words.ts` to the `src/data/` bullet; state the play-ticket model and the "guests get clips" decision; update the `api/*.ts` count (four functions); update Commands (`worker:dev`, `worker:deploy`, `process-clips`, `export-fallback`); note `VITE_CLIPS_BASE_URL` and the local-dev rule (Decision 10); keep the five pipeline invariants, restated against `process-clips`.
- [ ] **Step 2: DECISIONS.md**: one entry each for Decisions 1, 2, 6, 7, 8, 9 above (why ES256, why guests get clips and what the protection actually is, the cache/private split, contour out of the catalog, small-session pitch reference).
- [ ] **Step 3: PRD.md**: §4 Deploy/Backend rows, §9 source paragraph, §12 drop the R2 open question.
- [ ] **Step 4: TESTING.md**: replace `make-clips` references; add the Worker test command and the manual checklist from the spec's Testing checklist (updated for tickets).
- [ ] **Step 5: R2_SETUP.md**: replace with the "Cloudflare setup" section below (private buckets, no public domain, Worker route, rate limit).
- [ ] **Step 6: Commit** `docs: clip catalog + R2 pipeline`. Open PR for Slice D.

---

## Self-review against the spec

- §1 schema → Task 1 (with `position`, `raw_key`, `recorded_*`, `retired`, `updated_at` trigger added). RLS + grants → Task 1.
- §2 buckets/Worker → Tasks 5, 6, 10; JWT → Decision 1; `/raw`, `/auth` → Tasks 6, 10; cache → Decision 6.
- §3 catalog fetch/fallback → Task 4; audio fetch → Task 7; pre-caching → Task 7 Step 5; booth → Task 11.
- §4 pipeline (`process-clips`, `import-words`, `export-fallback`) → Tasks 4, 12.
- §5 seed + clip upload + verify → Tasks 3, 8.
- §6 retire → Task 13.
- Env vars → Tasks 5, 7, 13 + Cloudflare setup.
- Booth sync (added in planning) → Tasks 10, 11.
- Testing checklist → distributed across task verify steps; the guest-403 line is replaced by "guest ticket plays free words, pro words 403".

---

## Instructions for the coding agent

**Setup**
1. `git checkout main && git pull && git checkout -b audio-migration`.
2. Read `CLAUDE.md`, the spec, and this plan's "Decisions that override the spec" before Task 1.
3. Use **superpowers:subagent-driven-development**: one fresh subagent per task, then a review pass before the next task. Keep this session as the coordinator; do not implement inline.
4. Never push, never open a PR without Pierre's go-ahead. Stop at the end of each slice and report.
5. Tasks 6 (deploy step), 8, 9, 13 Step 5 need Pierre's Cloudflare/Vercel setup. If a prerequisite is missing, finish everything that does not depend on it, then stop and say exactly what is missing.

**Model per task** (lightest that is safe; reviewers always one tier up)

MODELS OPUS 5 SHOULD NOT BE TOO VERBOSE.

| Task | Implementer | Reason |
|---|---|---|
| 1 migration | Opus 5 | RLS/grants mistakes are silent and security-relevant |
| 2 parser | Sonnet 5 | mechanical with clear tests |
| 3 seed | Sonnet 5 | data mapping; dry-run protects |
| 4 catalog + fallback | Opus 5 | touches the landing/app bundle boundary and the never-throw contract |
| 5 Worker scaffold | Sonnet 5 | scaffolding + pure functions |
| 6 Worker routes | Opus 5 | auth + caching correctness |
| 7 app audio path | Opus 5 | must not break the run loop; iOS audio context rules |
| 8 upload + verify | Sonnet 5 | scripts with a hard verify |
| 9 rate-limit check | Haiku 4.5 | verification only |
| 10 booth routes | Sonnet 5 | small, well-tested |
| 11 booth UI | Sonnet 5 | React, existing patterns |
| 12 import + process-clips | Opus 5 | must preserve measurement byte-for-byte |
| 13 retire | Sonnet 5 | deletion with a grep checklist |
| 14 docs | Sonnet 5 | prose, needs judgement about what changed |

Reviewer for every task: Opus 5 (spec-compliance review, then code-quality review, per the sub-skill). 
Do not use Fable unless explicitely instructed by Pierre

**Definition of done per task:** tests listed in the task pass, `npm run typecheck` and `npm run build` green, the task's verify step done and its result written in the commit body, one commit.

---

## Cloudflare setup (Pierre, manual, ~20 minutes)

Do §1–4 before the agent reaches Task 5. §5 before Task 9.

1. **Enable R2.** Cloudflare dashboard → R2 Object Storage → Enable (the API currently answers "Please enable R2"). Needs a payment method on file; the free allowance covers this project.
2. **Create two buckets**, location Automatic: `flappytone-raw` and `flappytone-clips`. **Do not** enable public access, `r2.dev` URLs or a custom domain on either bucket, and add **no CORS policy** to the buckets — the Worker is the only reader.
3. **Custom domain for the Worker.** After the agent first runs `wrangler deploy` (Task 6), Workers & Pages → `flappytone-clips-api` → Settings → Domains & Routes → Add custom domain `clips.flappytone.com`. Cloudflare creates the DNS record. (`wrangler.toml` already declares it; the dashboard step is only needed if the deploy cannot create it itself.)
4. **Secrets and env.** Give the agent, out of band (not in chat logs, not in the repo): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same values `api/score.ts` uses on Vercel), `RECORD_PASSCODE` (same as today's Vercel value, or a new one), and a fresh `CLIP_TOKEN_SECRET` (`openssl rand -base64 48`). The agent sets them with `wrangler secret put`, which needs `npx wrangler login` once on your machine. In Vercel add `VITE_CLIPS_BASE_URL=https://clips.flappytone.com` to Production and Preview, and to `.env.local`.
5. **Rate limit.** Security → WAF → Rate limiting rules → Create: name `clips per ip`; expression `(http.host eq "clips.flappytone.com" and starts_with(http.request.uri.path, "/clip/"))`; characteristics IP; period 1 minute; requests 60; action Block for 1 minute. Add a second rule for `/token`: 20 per minute per IP.
6. **After Slice D**: Vercel → Storage → delete the Blob store; Vercel → Settings → Environment Variables → remove `BLOB_READ_WRITE_TOKEN` and `RECORD_PASSCODE`.

Cost expectation: free tiers cover 10 GB R2 storage, 10 M reads/month, 100 k Worker requests/day. At ~125 KB per clip and ~30 clips per run, that is roughly 3,000 runs/day before any charge.
