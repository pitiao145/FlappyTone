# Design decisions

A log of *why*, for decisions whose reasoning would otherwise be lost. CLAUDE.md
states the rules that follow from these; this file is where you look when a
rule seems arbitrary and you want the incident or measurement behind it.
Newest first within each section. Don't add an entry for something that's
just "what the code does" — only for a decision that overturned an earlier
approach, or where the obvious-looking alternative was tried and failed.

## Backend, accounts & persistence

### Two tier gates, two meanings — and every word is free (15 Sep 2026)

`docs/SPECS/flappytone-SPEC-clip-catalog-r2.md` had the clip pipeline mark the
first `TIER_LIMITS.free.wordsPerTone` words of each tone `min_tier='free'` and
the remaining 25 `'pro'`, reusing one number for two different jobs. The clips
Worker enforces `min_tier` at `/clip/:id` with a 403, but `Game.tsx` built the
run from the UNFILTERED inventory — so a guest or free player flew words whose
clips were refused and heard the synthetic sweep for roughly 83% of cues. It
also contradicted a rule CLAUDE.md already stated: `pickWord`, feeding a scored
run, must never be limited by a tier's word count, because a guest's count is
zero.

Resolved by splitting the two gates rather than deleting either:

- **`min_tier` = game access.** "May this tier's run fly this word." It is what
  the Worker enforces at the edge, and now also what the run's word pool is
  filtered by — the two cannot disagree. Marking a future word `'pro'` gates it
  in both places at once, with no code change. That lever is the reason the
  per-tier architecture was kept.
- **`TIER_LIMITS[tier].wordsPerTone` = practice depth.** A COUNT, applied only
  to the visualiser's per-tone practice list (guest 0, free 5, pro all). It
  never reaches the game's pool.

**Every one of the 120 words is `min_tier='free'` today** (a data update, not a
migration), and `seed-words.ts` now defaults new words open. So observable
behaviour is identical to production: all 120 words for every tier, guests
included, and no cue that was recorded becomes synthetic.

**The run's pool reads the tier synchronously, from `tier.ts`'s store, not from
`useTier()`.** `tier` could not simply join the run-owning effect's dependency
array — a late answer would tear down and rebuild a live `Run` mid-flight,
which is exactly why the prefetch already lives in its own effect. `getTier()`
answers immediately and, after the first resolution in a session, correctly.
The one stale case is the very first run after a cold load, where the store
still holds its `"guest"` default; a small effect keyed on `tier` repairs it in
place through `run.setWords()` — the same seam a late inventory fetch uses,
which leaves already-spawned gates alone and tears nothing down. Since the
store's default is the narrowest tier, resolution only ever widens the pool.


**v1's "no accounts / no gameplay backend / no persistence" was a shipping boundary, and it is now deliberately lifted (5 Sep 2026).** It was the right call for v1 — staying client-only let the game ship and validate fast, and kept the privacy story simple (no server ever sees a voice). It was never a permanent architectural law. Real traction changed the calculus: a leaderboard is inherently shared state that cannot live in one browser, cross-device progress is the honest payoff behind "sign up to save," and the EarlyBird monetisation needs a notion of a paying account. So accounts + a backend are now the decided direction, not a non-goal.

**Chosen stack: Supabase (auth + Postgres) + Cloudflare R2 for object storage.** The deciding factor was auth — Cloudflare has no managed consumer-auth product, so an all-Cloudflare path meant hand-rolling auth on D1; Supabase Auth (incl. anonymous sign-in) covers it first-party, and Postgres fits the tone-analytics roadmap better than D1's SQLite. R2 wins object storage on zero egress and is already the repo's clip-storage plan. Full rationale + the schema/security/scaling design live in `docs/flappytone-ARCH-supabase.md`; the scoped first build in `docs/flappytone-SPEC-supabase-phase1.md`.

**How it's introduced, so it doesn't become slop:** identity via Supabase anonymous sign-in (an anonymous user upgrades in place to a permanent account on email signup — no guest-row migration); personal gameplay stats stay **local-first** and sync up only on signup; the only server write for anonymous users is the leaderboard score, through a server-authoritative Vercel function holding the service-role key (clients never write it). RLS on every table, written performance-correct from line one. Every schema change is a numbered migration. Region Tokyo (permanent). **Not yet shipped — the code is still client-only until each piece lands.** When a piece lands, update CLAUDE.md and PRD.md to match what is actually in the code, not what is planned.

### Tier enforcement, server run counting, and payments ship (8 Sep 2026)

Phases 3–4 of `docs/flappytone-SPEC-monetization-launch.md`: `TIER_LIMITS`
went from defined-but-unconsumed to the thing that actually gates a run, a
word list, and a leaderboard row, and `api/webhook-ls.ts` became the first
real money in the codebase. Several of these closed gaps that only showed up
once the wiring existed to expose them:

