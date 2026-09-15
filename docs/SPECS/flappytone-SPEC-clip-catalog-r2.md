# FlappyTone — Word Catalog + Cloudflare Clip Storage (Spec for coding agent)

Status: DECIDED, not started. Supersedes `flappytone-SPEC-r2-clip-storage.md`
(that spec's public-bucket model is replaced by the private-bucket + JWT Worker
below). Author-locked decisions are in §0 — do not re-open them.

## Context & goal

Today the word "catalog" is three flat files tied by a stable `id`
(`src/record/wordlist.ts` = id/hanzi/pinyin/tone, `src/record/glossary.ts` =
english, `public/ref/manifest.json` = generated durations/polyline/contour).
Clip audio lives in `public/ref/*.wav`, committed to git (~15MB; `.git` ~46MB)
and bundled into every deploy. Raw takes from Jane go to Vercel Blob.

We are moving to:
1. A **Supabase Postgres `words` table** as the single source of truth for word
   metadata, which the app queries at runtime (filterable by list / game mode).
2. **Cloudflare R2** for all clip audio — raw takes and processed clips — with
   **both buckets private**, served through a **Cloudflare Worker that enforces
   a Supabase JWT** so the native-voice dataset can't be bulk-downloaded.
3. A reworked one-time pipeline: booth → R2 raw bucket → local process script →
   processed clip in R2 + metadata upserted into `words`.

This kills Vercel Blob entirely and de-bloats the repo. The game app and the
existing Supabase Vercel functions (`score.ts`/`run.ts`/`webhook-ls.ts`) STAY on
Vercel — only the storage/clip layer moves to Cloudflare.

## Why (from Notion, for the record)
- R2 = **zero egress at any volume** (clips are the bandwidth cost as plays scale).
- Domain already on Cloudflare → `clips.flappytone.com` is a trivial hookup.
- Vercel Blob ruled out: hit its limits via the old analytics pipeline; Hobby
  tier hard-locks at 10,000 ops/month.
- Private buckets + a JWT Worker realise the "keep clips behind an API, not an
  open bucket" defensibility note — raises bulk-scrape cost to "need an account,
  rate-limited, one clip at a time". Not uncrackable (any played clip can be
  captured once); the goal is killing the cheap whole-dataset lift.

## 0. Locked decisions (do not re-open)
- **Clip protection = Supabase JWT, enforced in a Cloudflare Worker.** Anonymous
  / no JWT ⇒ no clips. Pro-gated words additionally require `has_access`.
- **Both R2 buckets private.** No public domain on either.
- **App reads the catalog live from Supabase** (cached in localStorage), with a
  **bundled JSON snapshot as offline fallback**. This deliberately relaxes the
  old "manifest loads with zero round-trip" rule; keep the graceful-degrade rule.
- **Booth word source = database-driven** (no `/record` redeploy to add words).
- **Lists = join table** (`lists` + `word_lists`), many-to-many.
- **Two buckets, fully Cloudflare-native, no AWS SDK.** Worker uses R2 bindings;
  the local pipeline script uses `wrangler` or `aws4fetch` (ask before adding).
- **App + Supabase Vercel functions stay on Vercel.**
- Future-proofing: a `meta jsonb` column now; tone pairs are a single natively
  recorded clip = one ordinary row (`syllables=2`), no schema rework.

## Target architecture

```
  INTAKE (CSV import)  ─┐
                        ▼
        ┌───────────────────────────────────────────┐
        │  Supabase `words` (SOURCE OF TRUTH)         │◀── app: live query (cached), filter by list/mode
        │  + `lists` + `word_lists`                   │◀── booth: query status='pending'
        └───────────────────────────────────────────┘
             ▲ (pipeline upserts metadata, service-role)
             │
  Jane @ /record ──POST──▶ CF Worker ──put──▶ R2 `flappytone-raw`   (PRIVATE)  raw/<session>/<id>.wav
                                                     │
                          (local) process-clips.ts reads raw, trims/cuts
                                                     ▼
                                              R2 `flappytone-clips` (PRIVATE)   <id>.wav
                                                     ▲
  app ──GET /clip/<id> (Bearer JWT)──▶ CF Worker ────┘  verify JWT + tier, stream, edge-cache
```

## 1. Data model (Supabase migration)

New migration in `supabase/migrations/` (via Supabase MCP `apply_migration`;
regenerate `src/data/database.types.ts`; run `get_advisors` after).

