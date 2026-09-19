# CLAUDE.md — FlappyTone

Browser game where the player's voice is the controller. Live pitch (f0) drives a bird's Y position; the player flies through corridors shaped like Mandarin tone marks by producing the matching tone.

Full spec: @docs/PRD.md — read it before implementing a slice, not before every task. Design rationale that isn't a standing rule lives in @docs/DECISIONS.md — check it before assuming a tuned value or a removed feature was an oversight.

## Stack

React 19 + TypeScript + Vite. Canvas 2D. Web Audio API. Plain CSS with a design-token system (`src/ui/tokens.css`, documented in `docs/BRAND.md`) — no Tailwind. Supabase (auth + Postgres, Tokyo) for accounts/leaderboard/entitlements/catalog, Cloudflare R2 + a Worker for clip audio. Full history of how this backend was introduced is in DECISIONS.md — this file states current behavior only.

## Accounts, tiers and the leaderboard

- **`src/data/`** is the only place that talks to Supabase. `supabase.ts` holds the single client; `leaderboard.ts` holds every read/write of the board; `words.ts` + `catalogRows.ts` are the catalog fetch (live query, falling back to bundled `wordsFallback.json`); `tier.ts`/`entitlements.ts` resolve tier and paid access. **Nothing in `src/data/` may throw into a caller** — a failure returns an empty board / `false` / the fallback catalog, never a broken screen. Same contract `src/share/share.ts` and `src/analytics/client.ts` keep.
- **Two write lanes, split by whether the client may decide the value.** The player's `profiles` row is client-written, RLS-guarded (`auth.uid() = id`). Everything the client must not be trusted to compute goes through a server function with the service-role key: `api/score.ts` (leaderboard, week from server time), `api/run.ts` (daily run count), `api/webhook-ls.ts` (`has_access`, from Lemon Squeezy's webhook only). `leaderboard_scores` and `entitlements` have **no client write policy at all** — that's the enforcement, not a convention.
- **Three tiers, two gates.** `guest` (anonymous/signed-out): 3 runs/day, local-only progress, no visualiser practice, can see the board but not join it. `free` (email account): 10 runs/day, saved+synced progress, a real board row under a generated name, 5 words/tone in the visualiser. `pro` (paid): unlimited runs, full board + chosen name, customization. Gate 1 (guest→free, via signup) is persistence + run cap; Gate 2 (free→pro, via Lemon Squeezy) is depth/customization, **never** run quantity or word access — see next bullet.
- **`src/game/tiers.ts`'s `TIER_LIMITS` is the single source of truth for per-tier limits**, free of `src/data/` imports so game code can read it without pulling in the Supabase graph. **`min_tier` (on `words`, gates game access) and `TIER_LIMITS.wordsPerTone` (visualiser practice depth) are different gates that must never be conflated** — conflating them was a real incident (DECISIONS.md) that made the scored game play synthetic sweeps for non-Pro players. Every word ships `min_tier='free'` today; `wordsOfTone(words, tone, limit)` takes its cap as a parameter, and `pickWord` (feeding a scored run) always calls it with no limit.
- **The run cap is server-authoritative for accounts, device-local for guests.** `dailyLimit.ts` owns the local counter (not tamper-proof by design); a signed-in player's run also POSTs to `api/run.ts`, the sole writer of `daily_runs`. A guest has no durable identity for a server row to count against — clearing storage mints a new anonymous user — so guests stay local-only, permanently.
- **Anonymous sign-in is unreachable from any live path.** Nothing signs a guest in; only an email account can join the board or post a score (`api/score.ts` 403s an `is_anonymous` session).
- **Auth is email+password, magic link secondary.** `signUpWithPassword` (`src/data/account.ts`) upgrades the existing anonymous user in place (`updateUser`, never `signUp`) and must call `refreshSession()` right after — the pre-upgrade JWT still carries `is_anonymous: true`, and RLS reads the claim. `syncAccount()` then runs automatically.
- **Stats sync is merge-by-max, both directions**, on signup/second-device/after each run/on app load. Lifetime per-tone stats (`runHistory.ts`'s `lifetimePerTone`) and streak/count aggregates are account-owned; `lastRuns` and `lastPlayedDate` stay local (device display cache, no honest cross-device answer). Local is always authoritative for rendering.
- **Renaming needs Pro, enforced by a `BEFORE UPDATE` trigger on `profiles`** (`enforce_rename_entitlement()`), not an RLS policy — free accounts still need to write their own row for the stats sync, and RLS can't gate a single column. Revoking Pro does not revert an already-chosen name (DECISIONS.md).
- **Migrations live in `supabase/migrations/`, applied via the Supabase MCP `apply_migration`**, never by hand. Regenerate/commit `src/data/database.types.ts` after each one; run `get_advisors` (security + performance) before calling a schema change done. Raw-SQL migrations must include explicit `GRANT`s — the dashboard's table editor adds them invisibly, a migration does not.
- **`api/*.ts`**: `api/newsletter.ts` (ConvertKit proxy), `api/score.ts`/`api/run.ts`/`api/webhook-ls.ts` (the three sole writers above). A test file in `api/` must be named `_*.test.ts` or Vercel deploys it as a public endpoint (`api/_imports.test.ts` checks this).

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
api/          Vercel functions: newsletter, score, run, webhook-ls — see above.
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

**The catalog is a roster: `words` + `speakers` + `word_clips`.** A word is who it is (`words`: hanzi, pinyin, tone, position, `min_tier`, game access). A *recording* of it is a row in `word_clips`, keyed `(word_id, speaker_id)`, holding every measurement (`clip_key`, `duration_s`, `onset_s`, `clip_s`, `polyline`, `contour`, `status`). `speakers` holds the voices — attributes (`gender`, `accent`, `is_default`, `active`), never a `voice` enum, because who recorded, what range it reads as, and what accent it speaks are three independent facts. A second/third voice is an `INSERT` into `speakers` + that speaker's `word_clips`; if adding a voice ever needs a schema change, the shape is wrong (DECISIONS.md, "A speaker, not a voice enum").

**The player's stored preference is an axis (`{ gender }`), never a speaker id.** `resolveSpeaker` answers the active speaker fresh each session, falling back to the default when the axis matches more than one active speaker.

**Pipeline:** `npm run import-words` writes a TSV into `words` → recording happens at `/record`, which talks only to the Worker's `/raw` and `/booth/words` routes (never Vercel `api/`) → `npm run process-clips -- --speaker <id>` measures the take (`src/dev/clipCut.ts`), uploads to the private `flappytone-clips` R2 bucket at `clips/{speaker}/{id}.wav`, and upserts that speaker's `word_clips` row → `npm run export-fallback` snapshots the **default speaker's** published catalog into `src/data/wordsFallback.json` (excludes `contour`/`raw_key`/`recorded_session` — nothing in `src/` reads them off a fallback row, and shipping them was dead weight on the landing critical path; no `exportedAt`, so a no-op re-export produces an empty diff).

**`--speaker` is required and validated against `speakers`**, exits non-zero on an unknown id — every measurement the pipeline makes (pitch-search seed, cohort duration medians, review thresholds) is a property of one voice; a forgotten flag would normalise one speaker's cohort against another's rows. `speakers.f0_seed` supplies the pitch-search seed (never derived from the catalog — deriving it once silently moved 90 of 120 shipped polylines; see DECISIONS.md). `verify-clips` and `clipReview` both take `--speaker` for the same reason.

**The booth's speaker is derived from its passcode, server-side — no booth route accepts a speaker from the client.** The Worker's `resolveSpeaker` (`workers/clips/src/passcode.ts`) maps `x-record-passcode` to a `speakers.id` through the `RECORD_PASSCODES` secret; unset/unparseable/unknown all 503, fail-closed. `/raw` upserts on the explicit `(word_id, speaker_id)` conflict target, so one speaker's session physically cannot overwrite another's row. `src/record/boothArming.ts` holds a second, independent guard: only the bulk "start recording" pass arms the mic on arrival; every other route to a word (overview, chip) lands paused, and a `published` word asks for confirmation before a redo — both rules exist because of a real overwrite incident (DECISIONS.md).

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

**`AVERAGED_TONE_SHAPE` and `toneClassifier.ts` stay voice-independent, deliberately** — chao space is already normalised per speaker, and making the classifier per-voice would change scoring for every player who's ever played, for nothing a second voice needs.

**The prefetch (`src/audio/prefetch.ts`) is two ordered tiers** — the queued gates' exact words first, then a mode-scoped slice capped at `tuning().prefetchWordsPerTone`, never the whole catalog at once. It does not clone the run's RNG to predict `pickWord`'s draw (that would change the run); only the exact tier is guaranteed correct. `learn` mode fetches nothing (always cues synthetically).

## Tone pairs — shipped

Two-syllable words are a real, player-reachable mode now, not exploration. Both gates below read the live inventory and only appear once it holds a multi-syllable word — currently `multiWords(inventory).length > 0` is true (the `tonepairs-v1` batch, four words: 好玩/美國/小時/以前), so they are **live for every player today**, not dev-gated:

- **Modes → "Tone pairs"** (`src/ui/ModeSelect.tsx`): shuffle across every combo the tier's own words can build a gate from, or drill one tone combo.
- **Settings → word mix** (`src/ui/Settings.tsx`): the classic `game` mode can fly single syllables, pairs, or a shuffled mix of both (`WordMix`, `wordMix` setting). `tuning().multiGateChance` (default 0.5) is the per-gate draw odds when mix is `"all"` — not a measured value, retune from the Lab once pairs have actually been flown in classic mode.

**Engine:** `RunMode` gained `"pairs"` (`src/game/run.ts`). A pair gate holds through its inter-syllable pause rather than drifting toward centre — `tuning().multiMergeGapMs` (default 400ms, wider than the single-syllable `mergeGapMs`'s 150ms on purpose: a deliberate pause between syllables is not the same signal as a within-syllable creak gap) is the window a pause must fit inside to still read as one utterance. See DECISIONS.md's "pair gates hold through the pause, not drift" for the incident this fixed.

**Corridor geometry is unchanged and reused as-is** (`shapeForWord`, `corridorChaoAt`, `corridorToleranceAt`, `drawVisualiser`) — the implementation review's finding that these are shape-agnostic held. `corridorToleranceAt` widens for a pair by taking `max(TOLERANCE_FACTOR[t] for t in tones)` across every syllable's tone, not just the first.

**The three things the implementation review flagged as real gaps are now explicit, resolved decisions, not silent single-tone assumptions:**

1. **Clip measurement**: `src/dev/clipCutMulti.ts` is the real, production multi-syllable-aware counterpart to `clipCut.ts`'s `longestVoicedRun`/`templateContour` — used by `process-clips.ts` for any word with `syllables > 1`, not a dev-only workaround. Deliberately **shape-agnostic**, no per-tone node template: sandhi means a tone's realised shape depends on what follows it (a 3+2 first syllable never reaches chao 5; a 3+3 first syllable rises like a Tone 2), so a corridor built from citation templates would teach a shape the speaker did not produce. See DECISIONS.md.
2. **`tone: Tone` assumed single-valued**: resolved per call site, not genericized —
   - `TOLERANCE_FACTOR` takes a max across the gate's `tones` array (above).
   - The tone-mismatch classifier (`isDrasticToneMismatch`) and the correct-tone accuracy boost (`applyClassifierBoost`) are both **off for `syllables > 1` gates**, on purpose (`src/game/run.ts`) — the classifier is trained and tuned on single-syllable shapes only, and running it against a two-syllable contour would misread every gate.
   - Lifetime per-tone stats (`RunStats.perTone`) skip multi-syllable gates entirely rather than attributing them to the first tone (`applyGate` in `src/game/scoring.ts`) — see DECISIONS.md's "classic pool is single-syllable by construction."
   - HUD labeling renders each syllable's tone separately, colored per tone.
   - `pickMultiWord` (`src/game/words.ts`) is `pickWord`'s own counterpart for the multi pool — same recent-window repeat-avoidance logic, keyed on `toneComboKey`.

**`src/dev/TonePairs.tsx` stays a separate, still-dev-only Lab tab** — not the shipped mode above, a tool for evaluating measured fixtures against the *textbook* citation+sandhi shape (per `docs/tonepairs/mandarin_tone_pairs_technical_reference.md`). `tonePairTheory.ts`'s citation shapes still must never feed anything a player sees — they're a validation tool against measured audio, not a contour source. `npm run tonepairs:generate` (`src/dev/generate-tonepair-polylines.ts`) still measures `fixtures/tonepairs/` into `src/dev/tonePairPolylines.json` for that comparison; it does not feed the shipped pipeline (that's `clipCutMulti.ts`, above, run through the real `process-clips`).

**Content pipeline is the same as single-syllable words**, syllable count aside: `npm run import-words` already parsed multi-syllable pinyin (space or numeric); the booth (`/record`) needed no change — `TakeDetector`'s `silenceMs` (500ms) is what ends a take, not `mergeGapMs`, and a real inter-syllable pause (~300ms) is comfortably under it, so a two-syllable take is captured whole without truncating at the first syllable. `process-clips -- --speaker <id>` and `export-fallback` both just work on `syllables > 1` rows already.

## Play analytics

Gameplay and traffic analytics go through PostHog (`src/analytics/posthog.ts`), proxied through this domain at `/relay/...` (`vercel.json`) — ad/tracker blockers block PostHog's own domains by name, and without the proxy that silently drops every event from a blocked player. Read funnel/per-tone/quit-histogram numbers as live PostHog Insights.

**Production reports; a dev build does not.** `?analytics` forces it on in dev. A Vercel **preview** deploy is a production build and does report.

1. **`src/analytics/session.ts`'s `AnalyticsEvent` union is the only property-level gate on a gameplay event — `before_send` filters PostHog's defaults, not ours.** `sanitizeGameProperties` matches the event *name* against `GAME_EVENTS`, drops `$`-prefixed keys except the two country-level geo fields, and passes every other property straight through unfiltered. **A field added to `AnalyticsEvent` ships unfiltered** — the union must stay closed and reviewed. Never sent: audio, per-frame pitch/contour, raw user-agent, precise geolocation, cookies. `run_end` carries `voice` (the roster speaker id) — an id, never anything typed.
2. **Analytics never breaks a run.** Every entry point in `client.ts`/`posthog.ts` swallows its own failures.
3. **Consent is checked before capture starts**, one flag for both traffic and gameplay (`setSharingEnabled`/`setPostHogConsent`). Opting out resets the PostHog id and stops capture immediately.
4. **A disabled build stores nothing.** `initPostHog` never starts the SDK outside production (or `?analytics`).

**PostHog project is shared across several of Pierre's apps** (id 426310, "Default project") — check settings like `anonymize_ips` before assuming they're FlappyTone-specific, and raise any project-wide change with Pierre first.

**Node-only CLI scripts must be listed in `tsconfig.app.json`'s `exclude` and `tsconfig.node.json`'s `include`** — skipping this leaks `@types/node` into the DOM project. For the same reason `session.ts` restates `MicErrorKind` instead of importing it, keeping Web Audio out of the payload module's graph.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

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
- Creaky voice breaks f0 tracking, concentrated on Tone 3 — extended grace period, wider tolerance, "couldn't hear that" instead of a zero. Do not paper over it with interpolation that invents pitch data.
- T1 and T3's gate duration no longer matches their reference clip's length (tuned down from play) — the demo currently holds longer than the gate scores for those two tones. Known, not fixed; see DECISIONS.md before touching `gateDurationS`.
- The `/token`/`/auth`/`/booth/*` routes have no Cloudflare rate limit (free-plan single-rule constraint — see "clip catalog" above). `/clip/*` is covered.
