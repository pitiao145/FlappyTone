# Design — A voice roster: a second (male) recording of every word

**Date:** 2026-09-16
**Status:** designed, not built
**Supersedes nothing.** Extends `docs/SPECS/flappytone-SPEC-clip-catalog-r2.md`
(the DB + R2 migration) and `docs/SPECS/flappytone-SPEC-recording-booth-v2.md`
(the booth's overview/arming rework), both of which are landed.

## Why

Every reference clip in the game is Jane's voice — a female Taiwanese speaker
at roughly 200 Hz. A male player hears the target an octave above their own
range on every cue. Recording the same 120 words with a male speaker lets the
game cue in a range the player can actually match, which is the whole premise
of a pitch-controlled game.

The words, the tiers, the gating and the scoring do not change. What changes is
that a word stops having *one* recording.

## The decision that shapes everything else

**A voice is not just audio.** `words` currently carries `duration_s`,
`onset_s`, `clip_s` and `polyline` — all measured from Jane's recording.
`polyline` is the corridor the player flies (`shapeForWord`,
`src/game/gates.ts:82`) and the three clocks drive cue timing and gate length.
A male take of the same word has a different length, a different lead-in and
its own measured contour.

**Each voice flies its own measurements.** The corridor matches the clip the
player just heard, so call-and-response stays honest and PRD §6's "demo length
== gate length == polyline timeline" invariant survives having two voices.

This is cheaper than it looks: polylines are in Chao space, normalised against
each speaker's own measured `f0Center`, so the two voices' contours are already
comparable rather than offset by an octave. What differs is timing and speaking
style, which is exactly what should differ.

## Data model

Three tables where there was one. The key decision is that the child row is
keyed on a **speaker**, not on a `voice` enum — see "Why a speaker, not a
voice" below.

### `speakers` (new)

| column | type | notes |
|---|---|---|
| `id` | text PK | slug, e.g. `jane`, `mark`. Matches `^[a-z0-9]{1,16}$` — the same alphabet the Worker validates in a URL path segment. |
| `name` | text | display name, shown in the booth ("Recording as: Jane"). |
| `gender` | text | `female` \| `male`. The axis the player's switch selects on. |
| `accent` | text | `tw` today. The axis a later switch may select on. |
| `f0_seed` | numeric | the pipeline's pitch-search seed. Jane's is **exactly 168**. |
| `is_default` | boolean | exactly one true. The speaker used before a player has chosen, and the one `export-fallback` bundles. |
| `active` | boolean | false until that speaker's set is complete enough to expose. |
| `created_at` | timestamptz | |

Public select for `anon`/`authenticated`; **no client write policy at all**,
same enforcement shape as `words` and `leaderboard_scores`. Explicit `GRANT`s
in the migration — RLS narrows access, it does not grant it.

### `word_clips` (new)

Primary key `(word_id, speaker_id)`, both foreign keys. Holds everything that
is measured from a recording:

`status` (`pending`/`recorded`/`published`/`retired`), `clip_key`, `raw_key`,
`duration_s`, `onset_s`, `clip_s`, `polyline`, `contour`, `recorded_session`,
`recorded_at`, `created_at`, `updated_at`.

Public select, no client write policy. Indexes on `speaker_id`, on
`(speaker_id, status)`, and on `word_id` — **both foreign keys need their own
index**; an unindexed FK is the standard `get_advisors` performance lint and
this table adds two.

`updated_at` maintained by the same `words_touch_updated_at` trigger pattern as
`words` (migration `0014` fixed that function's `search_path`; the new trigger
must be written the same way, not copied from `0013`'s original).

### `words` (changed)

Keeps what is true of the word regardless of who says it: `id`, `hanzi`,
`pinyin`, `english`, `tone`, `tones`, `syllables`, `position`, `min_tier`,
`meta`, `created_at`, `updated_at`.

Loses the nine measurement columns to `word_clips` — but **not in the same
migration that creates them** (see Rollout).

**`min_tier` stays on `words`, deliberately.** It is game access, and it is
identical for both voices. Keeping it word-level preserves the rule that
`min_tier` (game access) and `TIER_LIMITS.wordsPerTone` (visualiser practice
depth) are two different gates — the conflation of which is a logged incident
in DECISIONS.md.

### Why a speaker, not a voice

A column called `voice` holding `'jane' | 'male'` conflates three facts: who
recorded it, what gender the voice reads as, and what accent they speak.
Multiple accents per word are a stated future direction, and they would force
either an overloaded slug (`'m-tw'`, `'m-cn'`) or a second column to reconcile.

A speaker row carries attributes instead. `jane` is
`{gender: female, accent: tw}`; the male speaker is `{gender: male, accent: tw}`;
a Beijing speaker later is another row with no schema change.

**The player's setting stores an axis, never a speaker id** — `{gender: 'male'}`
today, `{gender: 'male', accent: 'tw'}` later — and the app resolves that to a
speaker at load. A stored speaker id would break the moment the roster has two
male Taiwanese speakers.

Three unrelated problems collapse into this same table, which is the strongest
argument for it:

1. **`SEED_F0_CENTER = 168`** is pinned in `src/dev/clipPipeline.ts` and
   guarded by a golden `cutClip` test. It is a pitch-search seed; 168 Hz
   against a ~110 Hz male speaker risks octave errors and therefore silently
   wrong polylines. It becomes `speakers.f0_seed`.
2. **`clipReview`'s tone-median thresholds** are derived from Jane's catalog.
   Observed live during the pipeline test: a male take flagged *"276ms against
   a tone-2 median of 1050ms"* and *"f0Center is probably wrong for this
   speaker"* — both correct, against the wrong speaker. Medians become
   per-speaker.
3. **The booth's passcode→speaker map** is a lookup into this roster.

**What the schema cannot solve:** each speaker is 120 more recordings, and the
partial-inventory rule below means a speaker needs a near-complete set before
they can be exposed. The model scales to N speakers; the effort is linear in N
and the bottleneck is people.

## Partial inventory

**A run only ever flies words the selected speaker has published.** The word
pool is filtered by the presence of a published `word_clips` row for that
speaker. A player never hears the other voice mid-run, and never flies a
corridor measured from a voice they did not hear.

Consequence: a speaker is not exposable until their set is near-complete.
`speakers.active` is the switch, flipped by hand as a data change.

## The read path

### Worker

**`GET /clip/:speaker/:id?v=<word_clips.updated_at>`** — the speaker is a path
segment, **not** a query parameter.

This is the highest-risk item in the change. The edge cache key is built from
the URL; if the speaker is not in it, a male player's response is cached under
a key a female player also computes, and the wrong voice is served to everyone
with no error anywhere. A path segment cannot be silently dropped by a
refactor. A query parameter can.

Validation order is unchanged and fail-closed: ticket → speaker regex
(`^[a-z0-9]{1,16}$`) → id regex → inventory lookup. The ticket check stays
first so an unauthenticated probe gets 401, not 400 — the property that the
`decodeURIComponent` 500 incident established.

- **The play ticket does not carry the speaker.** Voice is not an entitlement;
  `min_tier` on `words` still gates both voices identically. Putting the
  speaker in the JWT would invalidate a ticket on every switch for no gain.
- **`?v=` is `word_clips.updated_at`**, not `words.updated_at`. Re-recording a
  clip must bust its own cache and nothing else's.
- **The per-isolate word map** becomes keyed `"speaker:id"`, built from
  `word_clips` joined to `words`, filtered `word_clips.status = 'published'`,
  with `min_tier` read from `words`. Unchanged otherwise: 5-minute TTL, 503 on
  a failed refresh rather than serving an empty map.
- **`GET /clip/:id` keeps working for exactly one release**, routed to the
  default speaker. Assets are content-hashed, so a player mid-session on the
  previous bundle would otherwise lose every clip at once. Removed in the
  contract step.

### App

- **`CATALOG_SELECT` becomes a filtered embed** — `words` with
  `word_clips!inner(...)` constrained to the resolved speaker.
  `src/data/catalogSeam.test.ts` extends to pin the new shape; it exists
  because a renamed column degrades to an empty inventory that looks exactly
  like the game working.
- **Two cache keys must gain the speaker**, or they serve the wrong voice with
  no error: the localStorage catalog cache (`toneflap.catalog.v1` →
  `toneflap.catalog.v2.{speaker}`, bumped because the shape changed) and
  `loadClip`'s in-memory `loads` map (`${speaker}:${id}`).
- **Switching voice mid-session reuses the `run.setWords()` seam** that the
  late-tier answer already uses — it leaves spawned gates alone and tears
  nothing down. Same problem, same solution; do not invent a second one.
- **The preference is added to `settings.ts` additively. Do not bump the
  settings key** — that wipes every player's calibration to gain one field, the
  trade `runHistory.ts` already refused for the same reason.
- **Prefetch** (`src/audio/prefetch.ts`) is unchanged in shape; it plans over
  the already-filtered pool, so it inherits the speaker without knowing about
  it.

### Choosing a voice

**Auto-default from calibration, overridable in Settings, free for every tier.**

`computeF0Center(f0s)` resolves at the end of the calibration `talk` step
(`src/ui/Calibration.tsx:350`), one screen *before* any gate flies — and the
`done` screen already warms the four calibration clips via `prefetchPool`. So
the speaker is resolved at the end of `talk`, and the existing warm effect
prefetches that speaker's clips. The screen already exists and already
prefetches; it gains a resolved speaker id and nothing structural.

- The threshold is a tunable, `tuning().voiceMatchF0Hz` (~160 Hz), per hard
  rule 6 — not a bare module constant.
- **An explicit Settings choice always wins and is never re-guessed**,
  including on re-calibration. Auto-pick applies only when no preference is
  stored.
- **Calibration falls back to the default speaker** if the picked one lacks any
  of the four `CALIBRATION_WORD_IDS` published. Same partial-inventory rule,
  applied one screen earlier.
- The switch does not render while only one speaker is `active`.
- **Resolution always yields a speaker.** A stored preference is matched
  against `active` speakers on the chosen axis; no match (nobody active with
  that gender, a speaker deactivated since the preference was stored, more than
  one match) resolves to `is_default`. The preference is kept, not rewritten —
  a speaker coming back online must restore the player's choice rather than
  having silently overwritten it.

Worth stating in the UI copy and in code comments: **this matches pitch range,
not gender.** A low-voiced woman may be matched to the male recordings, and
that is the correct outcome for the game. The label is gender only because that
is what reads to a player; the switch exists for everyone the guess suits
badly.

### What deliberately does not change

**`AVERAGED_TONE_SHAPE` stays derived from the default speaker, and
`toneClassifier.ts` stays voice-independent.** It feeds scoring — drastic
mismatch collisions and the accuracy boost. It is a tone *shape* reference in
Chao space, already normalised against each speaker's own `f0Center`, so it is
voice-independent by construction. This must be documented in the file itself,
because it looks like an oversight and someone will otherwise "fix" it into a
per-speaker table and change scoring for every player.

**`src/data/wordsFallback.json` bundles the default speaker only.** It is the
dead-network degradation path, and offline means no clip audio regardless — a
male-voice player offline flies Jane's corridors with a synthetic sweep, the
same as any offline player today. Bundling both would add roughly 10 kB gzip to
the landing chunk (`Landing.tsx` imports it directly; it lands in
`appLink-*.js`) for a case where no audio plays.

**Analytics:** add `voice` to `run_end`, one property through
`src/analytics/session.ts`'s closed allowlist. It is the only way to answer
whether the male voice retains better, which is the premise of the feature.

## The write path

### Booth isolation

The guarantee rests on one rule: **the speaker is derived from the passcode,
server-side, and no booth route accepts a speaker from the client.** There is
no `?speaker=` parameter to get wrong, no picker to mis-tap, no field a stale
tab could carry over. A recorder cannot express "write as someone else" —
the vocabulary does not exist.

- **`checkPasscode` becomes `resolveSpeaker`**, returning
  `{ speaker: string } | Response`. A discriminated union, so a route that
  forgets the denial branch does not compile. Today's `Response | null` could
  be proceeded past on an unchecked `null`; with a speaker to carry, that would
  be a silent cross-write rather than a silent auth bypass.
- Keep the existing constant-time `equals`, and run it against **every** entry
  in the map, returning the match at the end. No early exit, so response time
  reveals neither how many codes exist nor which prefix matched.
- **Storage: one JSON secret**, `RECORD_PASSCODES` =
  `{"<code>": "jane", "<code>": "mark"}`. Adding a speaker is a secret update,
  not a code change; rotating one person's code leaves the other's value
  untouched. Unset or unparseable → 503 for everyone, the same fail-closed
  posture as today. Deliberately **not** a hash on `speakers`: a booth passcode
  is low-entropy so a stored hash buys little, and it would put auth material
  in a table and make revocation wait on a cache TTL.
- **Reads are scoped, not filtered client-side.** `/booth/words` returns only
  that speaker's `word_clips` split. Not because another speaker's progress is
  secret, but because a list that is not yours is a list you can act on by
  mistake.
- **Writes are structurally confined to one prefix.** `/raw` builds
  `raw/${speaker}/${session}/${id}.wav` with `speaker` from the passcode and
  the two client segments already bounded to `[a-z0-9-]` and `[a-z0-9]` —
  neither can contain `/` or `.`, so there is no traversal out of the prefix
  even with a hostile client. The DB write is an upsert with an explicit
  `(word_id, speaker_id)` conflict target, never an update keyed on `word_id`
  alone.
- **"Recording as: Jane" on the booth overview**, above the word list, before
  anything is armed. Server-derived, so it is the truth rather than a
  restatement of what the client asked for. Someone handed the wrong code sees
  it on the first screen rather than after a session's work.

This also retires a class of accident rather than guarding it: a male session
physically cannot touch Jane's row, which is what the 16 Sep 2026 `ma1b`
overwrite did.

**Known gap, inherited not introduced:** the booth passcode has no rate limit.
This is the same pending Cloudflare WAF item as `/clip/*` and `/token`; the
rule should cover `/auth` and `/booth/*` too, and tighter, since there are two
legitimate users in the world.

### Booth UI

Almost nothing. `BOOTH_VOICE` stops being a constant in
`src/record/boothWords.ts` and becomes the speaker name returned by
`/booth/words`. That is what putting it there was for.

### Pipeline

`process-clips` takes `--speaker` (or derives it from the raw key), writes
`clips/{speaker}/{id}.wav`, and upserts `word_clips`.

- **`SEED_F0_CENTER` → `speakers.f0_seed`.** Jane's stays exactly 168 so the
  golden `cutClip` test over her four anchors does not move a decimal.
- **`clipReview` thresholds** computed over that speaker's own published rows.
- `export-fallback` exports the default speaker only.
- `verify-clips` and `import-words` gain the speaker dimension. `import-words`
  still defaults `min_tier='free'` on `words`, unchanged — `min_tier` did not
  move, and the first-N-per-tone rule must not be reintroduced.

**R2 needs no migration.** `clip_key` and `raw_key` are explicit columns, not
conventions, so Jane's existing objects keep their current keys and only new
writes use the `{speaker}/` layout. No bulk move, no window where a key is
wrong.

**New invariant, pinned by a test:** a `word_clips` row may be `published` only
if its `clip_key` resolves and its three clocks agree (`onset_s < clip_s`,
`clip_s >= onset_s + duration_s`). `catalogSeam.test.ts` asserts this across
the fallback rows today; it becomes per-speaker.

## Rollout

**Branch: merge `audio-migration` into `main` first, then cut `voice-roster`
off `main`.** `audio-migration` is complete and reviewed but still has
outstanding human steps (production verification, the Cloudflare WAF rules, the
Vercel env cleanup). Stacking a schema change on it means the finished
migration can no longer ship independently of the voice work.

Expand/contract, seven steps, each deployable alone:

1. **Migration `0015`** — create `speakers` + `word_clips`, seed `jane`,
   backfill every `words` row's measurements into a `jane` `word_clips` row,
   preserving `clip_key`/`raw_key` verbatim. Old columns stay. Nothing reads
   the new tables. Reversible by dropping two tables.
2. **Worker** — read from `word_clips`, add `/clip/:speaker/:id`, keep
   `/clip/:id` on the default speaker.
3. **App** — new catalog shape, per-speaker cache keys, settings field,
   Settings toggle, calibration auto-pick. **With only Jane active this is a
   no-op release for players**: the switch has nothing to switch to and never
   renders. The entire app change ships and is verified in production with zero
   visible difference.
4. **Booth + pipeline** — passcode map, per-speaker `/raw`,
   `process-clips --speaker`, per-speaker `f0_seed` and review thresholds.
5. **Record the male set.** Human time, not engineering time.
6. **Activate** — `speakers.active = true`. One row. The switch appears.
7. **Contract** — drop the old measurement columns from `words`, remove the
   `/clip/:id` back-compat route.

## Verification

**The highest-value regression guard:** after step 1 and again after step 4,
`npm run export-fallback` must produce a **byte-identical**
`src/data/wordsFallback.json`. Jane's 120 polylines moving by a decimal is
precisely the failure DECISIONS.md records from the `SEED_F0_CENTER` incident,
and one `git diff` proves the refactor was lossless. The golden `cutClip` test
over her four anchors backs it up and must stay non-vacuous — feeding a male
seed must still fail it.

Tests that earn their place:

- **Cache poisoning** — two speakers requesting the same word id must not share
  a Worker cache entry. This is the bug that ships wrong audio to everyone at
  once, and it is invisible to every other test.
- **Booth isolation** — code A cannot read or write speaker B's rows; no booth
  route accepts a speaker from the client.
- **The two silent cache keys** — localStorage catalog and `loadClip`'s `loads`
  map. Both fail as "wrong voice, no error".
- **Migration verification** — 120 `word_clips` rows for `jane`, every
  `clip_key` identical to the old column, three clocks hold per speaker.
- **`get_advisors`** (security *and* performance) after `0015`, before calling
  the schema change done.
- **`catalogSeam.test.ts`** extended per-speaker.
- **Calibration** — auto-pick threshold, explicit override never re-guessed,
  fallback when the picked speaker lacks a calibration word.

Manual, on a real device: the switch, a mid-session switch, offline fallback,
and a booth session under each passcode confirming neither can see the other's
list.

## Out of scope

A third voice or a second accent (the model supports it; nothing is built for
it). Per-speaker tiering — `min_tier` stays word-level. Any change to scoring,
the tone classifier, or `TIER_LIMITS`. Retiring Jane's clips.