```sql
create table words (
  id            text primary key,              -- stem; stable identity (wordIds.ts). Never reused.
  hanzi         text not null,                 -- Traditional only (hard rule 9)
  pinyin        text not null,                 -- with tone mark
  english       text not null default '',      -- absorbs glossary.ts; '' allowed
  tone          smallint not null,             -- 1..4, primary/filter tone
  tones         smallint[] not null default '{}', -- full pattern; [] = single (uses `tone`). Tone pairs: e.g. {3,2}
  syllables     smallint not null default 1,
  clip_key      text,                          -- object key in flappytone-clips; null until published
  duration_s    numeric,                       -- tone window
  onset_s       numeric,                       -- lead-in before tone (clipS != onsetS+durationS — DECISIONS.md)
  clip_s        numeric,                       -- whole-file length
  polyline      jsonb,                          -- corridor vertices [[t,chao],...]
  contour       jsonb,                          -- measured voiced frames
  min_tier      text not null default 'free',  -- 'free' | 'pro' — Worker gate + client slicing both read this
  status        text not null default 'pending', -- 'pending' -> 'recorded' -> 'published'
  meta          jsonb not null default '{}',   -- escape hatch for unforeseen metadata (no migration to add)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index words_tone_idx on words(tone);
create index words_status_idx on words(status);

create table lists (
  id      text primary key,                    -- e.g. 'hsk1', 'core-120', 'food'
  name    text not null,
  source  text,                                -- 'hsk' | 'tocfl' | 'custom' | ...
  meta    jsonb not null default '{}'
);
create table word_lists (
  word_id text not null references words(id) on delete cascade,
  list_id text not null references lists(id) on delete cascade,
  primary key (word_id, list_id)
);
create index word_lists_list_idx on word_lists(list_id);
```

**RLS (enforce, don't convention).** Metadata is not secret (the app shows
roadmap/teasers); only audio is gated (by the Worker). So:
- `words`, `lists`, `word_lists`: `select` to `anon` + `authenticated`; **no client
  insert/update/delete policy at all** — the pipeline writes with the service-role
  key only. Same enforcement shape as `leaderboard_scores`/`entitlements`.
- Raw-SQL migration must `enable row level security` **and** `GRANT select` to
  `anon, authenticated` (a migration doesn't add grants for you — see CLAUDE.md).
- `(select auth.uid())` form is moot here (no per-row ownership); policies are
  blanket-select. Index nothing for RLS beyond the above.

`min_tier` maps the tier model onto the DB: the pipeline sets the first
`TIER_LIMITS.free.wordsPerTone` words per tone (inventory order) to `free`, the
rest to `pro`. This replaces the slice logic inside `src/game/words.ts`.

## 2. Cloudflare — buckets + Worker

### Buckets (manual, dashboard — see updated R2_SETUP)
- `flappytone-raw` — PRIVATE. No public access, no custom domain. Jane's takes.
- `flappytone-clips` — PRIVATE. No public access. Served only via the Worker.

### Worker `flappytone-clips-api` (new; `workers/clips/`)
R2 **bindings** (no S3 SDK): `RAW` → flappytone-raw, `CLIPS` → flappytone-clips.
Routed at `clips.flappytone.com`. Secrets: `SUPABASE_JWT_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RECORD_PASSCODE`.

Routes:
- **`GET /clip/:id`** — clip serving, JWT-gated.
  1. Verify `Authorization: Bearer <supabase access_token>` — HS256 against
     `SUPABASE_JWT_SECRET`. Missing/invalid ⇒ 401. `is_anonymous` claim true ⇒
     403 (guests get no clips — kills anonymous bulk scrape).
  2. Resolve the word's `min_tier` (query `words.min_tier` via service role;
     cache in-Worker/KV with short TTL). If `pro`, look up `entitlements.has_access`
     for `sub`; false/absent ⇒ 403.
  3. Serve bytes: check `caches.default` keyed by clip id first; on miss
     `CLIPS.get(key)` and populate the edge cache. Auth is re-checked every
     request; only the payload is edge-cached (standard Worker auth+cache split).
  4. Headers: `Cache-Control: private, max-age=604800, immutable`,
     `Content-Type: audio/wav`. (`immutable`: a re-recording changes the `id`? No
     — id is stable. A re-cut reuses the key, so bump a `?v=<updated_at>` query
     the client appends from the row, to bust caches on re-publish.)
- **`POST /raw?id=&session=`** — booth upload (replaces `api/upload.ts`).
  Passcode gate (`x-record-passcode` vs `RECORD_PASSCODE`, constant-time, fail
  closed — port `api/_passcode.ts`). Validate `id` `^[a-z0-9]{1,32}$` and
  `session` `^[a-z0-9-]{1,40}$`; enforce `MAX_BYTES`. `RAW.put(
  'raw/'+session+'/'+id+'.wav', body)`. Return `{ok:true}`.
- **`GET /auth`** — passcode pre-check the booth calls before opening the mic
  (replaces `api/auth.ts`): 200 / 401 / 503 on the passcode alone.

JWT verification: use a tiny HS256 verify (e.g. `jose` in the Worker, or hand
-rolled WebCrypto HMAC) — no heavy deps. Do NOT trust any client-sent tier.