**The run cap's day boundary is the client's local date, server-bounded, not
UTC.** `api/run.ts` takes `day` from the client (`YYYY-MM-DD`, its own local
date) rather than computing it server-side, because the cap should reset on
the player's day, not UTC's — storing UTC would reset a Taiwan player's runs
at 8am local. A client-supplied date is also a client-supplied lie, so the
server bounds it to within `DAY_MS` of its own UTC clock: a device clock can
shift the boundary by the timezone difference, but it cannot claim a day a
week away to reset the counter early. This is the opposite tradeoff from
`api/score.ts`'s `week_id`, which is computed server-side only — a leaderboard
week is shared, contestable state where every player must agree on the
boundary; a personal daily cap is not.

**Guests are counted locally; accounts are counted server-side — not because
one is more trusted, but because only one has a durable identity.**
`daily_runs` (migration `0010`, tightened by `0011` to permanent accounts
only) exists specifically so a free/Pro account's cap can't be reset by
clearing `localStorage`. A guest's identity *is* whatever's in localStorage —
clearing it mints a new anonymous user, so a server-side guest row would cap
nothing a player couldn't already evade for free. `dailyLimit.ts` keeps
guests local-only rather than pretending a server count means something for
a tier that has no durable identity to hang it on.

**`api/score.ts` was writable by anonymous sessions until this pass.** It
verified the JWT but never checked `is_anonymous`, so anyone could open
devtools, mint an anonymous Supabase session, and POST a real row onto the
public leaderboard — `GameOver.tsx`'s `canJoin` gate was the only thing
standing between a guest and a write, and a client-side gate is not
enforcement. Closed with a `403` when `user.is_anonymous` (see
`f42c0d1`). Recorded as an incident, not a tidy-up: the leaderboard was
spoofable by anyone who opened devtools for the several days between Phase 1
shipping and this fix.

**`hasJoined()` tested for the existence of a `profiles` row, and that
stopped being a fair proxy the moment something other than `joinBoard()`
started creating one.** It was correct while `joinBoard()` was the only
writer. Once account signup started creating a `profiles` row too (the stats
sync, and the marketing-consent write), a brand-new account read as
"already joined" and its first scored run posted to the public board with no
opt-in — caught in play, by a real signup taking exactly this path. Fixed by
checking `leaderboard_scores` instead (`1b2339a`): no client can write that
table, so a row there is proof of an actual join, not an inference from a
side effect.

