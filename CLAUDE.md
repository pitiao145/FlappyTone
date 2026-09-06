# CLAUDE.md — FlappyTone

Browser game where the player's voice is the controller. Live pitch (f0) drives a bird's Y position; the player flies through corridors shaped like Mandarin tone marks by producing the matching tone.

Full spec: @docs/PRD.md — read it before implementing a slice, not before every task. Design rationale that isn't a standing rule lives in @docs/DECISIONS.md — check it before assuming a tuned value or a removed feature was an oversight.

## Stack

React 19 + TypeScript + Vite. Canvas 2D. Web Audio API. Plain CSS with a design-token system (`src/ui/tokens.css`, documented in `docs/BRAND.md`) — no Tailwind. Accounts, a database backend and cross-device persistence are now a **decided direction**, not a non-goal — Supabase (auth + Postgres) with Cloudflare R2 for object storage, being built **starting with the leaderboard** (see `docs/flappytone-ARCH-supabase.md` and `docs/flappytone-SPEC-supabase-phase1.md`). This is the deliberate lifting of v1's client-only boundary, taken on real traction. **Until a given piece actually lands it is not in the code.** Add backend state through a migration + the two-lane write model in the arch doc, not ad hoc.

**What has landed (Ring 1 / Phase 1):** anonymous auth and the weekly leaderboard.

- **`src/data/`** is the only place that talks to Supabase. `supabase.ts` holds the single client and `ensureAnonSession()`; `leaderboard.ts` holds every read and write of the board. Both obey one contract: **nothing in `src/data/` may throw into a caller.** A failure returns an empty board or `false`, so a dead network degrades to "no board today", never to a broken end screen — the same rule `src/share/share.ts` and `src/analytics/client.ts` already keep.
- **Sign-in is lazy, deliberately.** `signInAnonymously()` runs when a player joins the board, *not* at app load, so a visitor who never submits a score never becomes a row in `auth.users`.
- **Two write lanes, split by whether the client may decide the value.** The player's `profiles` row is written by the browser and guarded by RLS (`auth.uid() = id`). Their score is written *only* by `api/score.ts`, which holds the service-role key, verifies the JWT, and computes the ISO week from server time. `leaderboard_scores` has **no client write policy at all** — that is the enforcement, not a convention. If the client could lie about a value and it matters, it goes through a function.
- **Display names are generated, never typed.** The player gets something like `BraveSparrow42`, cached at `toneflap.identity.v1` and copied into their profile on join. Choosing a name is a planned Pro feature. This also keeps the "nothing the player typed" promise in `src/analytics/session.ts` intact — no board name is ever sent to PostHog.
- **Joining is opt-in and offered only on a personal best**, so the modal can't nag after every run; an already-joined player's runs submit silently.
- **Migrations live in `supabase/migrations/` and are applied via the Supabase MCP `apply_migration`**, never by hand in the dashboard. Regenerate and commit `src/data/database.types.ts` after each one, and run `get_advisors` (security *and* performance) before calling a schema change done. Raw-SQL migrations must include explicit `GRANT`s — the dashboard's table editor adds them for you and a migration does not, and RLS policies alone will not save you: RLS narrows access, it does not grant it.
- **Personal stats are local-first, and sync only for an account.** `runHistory.ts`, `streak.ts` and `dailyLimit.ts` remain the source of truth on the device. An anonymous player's stats never leave it — `tone_stats`'s RLS enforces that, not just the client.

**What has landed (Ring 2 / Phase 2): accounts, dev-gated.** Accounts *are* the Pro tier, so none of this is reachable by a player — `src/dev/AccountCard.tsx` is gated at its mount site in `Profile.tsx` like the Lab.

- **Adding an email upgrades the anonymous user in place.** `src/data/account.ts` calls `updateUser({ email })` for an anonymous player, never `signInWithOtp` — the latter signs them into a *different* user and silently abandons their scores. That distinction is the single most damaging mistake available in that file; the comment there says so.
- **Sync is merge-by-max, both directions, and identical on signup and on a second device.** That is why there is no "claim your guest data" path. The server is written before local, so a failed sync leaves the device still holding everything.
- **Lifetime per-tone stats accumulate locally** in `runHistory.ts`'s `lifetimePerTone`, shaped 1:1 to the `tone_stats` columns. It was added additively — the `toneflap.history.v1` key is deliberately *not* bumped, since that would wipe every player's history to gain a field that can be seeded from `lastRuns`.
- **`lastRuns` and `lastPlayedDate` never sync.** One is a display cache of this device's own runs, the other decides whether today continues the streak. Neither has an honest cross-device answer, so neither is an account's business.