## 3. Client changes (app on Vercel)

- **Catalog fetch — new `src/data/words.ts`** (the only Supabase-facing word
  code; obeys the `src/data/` never-throw contract): `fetchCatalog({listId?})`
  selects from `words` (join `word_lists` when filtering), maps rows to the
  existing `Word` shape (`src/game/words.ts`), caches in `localStorage`
  (`toneflap.catalog.v1`, versioned), and on any failure returns the **bundled
  fallback** `src/data/wordsFallback.json`. `src/game/words.ts` stays pure (parse
  + select only) and now parses catalog rows instead of `manifest.json`; drop its
  tier-slice usage in favour of `min_tier` filtering upstream.
- **Audio fetch — `src/audio/reference.ts` `loadClip()`**: fetch
  `` `${VITE_CLIPS_BASE_URL}/clip/${word.id}?v=${word.updatedAt}` `` with
  `Authorization: Bearer ${access_token}` (from the Supabase session). Keep the
  decoded-`AudioBuffer` cache. On 401/403/failure, fall back to the synthetic
  sweep exactly as today (never a broken run — analytics/data never-throw rule).
- **Pre-caching (performance):** on entering a game mode / selecting a list,
  prefetch that pool's clips only (not the whole library): resolve the pool from
  the catalog (tier + list + mode), fetch each `/clip/:id` (browser HTTP cache +
  in-memory decode cache warm it), and during play look ahead one gate so the
  next cue is decoded before it's needed. Never prefetch words outside the active
  pool. Guests (0 words) prefetch nothing.
- **Booth (`src/record/`) is DB-driven:** the word list comes from
  `fetchBoothWords()` (select `words` where `status in ('pending','recorded')`,
  inventory order) instead of the bundled `WORDS` array. `src/record/wordlist.ts`
  becomes types + `assignIds`/registry helpers only; the `WORDS` literal goes
  away. Upload target changes from `/api/upload` to
  `${VITE_CLIPS_BASE_URL}/raw`; passcode pre-check hits `${VITE_CLIPS_BASE_URL}/auth`.

## 4. Pipeline rework (local, one-time-ish)