**Anonymous sign-in is now unreachable from any live path.** `joinBoard()`
was the only caller of `signInAnonymously()`, and joining the board no longer
signs a guest in anonymously first — a guest sees the board and their
would-be rank without an identity at all, and only an email account can post
a score (see `api/score.ts`'s `is_anonymous` check above). Existing anonymous
rows from before this change were deliberately left alone: a legacy anonymous
player who joined the board keeps their row and their scores, but a fresh
run under that identity no longer submits, since posting requires a
non-anonymous session now.

### A refunded player keeps their chosen name (8 Sep 2026)

Renaming is Pro, enforced by a `BEFORE UPDATE` trigger on `profiles` that
refuses a `display_name` change without an `entitlements` row. The trigger
gates the *change*, not the stored value, so a player who buys Pro, renames,
and then refunds keeps the name they chose. Their `has_access` goes back to
false and they cannot rename again.

Found while testing the first real Lemon Squeezy purchase end to end: the
board row still read "Pitiao" after the refund had revoked access.

Left as it is. Reverting a name on revoke means either storing the generated
one to restore or minting a new one, and then taking something visible away
from someone who paid, over a single $19 refund. This is a one-time purchase,
not a subscription with routine churn, so the case is rare and the graceful
failure is the right one. Documented rather than fixed, because the trigger
reads like it enforces "only Pro has a custom name" and it does not — it
enforces "only Pro can *set* one".

### Tiers and payment: accounts stop being the Pro tier (8 Sep 2026)

**Accounts stopped being the Pro tier.** `docs/flappytone-SPEC-monetization-launch.md`
Phase 2 splits identity from payment: a free email account is now the
guest→free gate (persistence, a real leaderboard row, ~10 runs/day, per-tone
visualiser practice), and Pro is a second, separate gate on top — depth,
content and customization (every word, full history, customization), not run
quantity. This resolves in the opposite direction from "Phase 2: accounts as
the Pro tier, built ahead of the product" below (6 Sep 2026) — that entry is
left as the historical record of what was decided then; this entry is what
changed two days later and why. The earlier framing made sense when accounts
were dev-gated with nothing downstream to protect; once a real signup funnel
and a run-cap were both on the table, gating persistence itself behind a $19
purchase was the wrong shape — a free account is what makes "sign up to save"
honest, and Pro needs to be about depth or it has nothing to sell once saving
your progress is free.

**Email confirmation is off, deliberately.** Every confirm-on-signup is an
inbox round-trip — leaving the game for the mail app and finding the way back
— which is exactly where phone signup funnels lose people, and it breaks
outright in a webview (same class of failure as the LINE mic bug). Cost
accepted: an unverified address can be squatted by someone else; recovery
rests on password reset, which does reach the real owner regardless. Custom
SMTP remains a launch gate either way, since reset mail still needs to
deliver.

**The rename gate is a trigger, not a policy.** `prof_update` has to stay open
to free accounts — the stats sync writes `best_score`/`total_runs`/`streak_*`
through that same policy — so gating renames on Pro can't be "no policy for
free accounts" the way `leaderboard_scores` gates writes entirely. RLS is
per-row, not per-column: a policy cannot say "these columns but not that
one," and `WITH CHECK` only sees the new row, so it can't even tell whether
`display_name` changed. A `BEFORE UPDATE` trigger sees both rows, so
`enforce_rename_entitlement()` (migration `0007`) lives there instead,
raising only when `display_name` changes without an `entitlements` row with
`has_access`. Verified against the live DB: rename blocked without Pro,
allowed with it, non-name updates unaffected.

**Two migrations were needed to take the trigger function off the API**
(`0008` then `0009`). `0007`'s function must be `SECURITY DEFINER` — it reads
`entitlements`, and the player it runs for can't see anyone's row but their
own — which means it's also exposed as a PostgREST RPC, since every function
in `public` is. `0008` revoked EXECUTE from `anon`/`authenticated` and the
advisor still flagged it: Postgres grants EXECUTE on a new function to PUBLIC
by default, and those two roles were reaching it through that grant, not one
of their own, so revoking from the named roles removed nothing (`proacl`
still read `=X/postgres`). `0009` revoked from PUBLIC, which is the grant
that actually mattered. Worth recording so `0009` doesn't look like a
redundant no-op migration later.

### Phase 1 shipped, and where it departs from its own spec (5 Sep 2026)

Ring 1 landed: `profiles` + `leaderboard_scores`, `api/score.ts`, anonymous
auth, a dev-only magic-link login. Four decisions overruled
`flappytone-SPEC-supabase-phase1.md` while building it, each for a reason worth
keeping:

- **Anonymous sign-in is lazy, not at app load.** The spec called for
  `signInAnonymously()` on boot. But nothing in Phase 1 needs an identity until
  a player joins the board, and signing in at load mints an `auth.users` row for
  every drive-by visitor — most of whom, at a ~6% return rate, never play twice.
  Sign-in now happens inside `joinBoard()`. Concurrent callers share one
  in-flight promise, or two components mounting at once would race and create
  two users.
- **The board is open to everyone, not a free/Pro split.** The spec gave free
  players the top 3 and locked the top 50 behind Pro. A board nobody can see
  cannot make anyone competitive, and this is the first week it has any data at
  all. Gating can come back once there is something worth gating.
- **Display names are generated, never typed.** The spec captured a name in the
  join modal. Choosing a name is now a Pro feature, so the modal shows a
  generated `BraveSparrow42` read-only. This also preserved an existing
  guarantee for free: `src/analytics/session.ts` promises it never sends
  anything the player typed, and there is now still no text input in the game.
- **`runHistory.ts` was left alone.** The spec asked to rename its per-tone
  fields to match the DB columns now, so the Phase 2 sync becomes a plain copy.
  The local shape is `{gates, accSum, unheard}` and the DB's is
  `{attempts, hits, sum_accuracy, best_accuracy}` — not a rename but a real
  mapping, since `hits` and `best_accuracy` aren't tracked locally at all.
  Renaming the persisted shape means bumping `toneflap.history.v1`, which wipes
  every existing player's history and best score to save writing a small
  function in Phase 2. Not worth it.

Three things the build discovered rather than decided, all now folded into
`0001` rather than left as a trail of corrections:

- **A raw-SQL migration must `GRANT` explicitly.** The dashboard's table editor
  does it invisibly; a migration does not. RLS policies narrow access, they do
  not grant it, so correct-looking policies still yield "permission denied for
  table" without the grants.
- **`leaderboard_scores.user_id` points at `profiles`, not `auth.users`.** With
  both tables referencing only `auth.users`, PostgREST saw no relationship
  between them and could not resolve "top scores with each player's name" in
  one query. The constraint also states the invariant the product relies on:
  joining the board is what creates the profile, so a score without one is a
  bug, and now fails in the database rather than rendering as a nameless row.
- **There is no `prof_update` policy.** One was written, and the security
  advisor immediately flagged it for letting an anonymous user edit their
  profile. It wasn't exploitable — it checked `auth.uid() = id` — but it was
  unused, since names can't be edited in Phase 1, and an unused write path is
  only surface. Phase 2 adds it back for permanent accounts, gated on
  `is_anonymous`.

**On squashing:** the three fixes above first landed as migrations 0002 and
0003, then were squashed back into a single `0001` and the remote schema
rebuilt from it. That is only defensible because nothing had shipped, no other
environment had the schema, and both tables held zero rows. Once this is
deployed the ledger is append-only: you fix a migration with another migration,
because someone else's database has already run the old one.

### Phase 2: accounts as the Pro tier, built ahead of the product (6 Sep 2026)

Accounts are **not a free-tier feature**. Signing up is what Pro *is*, so the
plumbing landed first and the features it unlocks come with the paid tier. All
of it — `tone_stats`, the profile aggregates, the sync, the account card — is
dev-gated and unreachable by a player.

That framing resolved a contradiction that had been sitting in the plan:
renaming was marked Pro while accounts were going to be free, which would have
shipped an account that could not do the one thing an account is for. With
accounts *being* Pro, `prof_update` returns, gated on the `is_anonymous` claim
— set by Supabase Auth, unwritable by a client, so it is safe to authorise on.

**Lifetime per-tone stats did not exist, and the docs assumed they did.** The
sync plan said "upload the player's per-tone aggregates at signup", but
`runHistory.ts` only ever kept per-tone data inside `lastRuns`, capped at five.
Uploading that would have made every new account's tone history five runs deep
forever. So `lifetimePerTone` now accumulates locally, added *additively* — the
`toneflap.history.v1` key is unchanged, a store saved before the field seeds it
from `lastRuns`, and nobody's `bestScore` is wiped to gain a field that can be
approximated. `scoring.ts` gained a per-tone `best` alongside it, following the
same unheard-exclusion rule `accSum` already used.

**`tone_stats` has no `hits` column**, though ARCH sketched one. Nothing in the
scoring code defines what a "hit" is, and inventing a metric to fill a column
is how a number nobody trusts gets onto a chart. It stores `unheard` instead —
a real measurement, and a meaningful one given the rule that an unclear signal
is never scored as wrong.

**Sync is merge-by-max, in both directions, and it is the same operation on
signup as on a second device.** These aggregates are monotonic records of
things the player did — a count of runs, a best score, a longest streak — so
taking the larger of each cannot lose an achievement, needs no clocks to agree
and needs no conflict UI. It over-counts only if one run is recorded on both
sides, which is far cheaper than deleting a week of practice. Because signup
and second-device sign-in are the same merge, there is no separate "claim your
guest data" path to get wrong. The server is written first and local updated
only on success, so a half-done sync leaves the device still holding
everything. `lastRuns` and `lastPlayedDate` stay local: one is a display cache
of *this* device, the other decides whether today continues the streak, and
neither has an honest cross-device answer.

## Clip pipeline

### A speaker, not a voice enum (16 Sep 2026)

The game needed a second recorded voice, and the cheap version of that is a
`voice` column on the clip: `'female' | 'male'`. It was rejected before it was
written, because one column would have carried three unrelated facts — who
recorded the take, what range it reads as to a player, and what accent they
speak. The moment a Beijing recording exists, a `voice` enum either grows a
second dimension or starts lying.

So a voice is a **row** (`speakers`) with attributes — `gender`, `accent`,
`is_default`, `active` — and a recording is a row in `word_clips`, keyed
`(word_id, speaker_id)`. A third speaker is an `INSERT`, not a migration. If
adding a voice ever needs a schema change, the shape is wrong.

**The player's setting stores an axis, never a speaker id.**
`CalibrationSettings.voice` is `{ gender }` and nothing else. A stored id
breaks the day the roster holds two male Taiwanese speakers — which one did
they mean? — and it breaks worse when that speaker goes inactive, since a
preference then names a voice that cannot be played. `resolveSpeaker` answers
the id fresh each session from whatever is active, and deliberately falls back
to the default when the axis matches more than one active speaker: picking
arbitrarily would make the voice a player hears depend on row order.

**Each voice flies its own measurements.** `word_clips` holds `polyline`,
`onset_s`, `clip_s` and `duration_s` per recording, not per word. That is not
thoroughness, it is the call-and-response contract: the corridor has to be
measured from the clip the player just heard, or the demo teaches one timing
and the gate scores another — the exact invariant PRD §6 exists to hold ("demo
length == gate length == polyline timeline"), which one shared polyline across
two voices would break for whichever voice did not record it. It is also
cheap, because polylines are in Chao space, normalised per speaker: the two
voices' contours are already directly comparable, so nothing downstream has to
learn about speakers to read them.

**`AVERAGED_TONE_SHAPE` and `toneClassifier.ts` stay voice-independent, on
purpose.** This will look like an oversight to whoever reads the roster work
next, and it is not. The averaged shape is a tone *shape* reference in Chao
space, which is already normalised per speaker — a man's Tone 2 and a woman's
Tone 2 are the same curve there, in different Hz. Turning it into a
per-speaker table would change the classifier's reading, and therefore
scoring, for every player who has ever played, to gain nothing a second voice
actually needs. The generator (`src/dev/make-tone-averages.ts`) says so in the
header it emits, so a regeneration cannot quietly drop the warning.

**The back-compat `/clip/:id` route was removed early**, rather than carried to
a later contract step as the plan had it. Back-compat exists for users running
the old thing; nobody is — live flappytone.com still serves the pre-migration
Blob build, so the single-segment route had no caller anywhere in the world.
Keeping it would have meant a route that guesses a speaker, which is precisely
the failure mode the speaker-scoped cache key exists to prevent.


### The booth arms the mic on purpose now, not by arriving (16 Sep 2026)

The recording booth used to go passcode → "Tap to start" → a live
microphone. The screen that told Jane to get ready *was* the screen that was
already recording, and there was no state in between where she could see what
was left, what was done, or decide to do nothing.

That cost real audio. The all-done screen's "Redo a word" button read
`goTo(recorded[0].id)` — no picker, just a jump to whatever sat first in the
recorded list, microphone live. During the live pipeline test Pierre tapped
it expecting a list, landed on `ma1b` (媽) without realising the booth was
listening, spoke, and replaced Jane's published take with his own voice. The
row flipped to `recorded`, which removed 媽 from the published catalog, from
the Worker's word map and from the calibration flight; running
`process-clips` would have shipped the wrong voice. Repaired by hand with an
`update words` and an R2 delete.

The fix is not a picker — a picker alone would have made that tap land on the
right word with the microphone just as live. Three rules, in
`src/record/boothArming.ts` so they are testable and cannot drift back into
render code:

- **Only the bulk pass arms itself.** Working down the pending list is the
  booth's whole reason to exist and must still cost zero taps, so "Start
  recording" arms immediately. Every other way of reaching a word — "Record
  this one" from the overview, a chip on the recording screen — lands
  **paused**. Re-recording is now two deliberate taps rather than none.
- **A `published` word asks first.** `published` means the clip is live in the
  game; `recorded` means uploaded but not yet through `process-clips`, so
  nothing downstream has consumed it and replacing it costs nothing. Only the
  destructive case gets a confirm.
- **A take that replaced a published clip stops the run.** Without this, a redo
  advances straight into the next word with the microphone still live — the
  same accident wearing a different hat.

Two structural consequences. `Overview.tsx` now owns the word fetch, the
session id and the `Uploader`, because "Back to list" must not rebuild the
upload queue and drop a take still in flight; `Recorder.tsx` is handed all of
it as props. And **pause does not tear down the frame sink** — it returns
early inside it and disarms the detector, because rebuilding the sink would
drop the pre-roll buffer and clip the first syllable after Resume. The sink's
install-once discipline predates this and is load-bearing for a different
reason (see its own comment); pause had to fit around it, not through it.

**Multi-voice is deliberately not built here.** The same 120 words need a male
recording, but `words.status` is one row per word and a second voice makes
that a one-to-many — a schema question with knock-ons into R2 key layout and
`process-clips`, not a UI one. All the booth carries today is
`BOOTH_VOICE` (one constant, rendered in the overview header) and a refusal to
cache the pending/recorded split locally, so a reshaped `GET /booth/words`
needs no reconciliation when that lands.


### Clip catalog: DB + R2 migration overrides the plan (Sep 2026)

`docs/SPECS/flappytone-SPEC-clip-catalog-r2.md` moved the word catalog from
three flat files (`wordlist.ts`, `glossary.ts`, `public/ref/manifest.json`)
to a Supabase `words` table, and clip audio from git-tracked
`public/ref/*.wav` to two private Cloudflare R2 buckets behind a Worker
(`workers/clips/`, `clips.flappytone.com`). Several of the spec's own
decisions were overridden while building it — recorded here because the spec
text itself still says the earlier thing:

**ES256, not HS256, for the Supabase session JWT.** Supabase signs with an
asymmetric P-256 key, not a shared HMAC secret — the project has no
`SUPABASE_JWT_SECRET` to give the Worker. `workers/clips/src/supabaseJwt.ts`
verifies against the project's own JWKS (`createRemoteJWKSet`, cached per
isolate) and pins `algorithms: ["ES256"]` explicitly, so a future weaker key
type can't silently widen what's accepted. This is a different trust model
than `api/score.ts`'s, which never needed to name an algorithm because it was
never written against a plan that assumed HS256.

**Guests get clips; the spec's "no JWT ⇒ no clips" was dropped.**
`POST /token` never hard-fails — a missing, malformed, expired, or anonymous
Supabase session all mint a `guest`-tier ticket rather than a 401, because a
guest playing with real reference audio is the product; only
`min_tier='pro'` words are actually gated at `GET /clip/:id`. Since nothing
gates the *common* case any more, bulk download is now stopped by
defence-in-depth rather than a single wall: both R2 buckets are private (no
`r2.dev` URL, no public/custom domain, no CORS policy — the Worker is the
only reader), there is no listing endpoint, `/clip/:id` serves one clip per
request, and tickets are short-lived (30 min) and IP-bound
(`verifyTicket` rejects a ticket replayed from a different IP outright, not
just "less trusted"). The last layer — a Cloudflare WAF rate-limit rule on
`/clip/*` and `/token` — is specified in `docs/SPECS/R2_SETUP.md` but **not
yet configured**; a live probe of 20 rapid `POST /token` from one IP returned
20×200, no 429. Until that rule exists the defence-in-depth list is one
layer short of what this section describes.

**`min_tier` gates game access; `TIER_LIMITS.wordsPerTone` gates visualiser
practice depth — conflating them was a real incident, not a design choice.**
The spec's per-tier word split (a fixed number of words per tone free, the
rest `min_tier='pro'`) was implemented exactly as written, by every agent
that touched it, and still broke the game: `CLAUDE.md` already stated "a
guest's zero-word visualiser cap must never starve their actual game," and
the spec's split put ~83% of the run's own word pool behind `pro` for every
non-Pro player, so the scored game played a synthetic sweep for most cues.
The bug was invisible to a task-vs-task or task-vs-plan pre-flight scan
because both sides were internally consistent with the spec — it was the
spec that contradicted an existing invariant, and nothing was checking specs
against `CLAUDE.md`. Fixed by splitting the two gates for good: every word's
`min_tier` is `'free'` today (the game's run pool and `/clip`'s gate both
read it, and stay in agreement by construction, not by convention);
`TIER_LIMITS[tier].wordsPerTone` still controls how many words per tone the
*visualiser* lets a tier practise, independent of `min_tier`. Re-tiering the
game later is a data-only `UPDATE`, not a rule change.