Everything below this line is still device-local, and none of it moved:

**Local/booth persistence** — device-local or booth-only, none of it assuming tamper-proofing. The leaderboard backend is the successor to this layer, not a competitor to it (personal stats stay local-first, sync on signup — see the arch doc):

- **`src/game/runHistory.ts` and `src/game/dailyLimit.ts`** (27 Aug 2026): the Progress/Profile tabs need real, device-local stats — lifetime run/gate/word counts, the last 5 runs' per-tone accuracy, a "N of 5 free runs today" counter — to avoid faking numbers the UI claims are real. Both follow `settings.ts`'s key/version/validate convention and store nothing that leaves the device. `dailyLimit.ts` is explicitly **not tamper-proof** — there are no accounts, so its checksum only deters a casual devtools edit. Don't build product logic that assumes it can't be bypassed, and don't reach for this pattern beyond what the free-tier teaser needs.
- **`api/*.ts`**: five small Vercel functions. `api/upload.ts` + `api/auth.ts` + `api/_passcode.ts` gate the passcode-protected `/record` booth's upload to Blob storage (one user, not an account — see file headers for the threat model). `api/newsletter.ts` proxies a landing-page email signup to ConvertKit so the client never sees the API key. `api/score.ts` is the one gameplay function: the sole writer of the leaderboard. Apart from it, the player-facing game talks to nothing but Supabase reads and PostHog. **A test file in `api/` must be named `_*.test.ts`** — without the underscore Vercel deploys it as a public endpoint, which `api/_imports.test.ts` checks.

## Hard rules — these are not defaults, do not drift back to them

1. **The game loop is `requestAnimationFrame` outside React.** React renders the shell, menus and end screen only. Never call `useState` per frame. Game state lives in a mutable object held in a `useRef` or a module singleton.
2. **`AudioWorkletNode` only.** `ScriptProcessorNode` is deprecated — do not use it, and do not "fall back" to it. If `AudioWorklet` is unsupported, show an unsupported-browser screen.
3. **All pitch math in semitones, never raw Hz.** Pitch perception is logarithmic. `semitones = 12 * Math.log2(f0 / f0Center)`.
4. **Every audio API call sits behind an explicit user gesture.** iOS Safari requires a gesture for both `getUserMedia()` and `AudioContext.resume()`. This is the most common silent failure — test it on a real iPhone, not the simulator.
5. **`src/pitch/` must have zero Web Audio dependencies.** It takes `Float32Array` frames in and returns pitch state out — a pure module, testable offline against WAV fixtures. Web Audio lives only in `src/audio/`, which feeds `src/pitch/`. Never import `AudioContext` inside `src/pitch/`.
6. **Tunable constants live in `src/game/tuning.ts`, not as bare module constants.** Anything the Lab should be able to move during a session is a field on that singleton, with its default equal to the shipped value. Production never calls `setTuning`. Note some modules (`scoring.ts`, `dynamics.ts`) still export same-named constants for tests/back-compat naming — those are not necessarily equal to the live tuning default; `tuning()` is the only source of truth for runtime behavior.
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** `src/dev/Lab.tsx` and `GateLogPanel` are both gated this way so Rollup drops the subtree. A query-param flag is *not* a gate on its own — a guard *inside* a component only hides it, it does not remove it. Gate the JSX at the usage site as well. Check the whole boundary after touching it:
   ```bash
   npm run build
   for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done   # must print nothing
   ```
8. **When the signal is unclear, the game says "couldn't hear that" — it never scores the player wrong.** A gate whose longest voiced run is under `minUtteranceMs` (default 160ms, merging gaps under `mergeGapMs`) is neutral: no points, no heart lost. The test is utterance *duration*, not voiced fraction. Confidently failing a correct speaker is the single fastest way to lose a user.
9. **All hanzi is Traditional Mandarin, never Simplified.** Jane records Taiwan Mandarin (§PRD "trained on the voice of a native Mandarin speaker from Taiwan"), so every character shown anywhere — word list, manifest, HUD, landing page — must be Traditional. `src/record/wordlist.ts` and `public/ref/manifest.json` are already correct; the one place this drifted was `src/brand.ts`'s `tones` map (the mā/má/mǎ/mà anchors used by `TONE_INFO` in `src/game/gates.ts`, which feeds the landing page's tone cards and the in-game "How to play" screen) — it briefly shipped 妈/马/骂 instead of 媽/馬/罵. Check any new hanzi against a Traditional reference, not by eye.

