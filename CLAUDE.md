# CLAUDE.md — FlappyTone

Browser game where the player's voice is the controller. Live pitch (f0) drives a bird's Y position; the player flies through corridors shaped like Mandarin tone marks by producing the matching tone.

Full spec: @docs/PRD.md — read it before implementing a slice, not before every task. Design rationale that isn't a standing rule lives in @docs/DECISIONS.md — check it before assuming a tuned value or a removed feature was an oversight.

## Stack

React 19 + TypeScript + Vite. Canvas 2D. Web Audio API. Plain CSS with a design-token system (`src/ui/tokens.css`, documented in `docs/BRAND.md`) — no Tailwind. Supabase (auth + Postgres, Tokyo) for accounts/leaderboard/entitlements/catalog, Cloudflare R2 + a Worker for clip audio. Full history of how this backend was introduced is in DECISIONS.md — this file states current behavior only.

## Accounts, tiers and the leaderboard

- **`src/data/`** is the only place that talks to Supabase. `supabase.ts` holds the single client; `leaderboard.ts` holds every read/write of the board; `words.ts` + `catalogRows.ts` are the catalog fetch (live query, falling back to bundled `wordsFallback.json`, which also **seeds `audio/inventory.ts` synchronously** so `inventoryNow()` is never null on a cold load — an empty pool at gate-spawn time builds a wordless gate, which shows the generic `mā/má/mǎ/mà` placeholder and can only ever cue synthetically); `tier.ts`/`entitlements.ts` resolve tier and paid access. **Nothing in `src/data/` may throw into a caller** — a failure returns an empty board / `false` / the fallback catalog, never a broken screen. Same contract `src/share/share.ts` and `src/analytics/client.ts` keep.
- **Two write lanes, split by whether the client may decide the value.** The player's `profiles` row is client-written, RLS-guarded (`auth.uid() = id`). Everything the client must not be trusted to compute goes through a server function with the service-role key: `api/score.ts` (leaderboard, week from server time), `api/run.ts` (daily run count), `api/webhook-ls.ts` (`has_access`, from Lemon Squeezy's webhook only), `api/shapes.ts` (a Pro player's tone-shape sums, below), `api/runlog.ts` (a Pro player's run log, below). `leaderboard_scores`, `entitlements`, `player_tone_shapes` and `run_log` have **no client write policy at all** — that's the enforcement, not a convention. One deliberate exception: `feedback` (the in-app form, `src/data/feedback.ts` + `src/ui/FeedbackWidget.tsx`) is client-**inserted** by guests and accounts alike, insert-only at both the grant and RLS layer, `user_id` pinned to `auth.uid()` by the policy; read it in the dashboard. The Feedback tab renders only on `GameApp.tsx`'s `FEEDBACK_SCREENS` allow-list — never over a live run, the visualiser, or calibration.
- **Three tiers, two gates.** `guest` (anonymous/signed-out): 3 runs/day, local-only progress, no visualiser practice, can see the board but not join it. `free` (email account): 10 runs/day, saved+synced progress, a real board row under a generated name, 5 words/tone in the visualiser. `pro` (paid): unlimited runs, full board + chosen name, customization. Gate 1 (guest→free, via signup) is persistence + run cap; Gate 2 (free→pro, via Lemon Squeezy) is depth/customization, **never** run quantity or word access — see next bullet.
- **`src/game/tiers.ts`'s `TIER_LIMITS` is the single source of truth for per-tier limits**, free of `src/data/` imports so game code can read it without pulling in the Supabase graph. **`min_tier` (on `words`, gates game access) and `TIER_LIMITS.wordsPerTone` (visualiser practice depth) are different gates that must never be conflated** — conflating them was a real incident (DECISIONS.md) that made the scored game play synthetic sweeps for non-Pro players. Every word ships `min_tier='free'` today; `wordsOfTone(words, tone, limit)` takes its cap as a parameter, and `pickWord` (feeding a scored run) always calls it with no limit.
- **The run cap is server-authoritative for accounts, device-local for guests.** `dailyLimit.ts` owns the local counter (not tamper-proof by design); a signed-in player's run also POSTs to `api/run.ts`, the sole writer of `daily_runs`. A guest has no durable identity for a server row to count against — clearing storage mints a new anonymous user — so guests stay local-only, permanently.
- **Anonymous sign-in is unreachable from any live path.** Nothing signs a guest in; only an email account can join the board or post a score (`api/score.ts` 403s an `is_anonymous` session).
- **Auth is email+password, magic link secondary.** `signUpWithPassword` (`src/data/account.ts`) upgrades the existing anonymous user in place (`updateUser`, never `signUp`) and must call `refreshSession()` right after — the pre-upgrade JWT still carries `is_anonymous: true`, and RLS reads the claim. `syncAccount()` then runs automatically.
- **Stats sync is merge-by-max, both directions**, on signup/second-device/after each run/on app load. Lifetime tone accuracy per tone and per pair combo (`runHistory.ts`'s `lifetimePerTone`/`lifetimePerCombo`, synced as one row per target — `"2"` or `"3-2"` — to `tone_accuracy_stats`, migration 0025) and streak/count aggregates are account-owned; `lastRuns` and `lastPlayedDate` stay local (device display cache, no honest cross-device answer). Local is always authoritative for rendering. **`tone_stats` is deprecated and never read or written** — it holds pre-spec-A corridor accuracy, and a separate table is what stops merge-by-max from pulling those numbers back into a reset device (local `statsVersion` 2 is the matching local reset).
- **Renaming needs Pro, enforced by a `BEFORE UPDATE` trigger on `profiles`** (`enforce_rename_entitlement()`), not an RLS policy — free accounts still need to write their own row for the stats sync, and RLS can't gate a single column. Revoking Pro does not revert an already-chosen name (DECISIONS.md).
- **Migrations live in `supabase/migrations/`, applied via the Supabase MCP `apply_migration`**, never by hand. Regenerate/commit `src/data/database.types.ts` after each one; run `get_advisors` (security + performance) before calling a schema change done. Raw-SQL migrations must include explicit `GRANT`s — the dashboard's table editor adds them invisibly, a migration does not.
- **Player tone shapes (Pro only, spec B).** `player_tone_shapes` (migration 0026) holds, per player × key × local day, the element-wise **sum** of every heard attempt's line (61 points, `averagePolyline`'s grid) plus a count; any average is Σ sum ÷ Σ count over a day range (`src/game/playerShape.ts`). Keys match `tone_accuracy_stats`' targets (`"2"`, `"3-2"`, no neutral combos). Captured only while `getTier() === "pro"` — asked per gate, so nothing is computed for guest/free: `Run`'s `captureShapes` (all modes, wall hits included, unheard excluded), posted once when `Game.tsx`'s run effect tears down. The visualiser does **not** capture shapes (removed 30 Sep 2026 — practice attempts are not part of a player's tone history). `api/shapes.ts` checks session, non-anonymous, `has_access`, day ±24h, key/length/range, then calls `add_tone_shapes()` — the add has to be SQL because PostgREST upsert can only replace; execute is service-role only. Read is owner-only RLS. Progress draws it over Jane's average (`PlayerToneEvolution.tsx`). Voice-derived: the privacy policy says so.
- **Pro run log (spec C).** `run_log` (migration 0027): one row per run, **every mode**, written only while `getTier() === "pro"` — the log starts when they upgrade, free runs are never stored server-side, no backfill (free/guest keep the local last 5). Row: server `played_at`, client local `day` (±24h like `api/run.ts`), `mode`, `score`, `gates`, `outcome` (`finished`/`out_of_hearts`/`quit`/`restart` — `restart` is its own value, and `RunOutcome` in `runHistory.ts` carries it too), `tone_acc`, and `per_key` `{gates, accSum}` under `tone_accuracy_stats`' keys (`"2"`, `"3-2"`, no neutral combos). Built by `buildRunLogEntry` (`src/game/runTrend.ts`) and posted from `Game.tsx`'s `reportRunEnd` — the one place that knows the outcome, and which every end path (game over, quit, restart) goes through — via `src/data/runlog.ts`. `api/runlog.ts` checks session, non-anonymous, `has_access`, day, and bounds (score like `api/score.ts`). Progress reads it back (owner-only RLS): all-time list with "show more", and the per-day trend (`dailyTrend`: Σ accSum ÷ Σ gates per key per day) replacing the mock chart for Pro. Voice-derived: the privacy policy says so.
- **`api/*.ts`**: `api/newsletter.ts` (ConvertKit proxy), `api/score.ts`/`api/run.ts`/`api/webhook-ls.ts`/`api/shapes.ts`/`api/runlog.ts` (the five sole writers above). A test file in `api/` must be named `_*.test.ts` or Vercel deploys it as a public endpoint (`api/_imports.test.ts` checks this).