**The shared edge cache stores `public`; the browser is handed `private`.**
`GET /clip/:id`'s cache key carries only `id` and the catalog's own
`updated_at` (as `?v=`) — nothing about the caller — so the object behind it
is safe to share across every requester once the pro gate has already run.
Cloudflare's Cache API refuses to store a response marked `private`, so the
cached copy is written `public, max-age=604800, immutable` and rewritten to
`private` only on the way out to the browser, so no intermediary between the
edge and the player holds a per-player response.

**`contour` is excluded from `wordsFallback.json`**, along with `raw_key` and
`recorded_session` — overriding the original plan's Decision 7, which
assumed the landing tone charts read a fallback row's `contour`. They don't:
`ToneAverageCard`/`ContourSpark` read `polyline` via `toneAverages.ts`, and
nothing in `src/` reads `contour` off a fallback row at all. Shipping it
anyway was ~23kB gzip of dead weight on the landing page's critical path,
against the migration's own de-bloat goal. The DB column is untouched —
`process-clips` still writes real `contour` data to every row — this only
narrows what gets bundled into the client.

**`SEED_F0_CENTER = 168` is a pinned constant, not derived from the
catalog.** The pipeline's pitch-search reference used to be read off the
last published word's own measured `f0Center`; seeding from that (201.4Hz on
one run) instead of `make-clips`'s original literal 168 moved 90 of the 120
shipped polylines in their 3rd decimal place — small, but silent, and not
re-derivable after the fact without the exact prior seed. Now a named
constant in the side-effect-free `src/dev/clipPipeline.ts`, guarded by a
golden `cutClip` test over all four anchor takes (verified non-vacuous: the
201.4 seed fails all four).