Replace `pull-recordings` + `make-clips` + the never-built `upload-clips` with
one **`src/dev/process-clips.ts`** (`npm run process-clips`):
1. List `raw/` in `flappytone-raw` (wrangler `r2 object` or `aws4fetch`); download
   each `<session>/<id>.wav` to a local temp dir (still the "raw takes are
   evidence" step — keep them under `fixtures/recordings/`, gitignored).
2. Run the **existing, unchanged** measurement: `clipCut.ts` + `clipNormalize.ts`
   + per-session `measurePitchReference` + `clipReview.ts` flag report. The five
   pipeline invariants in CLAUDE.md still hold — `clipCut` is still the only
   measurement, still human-review-flags-never-blocks.
3. For each cut clip: `put` the processed `<id>.wav` into `flappytone-clips`, and
   **upsert the row** into Supabase (service role): `clip_key`, `duration_s`,
   `onset_s`, `clip_s`, `polyline`, `contour`, `tone`, `tones`, recompute
   `min_tier` per tone rank, `status='published'`, `updated_at=now()`.
4. Print the same review report; a flagged clip is still written (human reads it).

Keep intake as a CSV importer — rework `src/dev/import-words.ts`
(`npm run import-words path/to/list.csv`): columns `hanzi,pinyin,english,lists`
(pinyin required; english/lists optional; **no id/tone** — derived from pinyin via
`pinyin.ts` + `wordIds.ts`, keeping the "an id never moves" guarantee). Upserts
`words` (status `pending`) and `lists`/`word_lists` membership. `lists` cell is
`;`-separated. Never regenerates a bundled array anymore — it writes to the DB.

**Bundled fallback export — new `src/dev/export-fallback.ts`**
(`npm run export-fallback`): dump published `words` (metadata only, NO audio) to
`src/data/wordsFallback.json`, committed. This is the offline fallback from §3.
`manifest.json` and `public/ref/*.wav` are retired (see §6).

## 5. Seed / migration (one-time)
1. Apply the §1 migration.
2. **`src/dev/seed-words.ts`** (`npm run seed-words`, run once): read the current
   `wordlist.ts` (id/hanzi/pinyin/tone) + `glossary.ts` (english) +
   `public/ref/manifest.json` (durations/polyline/contour), upsert 120 rows with
   `status='published'`, assign them all to a `core-120` list, and set `min_tier`
   per tone rank. Upload the 120 existing `public/ref/*.wav` into
   `flappytone-clips` under `clip_key=<id>.wav`.
3. Verify a handful play through the Worker with a real free-account JWT before
   the retirement in §6.

## 6. Retire the old path
- `git rm --cached public/ref/*.wav`, add `public/ref/*.wav` to `.gitignore`.
- Delete `public/ref/manifest.json` from the client load path (replaced by the
  DB + `wordsFallback.json`); keep it in git history. `manifest.test.ts` retargets
  to the catalog parser or is retired.
- Remove `@vercel/blob` dependency and `api/upload.ts`, `api/auth.ts`,
  `api/_passcode.ts` (their job is the Worker's now). Remove
  `BLOB_READ_WRITE_TOKEN`. Remove `src/dev/pull-recordings.ts`,
  `src/dev/make-clips.ts` (folded into `process-clips.ts`).
- History rewrite to shrink `.git` (`git filter-repo` on the old WAVs) stays OUT
  of scope — do it later, once nobody needs to revert past this.

## Env vars
| where | vars |
|---|---|
| Cloudflare Worker | `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RECORD_PASSCODE`; R2 bindings `RAW`, `CLIPS` |
| Vercel (client build) | `VITE_CLIPS_BASE_URL=https://clips.flappytone.com` (existing `VITE_SUPABASE_*`) |
| Local pipeline | R2 creds (wrangler auth or `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME` for aws4fetch), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Removed | `BLOB_READ_WRITE_TOKEN` |

## Codebase anchors
| Area | File(s) | Change |
|---|---|---|
| Schema | `supabase/migrations/00NN_words_catalog.sql` | new: words/lists/word_lists + RLS + grants |
| Types | `src/data/database.types.ts` | regenerate after migration |
| Catalog read | `src/data/words.ts` (new) | live Supabase query, cache, fallback; never throws |
| Word parse | `src/game/words.ts` | parse catalog rows not manifest; drop tier-slice (min_tier upstream) |
| Fallback | `src/data/wordsFallback.json` (new, generated) | offline snapshot |
| Audio fetch | `src/audio/reference.ts` `loadClip()` | Worker URL + Bearer JWT + `?v=`; keep decode cache + synth fallback |
| Pre-cache | `src/audio/` / mode entry in `src/ui/` | prefetch active pool + 1-gate look-ahead |
| Booth list | `src/record/` (RecordApp/Recorder), `src/record/wordlist.ts` | DB-driven list; drop `WORDS` literal, keep types/`assignIds` |
| Booth upload | `src/record/upload.ts` | POST to Worker `/raw`; pre-check `/auth` |
| Worker | `workers/clips/` (new) | R2 bindings; `/clip/:id` JWT gate, `/raw`, `/auth` |
| Pipeline | `src/dev/process-clips.ts` (new), `import-words.ts` (rework), `export-fallback.ts` (new) | R2+DB pipeline; CSV intake; fallback export |
| Seed | `src/dev/seed-words.ts` (new) | one-time seed of the 120 + clip upload |
| Retire | `api/upload.ts`,`api/auth.ts`,`api/_passcode.ts`,`src/dev/pull-recordings.ts`,`src/dev/make-clips.ts`, `public/ref/*.wav`, `manifest.json`, `@vercel/blob` | remove |

## Out of scope
- Users recording/uploading their own clips.
- Tone-pair gate/render logic and the cutter's single-voiced-run rework (schema
  is ready for pairs; the gameplay + cutting work is a separate spec).
- `git filter-repo` history shrink.
- Moving the app / Supabase functions off Vercel.
- Per-word "which exact 5" pro-gating beyond `min_tier` at the edge (min_tier is
  the boundary; finer per-word rules stay a client concern).

## Testing checklist
- [ ] Migration applies; `get_advisors` (security + performance) clean; types regenerated.
- [ ] `seed-words` writes 120 rows + uploads 120 objects (count in R2 dashboard).
- [ ] Worker: no JWT ⇒ 401; anonymous JWT ⇒ 403; free JWT ⇒ 200 on a free word;
      free JWT ⇒ 403 on a `pro` word; pro JWT ⇒ 200 on a pro word.
- [ ] App with a free account plays a full run off R2 clips (not the synth sweep).
- [ ] Dead network / Supabase down ⇒ app loads from `wordsFallback.json`, synth
      cue fallback, no broken end screen.
- [ ] Booth: DB-driven list renders; a take lands in `flappytone-raw`; wrong
      passcode ⇒ 401; unconfigured passcode ⇒ 503.
- [ ] `process-clips` reads raw, writes processed to R2 + upserts rows; review
      report prints; re-cut bumps `updated_at` and busts the client cache via `?v=`.
- [ ] `npm run build && npm run typecheck` clean; `git status` shows no tracked
      `public/ref/*.wav`; `@vercel/blob` gone from `package.json`.
- [ ] Pre-cache: entering a mode warms only that pool; no cross-pool fetches in
      the network panel.