## Local/device-only state

`src/game/runHistory.ts`, `streak.ts`, `dailyLimit.ts` are device-local, not tamper-proof (the local counter's checksum only deters a casual devtools edit), and don't assume otherwise. Don't build product logic that assumes the local half can't be bypassed, and don't extend this pattern beyond what the free-tier teaser needs.

## Hard rules — these are not defaults, do not drift back to them

1. **The game loop is `requestAnimationFrame` outside React.** React renders the shell, menus and end screen only. Never call `useState` per frame. Game state lives in a mutable object held in a `useRef` or a module singleton.
2. **`AudioWorkletNode` only.** `ScriptProcessorNode` is deprecated — do not use it, and do not "fall back" to it. If `AudioWorklet` is unsupported, show an unsupported-browser screen.
3. **All pitch math in semitones, never raw Hz.** Pitch perception is logarithmic. `semitones = 12 * Math.log2(f0 / f0Center)`.
4. **Every audio API call sits behind an explicit user gesture.** iOS Safari requires a gesture for both `getUserMedia()` and `AudioContext.resume()`. Test it on a real iPhone, not the simulator.
5. **`src/pitch/` must have zero Web Audio dependencies.** It takes `Float32Array` frames in and returns pitch state out — testable offline against WAV fixtures. Web Audio lives only in `src/audio/`, which feeds `src/pitch/`. Never import `AudioContext` inside `src/pitch/`.
6. **Tunable constants live in `src/game/tuning.ts`, not as bare module constants.** Anything the Lab should be able to move mid-session is a field on that singleton, default equal to the shipped value. Production never calls `setTuning`. Some modules (`scoring.ts`, `dynamics.ts`) still export same-named constants for tests/back-compat naming — not necessarily equal to the live default; `tuning()` is the only source of truth at runtime.
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** Gate the JSX at the usage site, not just inside the component — a query-param flag alone doesn't remove it from the bundle. Check after touching anything in `src/dev/`:
   ```bash
   npm run build
   for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done   # must print nothing
   ```
8. **When the signal is unclear, the game says "couldn't hear that" — it never scores the player wrong.** A gate whose longest voiced run is under `minUtteranceMs` (default 160ms, merging gaps under `mergeGapMs`) is neutral: no points, no heart lost. The test is utterance *duration*, not voiced fraction. Confidently failing a correct speaker is the single fastest way to lose a user.
9. **All hanzi is Traditional Mandarin, never Simplified.** Jane records Taiwan Mandarin. Check any new hanzi against a Traditional reference, not by eye — this has drifted once already (`src/brand.ts`'s `tones` map briefly shipped Simplified).

## Layout

```
src/
  pitch/      pure DSP — detection, smoothing, octave correction, Hz→semitone→Chao, calibration math. NO Web Audio.
  audio/      AudioWorklet setup, mic permission, calibration capture, reference-clip playback, prefetch. Feeds src/pitch/.
  game/       loop, entities, gate generation, tuning, scoring, tone classifier, tiers, run history, daily limit. NO React.
  render/     canvas draw calls. Pure functions of game state.
  data/       the only Supabase-facing code: client, auth, leaderboard, catalog, tier/entitlements. Never throws.
  ui/         React components: menus, HUD overlay, calibration, settings, progress/profile, account, game over.
  app/        the /app entry: GameApp (the game's shell) + GameNav + main.tsx.
  record/     the /record entry: the recording booth (talks to the clips Worker, not Vercel api/).
  analytics/  what a play session sends home. session.ts is pure; client.ts/posthog.ts are the impure part.
  share/      share-card rendering. Never throws (same contract as src/data/).
  dev/        the Lab (dev-only tuning instance) + CLI analysis/build/pipeline scripts.
api/          Vercel functions: newsletter, score, run, webhook-ls, shapes, runlog — see above.
workers/clips/  Cloudflare Worker (`flappytone-clips-api`, clips.flappytone.com): mints play tickets, serves clip audio from R2. Separate deploy target and toolchain (`npm -w workers/clips`), not part of the Vercel `api/` count.
supabase/     numbered SQL migrations, applied through the Supabase MCP. The schema's source of truth.
LandingApp.tsx  the / entry's shell: landing + terms, and nothing else.
fixtures/     WAV files for offline tests — see docs/TESTING.md
docs/         PRD.md, TESTING.md, DECISIONS.md, and reference/design docs
```

### Three entries, not one app

`index.html` → `src/main.tsx` → `LandingApp` is the marketing site at `/`.
`app.html` → `src/app/main.tsx` → `GameApp` is the game at `/app`.
`record.html` → `src/record/` is the booth at `/record`. All three are declared
in `vite.config.ts`'s `rollupOptions.input` and reached through rewrites in
`vercel.json`; only `/` is indexable.

Four rules hold the split together:

1. **The marketing page must not import `src/audio/` or `src/pitch/`.** Check after touching `Landing.tsx` or anything it imports:
   ```bash
   npm run build
   grep -l PitchTracker dist/assets/*.js     # must list only the app + record chunks
   ```
   `ToneAverageCard` and `ContourSpark` legitimately pull `game/gates` and `game/words` for the tone charts; that is data and geometry, not the engine.
2. **Crossing between `/` and `/app` is a real navigation, and a click gesture does not survive it.** `ensureMic()` needs the gesture (hard rule 4); the landing page passes `?intent=visualiser` instead, and the player's first tap on `/app` is the gesture. Do not try to auto-start from the intent — it fails silently on iOS Safari. `src/ui/appLink.ts` is the only thing that knows the game's URL. **`?intent=visualiser` must work on a session that has never calibrated** — a share link is by definition someone's first visit (this broke once; see DECISIONS.md). Re-check against a cleared `localStorage` session, not just a calibrated one, whenever you touch this path.
3. **Only `index.html` is prerendered.** `src/dev/prerender.ts` bakes the landing into it for crawlers, and `prerenderEntry.tsx`'s wrapper markup (`.app > .app-main > .frame`) must stay identical to `LandingApp`'s or crawler markup and React's markup diverge.
4. **`Nav.tsx` is the marketing site's bar; the game has its own (`src/app/GameNav.tsx`).** Do not reintroduce a shared nav.

One analytics consequence: **`landed` means "opened `/app`", not "visited the site"** — a visit to the marketing page is a `$pageview` instead.

## Commands

```bash
npm run dev            # vite dev server, over HTTPS — use for anything not touching api/
npm run dev:api        # vercel dev: the only way to exercise api/ (score submission)
npm run worker:dev     # wrangler dev, for workers/clips (the clips Worker) — separate toolchain, npm -w workers/clips
npm run worker:deploy  # wrangler deploy — pushes workers/clips to clips.flappytone.com
npm run worker:test    # workers/clips' own vitest suite (npm -w workers/clips test)
npm run test           # vitest — root app suite only; workers/clips is excluded (own runner, own tests)
npm run analyze <wav>  # print ASCII contour for a fixture — use this to "see" pitch output
npm run typecheck
npm run build           # also gates dev-tooling exclusion, see hard rule 7
```

**`VITE_CLIPS_BASE_URL` is the clips Worker's origin** (`https://clips.flappytone.com` in prod; `npm run dev` uses the same live Worker — there is no local Worker-in-the-loop dev flow; `npm run worker:dev` runs the Worker standalone against `.dev.vars`, not wired into Vite). Absent, every cue falls back to the synthetic sweep — a valid build, just an audibly worse one. Must be set in `.env.local` and in Vercel Production + Preview.

**`dev:api` sources `.env.local` itself**, because this repo's repo-style Vercel link means `vercel dev` doesn't pick up `.env.local` on its own — every function would see an empty `process.env` and 503. Values with spaces or `#` need quoting (shell sourcing, not a dotenv parser).

**The two dev servers are mutually exclusive on TLS, deliberately.** `npm run dev` serves HTTPS (`basicSsl()`, needed for `getUserMedia` and for on-phone LAN testing); `vercel dev` proxies Vite over plain HTTP, so `dev:api` sets `FT_NO_SSL=1` to drop the plugin. Neither command exercises `api/` from a phone — use a Vercel preview deploy for that.

Clip-pipeline and demo-clip scripts (`process-clips`, `import-words`, `update-demo`, etc.) are covered where they're used below — `npm run` with no args lists everything.

## Landing page demo clips

`src/ui/DemoLoop.tsx` plays two recorded, muted loops on the landing page (hero + visualiser), each a `.webm`/`.mp4` pair in `public/hero/` and `public/visualiser/`. `npm run update-demo hero|visualiser [source-file]` keeps all four things in sync: both video files, `DemoLoop.tsx`'s native-size constants, and `src/dev/demoStub.tsx`'s matching constants (the prerendered placeholder). It strips audio and regenerates the `.webm`. Doesn't run the build — check with `npm run build` after.

## The clip catalog and its Worker

**The catalog is a roster: `words` + `speakers` + `word_clips`.** A word is who it is (`words`: hanzi, pinyin, tone, position, `min_tier`, game access). A *recording* of it is a row in `word_clips`, keyed `(word_id, speaker_id, style)`, holding every measurement (`clip_key`, `duration_s`, `onset_s`, `clip_s`, `polyline`, `contour`, `status`, `style`). `speakers` holds the voices — attributes (`gender`, `accent`, `is_default`, `active`), never a `voice` enum, because who recorded, what range it reads as, and what accent it speaks are three independent facts. A second/third voice is an `INSERT` into `speakers` + that speaker's `word_clips`; if adding a voice ever needs a schema change, the shape is wrong (DECISIONS.md, "A speaker, not a voice enum").

**Since migration 0024, a recording also has a `style`: `'textbook'` (slow, exaggerated citation-form takes, the default) or `'natural'` (faster, everyday speed).** Style is a property of the RECORDING, same reasoning as speaker: a word doesn't have a style, a given take of it does, so it lives on `word_clips`, not `words` or `speakers` (DECISIONS.md, "style is a recording attribute"). **The game reads `natural` through the Speech style setting** (`docs/SPECS/flappytone-SPEC-speech-style.md`, DECISIONS.md "Speech style"):

- **Setting:** `speechStyle` (`src/game/settings.ts`, device-local, default `textbook`, not synced), Settings → Proficiency → "Speech style". **Always read it through `effectiveSpeechStyle(tier)`** — a guest is always textbook (control shown disabled; the stored value is untouched, so a free/Pro player who signs out gets their choice back). UX gating only, not a security boundary. Free and Pro both may choose.
- **Catalog:** `words.ts`'s live query fetches both styles for the default speaker; a `Word` keeps its top-level textbook fields and gains `natural?: ClipMeasurements`. `clipFor`/`wordInStyle`/`wordsInStyle` (`src/game/words.ts`) are the only things that pick between them — a word re-pointed at a style carries `clipStyle`, which is what the clip URL and every cache key read. **A word with no take in the chosen style is left out of the pool — no textbook fallback inside a natural run** (a third filter after `min_tier` and tier/level, in `resolvedPool`; words return when recorded and published).
- **Worker:** `GET /clip/:speaker/:id?style=` (absent ⇒ textbook, invalid ⇒ 400); style is part of the edge cache key. **Deploy the Worker before a client that sends `?style=`** — an old Worker ignores it and serves textbook audio under a natural corridor. `clipQueue`'s `loads` key includes style; `reference.ts`/`prefetch.ts` take the style from the word they are handed, never from the setting.
- **Run:** `Run.speechStyle` is fixed at construction (a mid-run change applies next run) and stamped on every gate (`GateLogEntry.speechStyle`). **The calibration flight and the guided tutorial are always textbook** (`mode === "tutorial"` forces it); `learn` stays synthetic.
- **Visualiser** plays, draws and scores in the effective style (tapped word's clip, its polyline, tone-accuracy readout against that style's average; words without a natural take drop out of the rail). `PlayerToneEvolution` draws Jane's average for the current effective style. The visualiser's own live tone recogniser (`classifyTone`) still reads textbook anchors.
- **Classifier floor rule:** `isDrasticToneMismatch` and `applyClassifierBoost` are **off for natural gates** (the classifier is not run on them) — textbook anchors cost correct natural speakers hearts (hard rule 8), and style-aware anchors measured no better (DECISIONS.md). Do not re-enable without a new `classifier-check` result showing 0 clean wall hits.
- **Tone accuracy follows the gate's style:** `AVERAGED_TONE_SHAPE`/`AVERAGED_PAIR_SHAPE` are `Record<SpeechStyle, …>` (regenerate with `npm run make-tone-averages`), `toneAccuracy(…, style)` picks the reference and anchors the T2/T3 cue on it. Stats, `player_tone_shapes`, `run_log`, leaderboard and run cap are **one pool across styles** — no style column server-side.
- **`export-fallback` and `wordsFallback.json` stay textbook-only**; on a dead network a natural-mode player plays textbook corridors (no clip audio plays anyway).

The booth is where `natural` is recorded: `/booth/words`' list picker is (list × style) — each list id gets a "textbook" and a "natural" pill, each with its own pending/recorded split and its own "Start recording" pass — and `process-clips`/`verify-clips` both take `--style` alongside `--speaker`, required and validated the same way.

**The player's stored preference is an axis (`{ gender }`), never a speaker id.** `resolveSpeaker` answers the active speaker fresh each session, falling back to the default when the axis matches more than one active speaker.

**Pipeline:** `npm run import-words` writes a TSV into `words` → recording happens at `/record`, which talks only to the Worker's `/raw` and `/booth/words` routes (never Vercel `api/`) → `npm run process-clips -- --speaker <id> --style <s>` measures the take (`src/dev/clipCut.ts`), uploads to the private `flappytone-clips` R2 bucket at `clips/{speaker}/{id}.wav` (textbook, unchanged) or `clips/{speaker}/natural/{id}.wav` (natural), and upserts that speaker's `word_clips` row keyed `(word_id, speaker_id, style)` → `npm run export-fallback` snapshots the **default speaker's published TEXTBOOK catalog** into `src/data/wordsFallback.json` (excludes `contour`/`raw_key`/`recorded_session` — nothing in `src/` reads them off a fallback row, and shipping them was dead weight on the landing critical path; no `exportedAt`, so a no-op re-export produces an empty diff).

**`--speaker` and `--style` are both required and validated**, exits non-zero on an unknown speaker id or a style outside `('textbook','natural')` — every measurement the pipeline makes (pitch-search seed, cohort duration medians, review thresholds) is a property of one voice AND one style; a forgotten flag would normalise a natural cohort against a textbook map, or vice versa. `speakers.f0_seed` supplies the pitch-search seed (never derived from the catalog — deriving it once silently moved 90 of 120 shipped polylines; see DECISIONS.md) and is **not** style-scoped — the seed describes the speaker's voice, not the recording style. `verify-clips` and `clipReview` both take `--style` for the same reason `--speaker` is required; `clipReview`'s duration medians are per `(speaker, style)`. **Natural is placed with textbook's chao map, never its own:** a `--style natural` run also cuts the speaker's textbook takes and applies textbook's per-cohort map (`cohortPlacements`, `clipNormalize.ts`) to the natural cohort of the same key, so both styles of a word sit on the board by one map and natural keeps its real, smaller size (DECISIONS.md, "Speech style"). A natural key with no textbook cohort is left unplaced and warned about. `--no-upload` rewrites the rows without re-uploading audio (a re-cut's audio is byte-identical).

**The booth's speaker is derived from its passcode, server-side — no booth route accepts a speaker from the client.** The Worker's `resolveSpeaker` (`workers/clips/src/passcode.ts`) maps `x-record-passcode` to a `speakers.id` through the `RECORD_PASSCODES` secret; unset/unparseable/unknown all 503, fail-closed. `/raw` takes an explicit `?style=`, and its upsert conflict target is `(word_id, speaker_id, style)`, so a natural take physically cannot overwrite the textbook row — both the R2 key (`raw/{speaker}/{style}/{session}/{id}.wav`) and the DB row are style-scoped, not just speaker-scoped. `src/record/boothArming.ts` holds a second, independent guard: only the bulk "start recording" pass arms the mic on arrival; every other route to a word (overview, chip) lands paused, and a `published` word asks for confirmation before a redo — both rules exist because of a real overwrite incident (DECISIONS.md), and now key on (word, style): a `published` textbook take asks for confirmation independently of that word's natural status.

**Clip audio is gated behind a play ticket; guests get real clips too.** `POST /token` on the Worker verifies a Supabase session JWT if sent — **ES256 against the project's JWKS**, not HS256 (Supabase signs asymmetrically; there's no shared secret) — and mints a short-lived (30 min), IP-bound ticket carrying a tier. It never hard-fails: a missing/malformed/expired/anonymous JWT all resolve to a `guest` ticket, not a 401 — only a `min_tier='pro'` word is actually gated at `GET /clip/:id`. Bulk download is stopped by defence-in-depth (private buckets, no listing endpoint, one clip per request, short IP-bound tickets) plus a Cloudflare WAF rate-limit rule — **configured only on `/clip/*`, not on `/token` or the booth's `/auth`/`/booth/*`, because the Cloudflare free plan allows one rate-limit rule.** Revisit if the plan changes; until then those routes have no rate limit.