**`manifest.test.ts`'s job moved to `src/data/catalogSeam.test.ts`, the
invariant did not.** `CLAUDE.md`'s pipeline rule #5 said the manifest test
is the seam between the cutter and the game — a renamed field there
degrades silently to an empty inventory, which looks exactly like the game
working. The manifest itself is on its way out (Task 13, not yet done — see
CLAUDE.md's "clip catalog" section), so the seam moved to the catalog row
shape: `catalogSeam.test.ts` pins `CATALOG_SELECT`/`wordsFromCatalog`/
`FALLBACK_COLUMNS` together and lives in `src/data/`, outside everything
Task 13 deletes, so the guard survives that task rather than needing to be
rewritten by it.

**Task 13 landed (Sep 2026).** `public/ref/*.wav` is untracked (kept on disk
locally, not deleted), `public/ref/manifest.json` is deleted, and so are
`api/upload.ts`, `api/auth.ts`, `api/_passcode.ts` + its test,
`src/dev/pull-recordings.ts`, `src/dev/make-clips.ts`, and
`src/dev/manifest.test.ts`. `@vercel/blob` is out of `package.json`.
`wordlist.ts`'s `WORDS` array and `words.ts`'s `loadWords`/`manifestToRows`
adapter are gone; `wordlist.test.ts` and `simplified.test.ts` were
retargeted at `wordsFallback.json` rows, and `run.test.ts`/`words.test.ts`
at `wordsFromCatalog` directly. `_passcode.ts`'s `json` helper — the one
piece of it the four surviving functions still needed — moved to
`api/_json.ts` rather than being deleted with the passcode gate itself.
`seed-words.ts`, `upload-clips.ts` and `migrate-raw.ts` are kept as frozen,
already-run historical scripts (their own headers say so now);
`seed-words.ts` no longer compiles (both its inputs are gone) and was
dropped from `tsconfig.node.json`'s `include`. CLAUDE.md, PRD.md and this
file were updated to match; TESTING.md needed no changes (its one
`public/ref/` reference is to files that are still present on disk, just
untracked).

**Clips are the whole take, not the voiced window (9 Aug 2026).** Cutting on
voicing dropped a median of 360ms of audible material, worst on Tone 3 where
creak reads as unvoiced — `yuan3` shipped as 453ms of a 1495ms recording.
`make-clips` now copies the recording verbatim (15ms fade at each end only).
The corridor is still measured over the voiced window alone — only the
*audio* moved, not the shape. See `src/dev/clipCut.ts`.

**Three clocks on one cue, and they must not be folded together:**

| manifest field | `run.ts` field | what it is |
|---|---|---|
| `clipS` | `durationMs` | the whole file — how long the world freezes and the mic stays shut |
| `onsetS` | `sweepDelayMs` | file start → tone start; the dot holds through it |
| `durationS` | `sweepMs` | the tone window; the gate and the corridor |

`clipS` is not `onsetS + durationS` — there's 106–832ms of audio after the
tone window ends. Reading the cue's length off the tone window let a cue play
into a live mic; `onsetS` is bounded by `clipS`, never by `durationS`, since
seven words have more lead-in than tone.

**Tone 3 corridors are measured, not synthetic (16 Aug 2026).** 22 of 30 raw
T3 takes used to measure as a falling third that never rises — not because
her speech lacked the rise, but because `clipCut.ts`'s voicing rescue and
run-merge gap were both too narrow for T3's creaky trough, discarding the
rise before it was ever measured. Fixing that let all 30 T3 words measure a
real dip-and-rise; `shapeForWord` no longer special-cases tone 3.

**Word ids are a registry, not a recomputation.** `src/record/wordlist.ts` is
merged into by the importer — an id, once minted, never moves, even if the
word is dropped from the list. With 是/事/市 all `shì`, recomputing ids from
list order turned `shi4b` from 事 into 试 the moment a word was inserted.
`id` is the blob key, the clip filename, and the manifest key — moving it
relabels audio that's already recorded.

## Gate duration vs. clip length — known, unresolved

`GATE_DURATION_S`/`tuning().gateDurationS` started as each clip's own length
(`durationS` from the manifest), so demo, corridor, and scorer ran on one
clock. **T1 and T3 no longer match their clips** — T1 is tuned to 0.55s
against an 880ms `ma1.wav`; T3 to 1.25s against a 1.33s clip. This was a
deliberate tuning move (T1 was the worst-scoring tone in play, because it
asked for a note longer than the flat part of one) but it breaks the
"demo length == gate length" invariant the clip pipeline was built to hold:
the demo now visibly holds longer than the gate scores, for those two tones.
Not fixed — see `tuning.ts`'s `gateDurationS` doc comment. Retune from the
Lab if this gets revisited; don't just restore the clip length without
re-checking T1's scores.

## Tone-mismatch collision / classifier boost (25–29 Aug 2026)

`src/game/toneClassifier.ts` is a standalone correlation-based tone
recognizer, originally built for the Visualiser tab. It's now also wired
into scoring two ways (`src/game/scoring.ts`):

- **`isDrasticToneMismatch`** — a confident classifier read of a drastically
  wrong tone (T1/T4 confused with anything, or a confident T2↔T3 mixup)
  forces a wall-style collision. Enabled off a played-back Lab session where
  it reliably caught correct-shape T2/T3 attempts flying into the wrong
  gate. Known, accepted gaps: a shape with correct timing shifted ~80ms late
  can still read as a confident wrong tone; a brief off-corridor wobble too
  short to be a real wall hit can read as a confident mismatch on its own.
  A softer sibling that *capped* (rather than collided) any mismatch existed
  earlier and was removed (26 Aug 2026) — it fired on far more borderline
  cases and was never separately validated in play.
- **`applyClassifierBoost`** — the mirror case: a confident (≥0.9) read of
  the *correct* tone can raise a gate's accuracy, since corridor tracking
  punishes timing/precision the classifier doesn't care about. Ships on by
  default — a false positive here only over-rewards, it doesn't cost a
  heart, unlike the mismatch-collision side.

## Calibration flow rewrites

Calibration has been redesigned twice; both changes are recorded in
`src/pitch/calibration.ts`'s own doc comments (`REACH_TO_TONE_SPACE_UP`/
`_DOWN`, `RANGE_UP_SEMITONES_MIN`) rather than here, because the code *is*
the current spec and a second prose copy would drift from it. Summary: the
original three-`mā` and later quiet/talk/high/low-sweep flows are both gone.
Since 29 Aug 2026, the board's upward half is anchored off an actual Tone 1
the player flies in the calibration tutorial, and the downward half off an
actual Tone 3 floor — not off a deliberate reach — so `reachToToneSpaceUp/Down`
are both 1 (no claw-back). Read `calibration.ts` directly before touching any
of this; the file explains its own history better than a summary would.