## Layout

```
src/
  pitch/      pure DSP — detection, smoothing, octave correction, Hz→semitone→Chao, calibration math. NO Web Audio.
  audio/      AudioWorklet setup, mic permission, calibration capture, reference-clip playback. Feeds src/pitch/.
  game/       loop, entities, gate generation, tuning, scoring, tone classifier, run history, daily limit. NO React.
  render/     canvas draw calls. Pure functions of game state.
  data/       the only Supabase-facing code: client + anonymous session, leaderboard reads/writes. Never throws.
  ui/         React components: menus, HUD overlay, calibration, settings, progress/profile, game over.
  app/        the /app entry: GameApp (the game's shell) + GameNav + main.tsx.
  record/     the /record entry: Jane's recording booth.
  analytics/  what a play session sends home. session.ts is pure; client.ts/posthog.ts are the impure part.
  dev/        the Lab (dev-only tuning instance) + CLI analysis/build scripts.
api/          Vercel functions: the record booth, newsletter signup, and score.ts (the only writer of the leaderboard).
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

1. **The marketing page must not import `src/audio/` or `src/pitch/`.** That is the whole reason the split exists. Check after touching `Landing.tsx` or anything it imports:
   ```bash
   npm run build
   grep -l PitchTracker dist/assets/*.js     # must list only the app + record chunks
   ```
   `ToneAverageCard` and `ContourSpark` legitimately pull `game/gates` and `game/words` for the tone charts; that is data and geometry, not the engine.
2. **Crossing between `/` and `/app` is a real navigation, and a click gesture does not survive it.** `ensureMic()` needs the gesture (hard rule 4), so the landing page cannot open the mic on the game's behalf. It passes `?intent=visualiser` instead; the player's first tap on `/app` is the gesture. Do not try to auto-start from the intent — it fails silently on iOS Safari. `src/ui/appLink.ts` is the only thing that knows the game's URL. **`?intent=visualiser` must work on a session that has never calibrated, not just a returning one** — a share link is by definition someone's first visit. `GameApp.tsx`'s initial `screen`/`visualiserMicReady` state used to require `settings` to already exist before honouring the intent at all, silently dropping first-time arrivals onto the Play screen (fixed 2 Sep 2026 — see DECISIONS.md). If you touch this path, re-check it against a cleared `localStorage` session, not just a calibrated one.
3. **Only `index.html` is prerendered.** `src/dev/prerender.ts` bakes the landing into it for crawlers, and `prerenderEntry.tsx`'s wrapper markup (`.app > .app-main > .frame`) must stay identical to `LandingApp`'s or crawler markup and React's markup diverge.
4. **`Nav.tsx` is the marketing site's bar; the game has its own (`src/app/GameNav.tsx`).** Do not reintroduce a shared nav — there is nothing to fake across two real pages.

One analytics consequence: **`landed` means "opened `/app`", not "visited the site"** — a visit to the marketing page is a `$pageview` instead.

## Commands

```bash
npm run dev            # vite dev server, over HTTPS — use for anything not touching api/
npm run dev:api        # vercel dev: the only way to exercise api/ (score submission)
npm run test           # vitest
npm run analyze <wav>  # print ASCII contour for a fixture — use this to "see" pitch output
npm run typecheck
npm run build           # also gates dev-tooling exclusion, see hard rule 7
```

**`dev:api` sources `.env.local` itself.** This repo is linked to Vercel through `.vercel/repo.json` (a repo-style link, not `project.json`), and in that setup `vercel dev` does not pick up `.env.local` — every function sees an empty `process.env` and fails closed, which for `api/score.ts` means a 503 that looks exactly like a missing key. The script therefore exports the file before starting. Values with spaces or `#` would need quoting, since this is shell sourcing rather than a dotenv parser.

**The two dev servers are mutually exclusive on TLS, and that is not a bug to fix.** `npm run dev` serves HTTPS via `basicSsl()` because `getUserMedia` needs a secure context, which is what makes on-phone mic testing over the LAN possible. `vercel dev` runs Vite as a child and proxies it over plain HTTP, so an HTTPS upstream fails with `ERR_SSL_PROTOCOL_ERROR` before anything renders — `dev:api` therefore sets `FT_NO_SSL=1`, which drops the plugin. Desktop is unaffected (`localhost` is a secure context without TLS); the one thing neither command does is exercise `api/` *from a phone*. If you need that, use a Vercel preview deploy.

Clip-pipeline and demo-clip scripts (`make-clips`, `pull-recordings`, `import-words`, `update-demo`, etc.) are covered where they're used below, not repeated here — `npm run` with no args lists everything in `package.json`.

## Landing page demo clips

`src/ui/DemoLoop.tsx` plays two recorded, muted loops on the landing page — the hero clip and the visualiser clip — each shipped as a `.webm`/`.mp4` pair in `public/hero/` and `public/visualiser/`. Swapping in a new take means keeping four things in sync: both video files, `DemoLoop.tsx`'s native-size constants, and `src/dev/demoStub.tsx`'s matching constants (the prerendered placeholder that reserves the same box). `npm run update-demo` does all four:

```bash
npm run update-demo hero
npm run update-demo visualiser
# or point it at a file elsewhere and it copies it into place first:
npm run update-demo hero ~/Downloads/new-hero-take.mp4
```

It strips any audio track, regenerates the matching `.webm`, and rewrites the size constants in both files. Doesn't run the build — check with `npm run build` (or `npm run dev`) after.

## The clip inventory

Reference clips are recorded by Jane at `/record`, not cut by hand:

```bash
npm run pull-recordings [session]  # Blob -> fixtures/recordings/<session>/ (gitignored)
npm run make-clips                 # -> public/ref/<id>.wav + manifest.json, with a review report
```

The word list comes from a two-column TSV (hanzi, pinyin) via `npm run import-words`, merged into `src/record/wordlist.ts` — a registry, not a generated file; an id, once minted, never moves. See DECISIONS.md if you need the reasoning.

**A gate is built from a word, not a tone.** `manifest.json` carries each clip's `durationS` and its corridor `polyline`; `src/game/words.ts` parses it, `shapeForWord` turns it into the corridor, `src/audio/reference.ts` plays the cue. `public/ref/` is the shipped inventory (still git-tracked — the migration to R2 proposed in `docs/flappytone-SPEC-r2-clip-storage.md` hasn't happened). The four `ma` anchors used for offline dev tooling live separately at `fixtures/anchors/`.

**`clipS` ≠ `onsetS + durationS`.** Three separate clocks (file length / lead-in / tone window) matter here and have been folded together by mistake twice — see the table in DECISIONS.md before touching any of `clipCut.ts`, `run.ts`'s cue timing, or `manifest.json`'s schema.

Five rules that hold the pipeline together — see DECISIONS.md for the incidents behind each:

1. **`src/dev/clipCut.ts` is the only measurement**, shared by `make-ref-clips` (the four anchors) and `make-clips` (everything Jane records). After touching it, regenerate and check `git diff fixtures/anchors` is empty and `manifest.json`'s `polyline`/`contour` fields didn't move.
2. **`takeDetector` and `clipCut` must find the same voiced run.** `takeDetector.test.ts` pins this to the millisecond against Jane's four captures.
3. **`clipReview.ts` flags, it never blocks.** Its tests assert Jane's four anchor clips pass clean.
4. **`f0Center` is measured per session, not read from `speakers.json`.** Pitch drifts between sittings; `measurePitchReference` pools the session's own voiced frames.
5. **`manifest.test.ts` is the seam between the cutter and the game.** A renamed field surfaces as an empty inventory — which silently degrades to tuning defaults and looks exactly like the game working.

## Play analytics

Gameplay and traffic analytics go through PostHog (`src/analytics/posthog.ts`), proxied through this domain at `/relay/...` (`vercel.json`) — ad/tracker blockers block PostHog's own domains by name, and without the proxy that silently drops every event from a blocked player. Read funnel/per-tone/quit-histogram numbers as live PostHog Insights.

**Production reports; a dev build does not.** `?analytics` forces it on in dev. A Vercel **preview** deploy is a production build and does report.

Rules that hold this together:

1. **`src/analytics/session.ts` decides what a gameplay event can contain, and `posthog.ts`'s `before_send` re-enforces it at the transport boundary.** `AnalyticsEvent` is a closed discriminated union; `before_send` reduces every *sent* property on gate/run/calibration events to that same closed set, dropping PostHog's own `$`-prefixed defaults. Never sent by this app's code: audio, per-frame pitch/contour data, raw user-agent, precise geolocation, cookies. Country-level geo (`$geoip_country_name`/`code`) is the one deliberate exception, answering a real product question (Taiwan vs. Beijing reference audio); city/region/lat-long are stripped regardless. Marketing events (CTA clicks, `$pageview`) are untouched by this allowlist.
2. **Analytics never breaks a run.** Every entry point in `client.ts`/`posthog.ts` swallows its own failures. If this code can throw into a caller, that's the bug.
3. **Consent is checked before capture starts**, one flag for both traffic and gameplay (`setSharingEnabled`/`setPostHogConsent`). Opting out resets the PostHog id and stops capture immediately.
4. **A disabled build stores nothing.** `initPostHog` never starts the SDK outside production (or `?analytics`).

See DECISIONS.md for the Blob→PostHog migration history and the accepted reliability gap.

**Node-only CLI scripts must be listed in `tsconfig.app.json`'s `exclude` and `tsconfig.node.json`'s `include`.** Skipping this leaks `@types/node` into the DOM project. For the same reason `session.ts` restates `MicErrorKind` instead of importing it, keeping Web Audio out of the payload module's graph, same separation `src/pitch/` keeps. `session.test.ts` pins the two together.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.

## Working style

- One vertical slice per session. A slice ends with something runnable and committed.
- **Tune in the Lab, ship from the diff.** `npm run dev` → title → `lab`. The play tab runs a throwaway game beside sliders over `src/game/tuning.ts`; "copy diff as TS" prints exactly the fields that moved, for pasting into `DEFAULT_TUNING`. A value that has not been flown is not tuned.
- When a tuning constant changes, run the fixture tests and report which golden snapshots moved.
- Ask before adding a dependency.

## Out of scope for v1 — do not build these

Speech recognition or syllable verification · tone sandhi, multi-syllable words, sentences · native app builds · listening/perception drills.

Accounts and a backend are no longer on this list — anonymous auth and the leaderboard have shipped (see above). Still not built, and not to be built ahead of their phase: **public email accounts and cross-device sync** (Phase 2), **player-chosen display names** (Pro), **voice-clip storage** (Phase 3), **payments or billing of our own** (Lemon Squeezy is the merchant of record), and **server-enforced daily limits** — the limit stays local, because clearing storage mints a new anonymous identity anyway.

## Before accounts go live — Supabase settings, not code

These are dashboard settings that no amount of application code can substitute
for. None of them affects a player today (accounts are dev-gated, and nothing
a real player does sends an email), but shipping accounts without them means
signups that silently fail.

- **Custom SMTP is mandatory.** Supabase's built-in sender is a testing
  convenience: roughly two emails per hour, project-wide, on shared
  infrastructure Supabase explicitly documents as unfit for production. Hitting
  it looks like `email rate limit exceeded`. Connect a real provider under Auth
  → SMTP Settings (Resend/Postmark/Brevo/SES all have ample free tiers) and
  verify `flappytone.com` as the sending domain — DNS is on Cloudflare, so this
  is a few records, and it is most of what keeps the mail out of spam.
- **Redirect URLs must be allowlisted** under Auth → URL Configuration, for
  every origin that signs in — production, previews, and `http://localhost:3000/**`
  for local work. A redirect that isn't listed is silently replaced by the
  project's Site URL, which is `/` — the marketing entry, which ships no
  Supabase code, so the auth tokens land where nothing can read them. The
  confirmation still succeeds server-side, so this fails in the most confusing
  way available: the account is upgraded and the browser never notices.
- **Enable leaked-password protection** (Auth → Passwords) if password sign-in
  is ever used. Flagged by the security advisor; harmless while auth is
  magic-link only.
- **Re-check `get_advisors` after the first real signups**, since some lints
  only appear once tables hold data.

## Known limitations — do not try to "fix" these silently

- Humming beats the game. There is no syllable verification, though the tone classifier's mismatch-collision check (`toneMismatchCollisionEnabled`) catches some of the worst cases — see DECISIONS.md for its known gaps.
- Creaky voice breaks f0 tracking, and creak concentrates on Tone 3 — extended grace period, wider tolerance, "couldn't hear that" instead of a zero. Do not paper over it with interpolation that invents pitch data.
- T1 and T3's gate duration no longer matches their reference clip's length (tuned down from play) — the demo currently holds longer than the gate scores for those two tones. Known, not fixed; see DECISIONS.md before touching `gateDurationS`.