**The clip route is `/clip/:speaker/:id`, speaker as a path segment on purpose** — it's part of the edge cache key, so a cache key without it would serve one voice's audio under another's name with no error anywhere. `?v=` is the clip's own `word_clips.updated_at`, so re-recording one word busts only that clip's cache. The shared edge cache stores the response `public`; it's rewritten to `private` only on the way out to the browser, so no intermediary holds a per-player response.

**`clipS` ≠ `onsetS + durationS`.** Three separate clocks — file length / lead-in / tone window — have been folded together by mistake twice. See the table in DECISIONS.md before touching `clipCut.ts`, `run.ts`'s cue timing, or the catalog row schema.

Rules that hold the pipeline together — see DECISIONS.md for the incidents behind each:

1. **`src/dev/clipCut.ts` is the only measurement**, shared by `make-ref-clips` (the four anchors) and `process-clips` (via `src/dev/clipPipeline.ts`). After touching it: `git diff fixtures/anchors` must be empty, and `npm run process-clips -- --speaker <id> --dry-run` diffs before writing.
2. **`takeDetector` and `clipCut` must find the same voiced run** — pinned to the millisecond in `takeDetector.test.ts`.
3. **`clipReview.ts` flags, never blocks, and every comparison is within one voice** — its duration medians come from that speaker's own published rows.
4. **`f0Center` is measured per session** (pitch drifts between sittings); the pipeline's pitch-search *seed* is the one exception — per speaker, never derived from the catalog (`speakers.f0_seed`, `SEED_F0_CENTER = 168` is Jane's).
5. **`word_clips` is per speaker, and so is `f0_seed`.** Never write a measurement onto `words`; never reuse one speaker's seed to measure another's take.
6. **A voice is added as rows, not a schema change.**
7. **`src/data/catalogSeam.test.ts` is the seam between the pipeline and the game** — pins `CATALOG_SELECT`/`wordsFromCatalog`/`FALLBACK_COLUMNS` together, so a renamed DB column fails loudly instead of silently degrading to tuning defaults.