## Analytics: Blob → PostHog (Aug 2026)

Gameplay and traffic analytics used to flow through a Vercel Blob-backed
pipeline: one JSON file per session, pulled with `pull-analytics` and
summarized with `report-runs`. That hit Blob's Hobby-plan "advanced
operations" cap as player volume grew, because every flush was a `put()`.
Both scripts are gone; read funnel/per-tone/quit-histogram numbers as live
PostHog Insights instead.

**Accepted reliability gap:** PostHog's JS SDK doesn't persist a queue across
a tab close, force-quit, or offline period, unlike the old Blob pipeline's
localStorage-backed retry-on-load. Mitigated with a short batch window
(`request_queue_config.flush_interval_ms`, 250ms) plus `send_instantly` on
`run_end`, which shrinks the loss window to "the last event or two before a
crash." This is a deliberate trade for not maintaining that machinery, not
an oversight — don't rebuild the old durability queue on top of PostHog.

**PostHog project is shared across several of Pierre's apps**, not
FlappyTone-specific (project id 426310, "Default project"). Its
`anonymize_ips` setting is left as the other apps had it, not changed for
FlappyTone specifically — check the current value with `project-get` before
assuming either way, and raise any change with Pierre first since it's
project-wide.

## Landing/game split (Aug 2026)

The single-page app was split into three Vite entries (`/`, `/app`,
`/record`) so the marketing page stops shipping the game engine to visitors
who are just reading the pitch. `index.html` still carries a redirect for
home-screen installs saved before the split (`/` or `/?app=1`) — its own
comment says it's safe to delete once those installs have aged out; not yet.

## `?intent=visualiser` ignored first-time arrivals (fixed 2 Sep 2026)

A share link to the visualiser (`?intent=visualiser`, see CLAUDE.md's landing
split rule 2) silently dropped an uncalibrated visitor onto the Play home
screen instead: `GameApp.tsx`'s initial `screen` state only honoured the
intent when `settings` already existed (`initialIntent() === "visualiser" &&
settings`), reasoning that `<Visualiser>` can't render without a calibrated
grid. True, but the fix should have been "route to calibration first," not
"ignore the intent" — a share link's whole premise is a session that has
never opened the app before.

Compounding it: `pendingRef`, the ref meant to remember "go back to X once
calibration finishes," was write-only. `openVisualiser()` set it to
`"visualiser"` before sending an uncalibrated player into `calibrate`, but
nothing ever read it back — `onCalibrated` unconditionally routed into the
range-measuring tutorial flight, which unconditionally routed into the
guided teaching tutorial, which unconditionally landed on Play. So even the
*manual* path (tap Visualiser in the nav while uncalibrated → mic prompt →
calibrate → tutorial) never actually reached the Visualiser; the player had
to finish the whole onboarding funnel and tap Visualiser again themselves.