**`AVERAGED_TONE_SHAPE` (and `AVERAGED_PAIR_SHAPE`) and `toneClassifier.ts`/`toneAccuracy.ts` stay voice-independent, deliberately** — chao space is already normalised per speaker, and making the classifier per-voice would change scoring for every player who's ever played, for nothing a second voice needs.

**`src/audio/clipQueue.ts` is the only place clip-fetch rate policy lives** — concurrency (2), pacing, priority and 429 backoff. Every clip request goes through it. Two lanes: `"now"` (the queued gates' clips, a tapped word) bypasses pacing and jumps the queue; `"soon"` (speculation, the visualiser's tone warm-up) takes a token from a slow bucket (~1 per 400ms, burst 3) and can be cancelled by an `AbortSignal` when the player leaves. A 429 pauses **every** lane until `Retry-After` — the limit is per IP, so letting the fast lane run would just spend the next window on more 429s. **A retryable failure (429/5xx/network/abort) must never be cached in `loads`**: caching a 429 once demoted that word to the synthetic sweep for the whole session, indistinguishable from the clip being missing. The Cloudflare rule on `/clip/*` is 60 requests/10s per IP; the client must stay well under it on its own, not rely on the rule to shape it.

**The prefetch (`src/audio/prefetch.ts`) is two ordered tiers** — the queued gates' exact words first, then a mode-scoped slice capped at `tuning().prefetchWordsPerTone`, never the whole catalog at once, and the speculative tail is paced through `clipQueue` rather than handed to the network in one burst (`planPrefetchTiers` is what tells `prefetchPool` where the exact tier ends). It does not clone the run's RNG to predict `pickWord`'s draw (that would change the run); only the exact tier is guaranteed correct. `learn` mode fetches nothing (always cues synthetically).

## Tone pairs — shipped

Two-syllable words are a real, player-reachable mode now, not exploration. Both gates below read the live inventory and only appear once it holds a multi-syllable word — currently `multiWords(inventory).length > 0` is true (the `tonepairs-v1` batch, four words: 好玩/美國/小時/以前), so they are **live for every player today**, not dev-gated:

- **Modes → "Tone pairs"** (`src/ui/ModeSelect.tsx`): shuffle across every combo the tier's own words can build a gate from, or drill one tone combo.
- **Settings → word mix** (`src/ui/Settings.tsx`): the classic `game` mode can fly single syllables, pairs, or a shuffled mix of both (`WordMix`, `wordMix` setting). `tuning().multiGateChance` (default 0.5) is the per-gate draw odds when mix is `"all"` — not a measured value, retune from the Lab once pairs have actually been flown in classic mode.

**Engine:** `RunMode` gained `"pairs"` (`src/game/run.ts`). A pair gate holds through its inter-syllable pause rather than drifting toward centre — `tuning().multiMergeGapMs` (default 400ms, wider than the single-syllable `mergeGapMs`'s 150ms on purpose: a deliberate pause between syllables is not the same signal as a within-syllable creak gap) is the window a pause must fit inside to still read as one utterance. See DECISIONS.md's "pair gates hold through the pause, not drift" for the incident this fixed.

**Corridor geometry is unchanged and reused as-is** (`shapeForWord`, `corridorChaoAt`, `corridorToleranceAt`, `drawVisualiser`) — the implementation review's finding that these are shape-agnostic held. `corridorToleranceAt` widens for a pair by taking `max(TOLERANCE_FACTOR[t] for t in tones)` across every syllable's tone, not just the first.

**`isMulti` (`src/game/words.ts`) caps the live pairs pool at exactly `syllables === 2`** and allows a neutral (0) syllable within the pair — a 3+-syllable word can be catalogued (recordable) without reaching this mode, and a real word's natural neutral syllable is no longer excluded (`TOLERANCE_FACTOR`/`TONE_LINE_COLOR` both carry a `0` entry for this). See DECISIONS.md's "Neutral tone gets a sentinel, not a new concept" entry.

**The three things the implementation review flagged as real gaps are now explicit, resolved decisions, not silent single-tone assumptions:**

1. **Clip measurement**: `src/dev/clipCutMulti.ts` is the real, production multi-syllable-aware counterpart to `clipCut.ts`'s `longestVoicedRun`/`templateContour` — used by `process-clips.ts` for any word with `syllables > 1`, not a dev-only workaround. Deliberately **shape-agnostic**, no per-tone node template: sandhi means a tone's realised shape depends on what follows it (a 3+2 first syllable never reaches chao 5; a 3+3 first syllable rises like a Tone 2), so a corridor built from citation templates would teach a shape the speaker did not produce. See DECISIONS.md.
2. **`tone: Tone` assumed single-valued**: resolved per call site, not genericized —
   - `TOLERANCE_FACTOR` takes a max across the gate's `tones` array (above).
   - The tone-mismatch classifier (`isDrasticToneMismatch`) and the correct-tone accuracy boost (`applyClassifierBoost`) are both **off for `syllables > 1` gates**, on purpose (`src/game/run.ts`) — the classifier is trained and tuned on single-syllable shapes only, and running it against a two-syllable contour would misread every gate.
   - Per-tone stats (`RunStats.perTone`) skip multi-syllable gates entirely rather than attributing them to the first tone; pair gates feed `RunStats.perCombo` instead, keyed by `toneComboKey` (`applyGate` in `src/game/scoring.ts`). Combos with a neutral syllable are never stored — tone accuracy has no reference for them.
   - HUD labeling renders each syllable's tone separately, colored per tone.
   - `pickMultiWord` (`src/game/words.ts`) is `pickWord`'s own counterpart for the multi pool — same recent-window repeat-avoidance logic, keyed on `toneComboKey`.

**`src/dev/TonePairs.tsx` stays a separate, still-dev-only Lab tab** — not the shipped mode above, a tool for evaluating measured fixtures against the *textbook* citation+sandhi shape (per `docs/tonepairs/mandarin_tone_pairs_technical_reference.md`). `tonePairTheory.ts`'s citation shapes still must never feed anything a player sees — they're a validation tool against measured audio, not a contour source. `npm run tonepairs:generate` (`src/dev/generate-tonepair-polylines.ts`) still measures `fixtures/tonepairs/` into `src/dev/tonePairPolylines.json` for that comparison; it does not feed the shipped pipeline (that's `clipCutMulti.ts`, above, run through the real `process-clips`).

**Content pipeline is the same as single-syllable words**, syllable count aside: `npm run import-words` already parsed multi-syllable pinyin (space or numeric); the booth (`/record`) needed no change — `TakeDetector`'s `silenceMs` (500ms) is what ends a take, not `mergeGapMs`, and a real inter-syllable pause (~300ms) is comfortably under it, so a two-syllable take is captured whole without truncating at the first syllable. `process-clips -- --speaker <id>` and `export-fallback` both just work on `syllables > 1` rows already.

## Score and tone accuracy — two numbers, two jobs

Every gate produces both, and they must not be merged back into one (DECISIONS.md, "Score and tone accuracy are separate numbers"):

- **Score accuracy** (`scoreGate`): corridor error on the gate's own clock. Early, late or a wall hit rightly cost it. It alone drives points, combo, hearts, Perfect/Good/OK and the leaderboard — unchanged by spec A.
- **Tone accuracy** (`src/game/toneAccuracy.ts`): did the voice make the right tone, on the player's own clock — the utterance is cut out (`longestUtterance`, same merge rule as `heardUtterance`) and time-normalised, so a correct tone said early scores the same, and a wall hit is still measured. Reference: Jane's per-tone average (`AVERAGED_TONE_SHAPE`) or the exact combo's average (`AVERAGED_PAIR_SHAPE`, textbook, non-neutral combos), both baked by `npm run make-tone-averages`. Parts: shape correlation, movement size and height; T2/T3 targets add the classifier's drop/low-point cue; movement and cue are scaled by the shape match; level targets (T1, 1+1) are judged on flatness + height; a near-flat attempt on a moving tone is capped near 0. Every weight is a `tone accuracy` field on `tuning()`. It feeds per-tone/per-combo stats, the pause/game-over/progress breakdowns, the visualiser readout, the gate log and the `gate` event's `toneAcc` — **never** points, combo or hearts. Null when unheard or when there is no reference.

**The classifier (`toneClassifier.ts`) is two-stage** since 28 Sep 2026: correlation with the averages picks the family (level / dip-rise / fall), then T2 vs T3 is a four-vote cue anchored on the T2 and T3 averages (drop before the low point, the low point's height, the drop's share, correlation difference). Naming a tone and costing a heart are separate bars: a T2/T3 read only makes `isDrasticToneMismatch` fire when it is `decisive` (strong vote, no cue dissenting hard, no voicing gap in the dip). Check any classifier or averages change with `npm run classifier-check -- <contours.json>` — see Testing.

## Play analytics

Gameplay, product-usage, and traffic analytics all go through PostHog (`src/analytics/posthog.ts`), proxied through this domain at `/relay/...` (`vercel.json`) — ad/tracker blockers block PostHog's own domains by name, and without the proxy that silently drops every event from a blocked player. Read funnel/per-tone/quit-histogram numbers as live PostHog Insights.

**Production reports; a dev build does not.** `?analytics` forces it on in dev. A Vercel **preview** deploy is a production build and does report.

1. **`src/analytics/session.ts`'s `AnalyticsEvent` union is the only property-level gate on an event — `before_send` filters PostHog's defaults, not ours.** `sanitizeGameProperties` matches the event *name* against `APP_EVENTS`, drops `$`-prefixed keys except the two country-level geo fields, and passes every other property straight through unfiltered. This is uniform across both consent tiers (rule 3) — sanitization has nothing to do with consent. **A field added to `AnalyticsEvent` ships unfiltered** — the union must stay closed and reviewed. Never sent: audio, per-frame pitch/contour, raw user-agent, precise geolocation, cookies. `run_end` carries `voice` (the roster speaker id) and `speechStyle`, `visualiser_session` carries `speechStyle`, `setting_changed` has key `speech_style` — an id and two closed two-value unions, never anything typed.
2. **Analytics never breaks a run.** Every entry point in `client.ts`/`posthog.ts` swallows its own failures.
3. **Two consent tiers, one flag for gameplay only.** `mic`, `calib_step`, `calib_done`, `calib_abandoned`, `recal_offered`, `recal_resolved`, `run_start`, `gate`, `run_end`, `cue_fallback`, `run_feedback`, `calib_numbers`, and Visualiser practice (`visualiser_session`) are gated behind the "Anonymous game data" toggle (`setSharingEnabled`/`setPostHogConsent`, checked in `captureGameEvent`/`setCalibrationProperties` before every send, dropped rather than queued when off). Everything else, including screen views, mode selection, Settings changes, and the leaderboard/share/challenge/signup/upgrade funnel, is **global tier**: always sent in production regardless of that toggle, gated only by rule 4's `enabled()` check. `session.ts`'s `eventTier()` is the single place that decides which bucket an event falls into; a new event type must be added there, not inferred. Opting the gameplay tier off stops gameplay/calibration events immediately but does **not** reset the PostHog id or erase global-tier history, since the two tiers share one client instance and one distinct_id by design, so cross-tier funnels (e.g. "screen views leading to a run") stay joinable.
4. **A disabled build stores nothing.** `initPostHog` never starts the SDK outside production (or `?analytics`).

**PostHog project is shared across several of Pierre's apps** (id 426310, "Default project") — check settings like `anonymize_ips` before assuming they're FlappyTone-specific, and raise any project-wide change with Pierre first.

**Node-only CLI scripts must be listed in `tsconfig.app.json`'s `exclude` and `tsconfig.node.json`'s `include`** — skipping this leaks `@types/node` into the DOM project. For the same reason `session.ts` restates `MicErrorKind` instead of importing it, keeping Web Audio out of the payload module's graph.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md.

**Tone classifier and tone accuracy** are checked against real measured shapes, not synthetic curves: `fixtures/contours/jane-textbook-sample.json` (101 of Jane's published textbook `word_clips.contour` rows — the SQL that pulled them is in its `source` field) backs `toneAccuracy.test.ts`, which scores each clip against an average rebuilt without it. `npm run classifier-check -- <contours.json>` prints the classifier's confusion matrix, wall hits on correct speech, eight simulated-trouble variants (miscalibration, jitter, creak gap, onset scoop) and the fallback corridors flown ±120ms; the full contours file is pulled with a read-only SELECT and is not committed. "Wall hits on a correct speaker" is the number that must not go up. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.

## Working style

- One vertical slice per session. A slice ends with something runnable and committed.
- **Tune in the Lab, ship from the diff.** `npm run dev` → title → `lab`. The play tab runs a throwaway game beside sliders over `src/game/tuning.ts`; "copy diff as TS" prints exactly the fields that moved, for pasting into `DEFAULT_TUNING`. A value that has not been flown is not tuned.
- When a tuning constant changes, run the fixture tests and report which golden snapshots moved.
- Ask before adding a dependency.

## Out of scope

Speech recognition or syllable verification (beyond the standalone tone-shape classifier) · tone sandhi as an explicit, taught concept (a pair's corridor is measured shape-agnostic from the speaker's own contour — see "Tone pairs" above — but nothing surfaces the *rule* to a player) · connected speech / sentences / anything past two syllables · native app builds · listening/perception drills · payments/billing of our own (Lemon Squeezy is merchant of record; `api/webhook-ls.ts` only reacts to its webhook) · voice-clip storage beyond the current R2/Worker pipeline.

## Before accounts go live — Supabase settings, not code

Accounts are reachable by a real player today, so these are launch gates, not someday concerns:

- **Custom SMTP is done.** Resend, sending as `info@flappytone.com`, DKIM/SPF verified, Supabase Auth → SMTP Settings points at `smtp.resend.com`.
- **Redirect URLs are allowlisted** under Auth → URL Configuration. An unlisted redirect is silently replaced by the Site URL (`/`, the marketing entry, which ships no Supabase code) — the account still upgrades server-side, so this fails in the most confusing way available.
- **Leaked-password protection is unavailable** — paid Supabase feature, this project isn't on that tier. Revisit if/when it upgrades.
- **Re-check `get_advisors` after the first real signups** — some lints only appear once tables hold data.
- **Email confirmation is deliberately OFF.** A signup is permanent the instant `updateUser`/`signUp` resolves. See DECISIONS.md for why (funnel loss, webview breakage) and the accepted cost (an unverified address can be squatted; password reset is the recovery path, which is why custom SMTP is non-negotiable).

**Still undecided:** Google sign-in (removes the password step entirely, fits a phone-first audience, disturbs nothing in the anonymous→permanent upgrade path) — filed as a post-launch fast-follow, revisit if analytics show signup drop-off.

## Known limitations — do not try to "fix" these silently

- Humming beats the game. No syllable verification, though the tone-mismatch classifier (`toneMismatchCollisionEnabled`) catches some of the worst cases — see DECISIONS.md for its known gaps.
- Tone accuracy compares every single-syllable gate against Jane's per-tone *word* average, but the fallback corridors (tutorial, wordless gates — `DEFAULT_POLYLINES`, measured from her citation `ma` takes) are shaped differently: `ma2` dips deeper, `ma3` starts near chao 2. Flown perfectly, they score ~0.72–0.77, not ~0.9. Open question, not a bug to patch by switching the reference silently.
- A board that reads the player low (range too wide, or centre too high) makes the T2/T3 cue lean T3: on Jane's clips so warped, only ~25 of 47 T2s are named. Mostly as a non-decisive read — the boost is lost, never a heart.
- Creaky voice breaks f0 tracking, concentrated on Tone 3 — extended grace period, wider tolerance, "couldn't hear that" instead of a zero. Do not paper over it with interpolation that invents pitch data.
- T1 and T3's gate duration no longer matches their reference clip's length (tuned down from play) — the demo currently holds longer than the gate scores for those two tones. Known, not fixed; see DECISIONS.md before touching `gateDurationS`.
- The `/token`/`/auth`/`/booth/*` routes have no Cloudflare rate limit (free-plan single-rule constraint — see "clip catalog" above). `/clip/*` is covered.