Fixed by: honouring the intent in `screen`'s initial state regardless of
`settings` (the tap-gate render branch already knew how to route an
uncalibrated arrival through `openVisualiser` → `calibrate`, it just never
got the chance); preserving `pendingRef` across `onCalibrated` specifically
for `"visualiser"` (every other intent still drops it, unchanged); and
reading it once the range-measuring flight ends (`onRunOver`'s calibratingRef
branch). `goHome()` now clears `pendingRef` on every path back to Play
(cancel, quit, mic error) so a stale `"visualiser"` can never leak into an
unrelated later onboarding and misroute it.

**Skips the guided teaching tutorial for this path (2 Sep 2026, same day,
follow-up).** The first fix above still routed a visualiser-bound player
through the full onboarding funnel — measuring flight *and* the guided
teaching tutorial ("fixed short sequence... text cue per gate", PRD §8) —
before landing them on the Visualiser, on the reasoning that "finish
calibration" meant finishing that whole funnel. It doesn't: the teaching
tutorial exists to teach the scored game, which a Visualiser-bound player
never asked for. `TutorialDone` gained a third variant,
`"calibrationVisualiser"` — same "Your grid is ready" moment as the ordinary
`"calibration"` variant, different body/button copy, and its `onDone`
(`finishCalibrationForVisualiser`) goes straight to `openVisualiser()`
instead of `startTutorialFromCalibration()`. `onRunOver` picks the variant by
checking `pendingRef.current === "visualiser"` right when the measuring
flight ends, before the guided tutorial would otherwise start. The
pre-calibration tap gate also grew a conditional line — "Before you can use
the visualiser, we need to personalize the grid to your voice." — shown only
when `!settings`, so a returning calibrated player still sees the plain "Tap
to start" and isn't told they need to do something they already did.

## Gate width / difficulty ramp simplification (16 Aug 2026)

`scrollSpeed` used to climb with the difficulty ramp. Fixed it instead,
because gate width in px is `scrollSpeed * shape.durationS` — that only
renders a word's own recorded timing accurately if `scrollSpeed` holds
still. Difficulty still climbs via tolerance tightening and rest-interval
shrinking. The player-selectable pace setting (relaxed/normal/fast) was
removed entirely in the same pass — once scrollSpeed stopped varying, pace's
only remaining effect was stretching the rest interval, not enough to
justify a menu control. `baseRestMs`/`restMsFloor` in `tuning.ts` were
doubled at removal to absorb the old "relaxed" default's ×2.0 multiplier.
