# SPEC — Speech style (textbook / natural)

**Status:** approved design, not built. Branch `feat/speech-style` off `main`.
**Date:** 7 Oct 2026.

## 1. What and why

Jane recorded every word twice: the slow, exaggerated **textbook** take (live
today) and a faster **natural** take (migration 0024, booth + `process-clips
--style`, already merged). This spec makes `natural` playable as a player
setting, **Speech style**. The setting picks which recording plays — and so
which corridor, gate width and cue timing a gate uses, since those are
measured from the clip. Nothing else forks: same words, same tiers, same
leaderboard and stats.

Data today (7 Oct 2026, Jane only, all `published`):

| | textbook | natural |
|---|---|---|
| 1 syllable | 214 | 214 |
| 2 syllables | 244 | 233 |
| 3+ syllables | 17 | 16 |

12 words have no natural take at all (never recorded — the raw bucket holds
exactly the 463 natural takes, all processed): 對不起 便宜 認識 晚上 一般 一邊
衣服 一共 一下 一直 早上 丈夫. Recording them is a separate content task;
nothing in this spec waits for it.

## 2. Decisions (Pierre, this session)

1. **Setting:** `speechStyle: "textbook" | "natural"`, default `textbook`,
   device-local (same store as proficiency, `src/game/settings.ts`), not
   synced. UI: Settings → **Proficiency** section, label **"Speech style"**.
2. **Tier:** free and Pro can change it. A guest sees the control
   **disabled** and always plays textbook. Effective style =
   `tier === "guest" ? "textbook" : stored setting` — a free/Pro player who
   signs out falls back to textbook without the stored value being touched.
   UX gating only (a guest ticket can technically fetch a natural clip; that
   is not a security boundary and need not be).
3. **Missing natural take:** in natural mode the word is **left out of the
   pool** (no textbook fallback inside a natural run). Words return
   automatically once recorded and published. Tier/`min_tier` gates are
   untouched — this is a third, independent filter, applied after them.
4. **Tone accuracy reference follows the gate's style.** A second set of
   averages is generated from natural clips; a natural gate is judged
   against `natural` averages (per tone and per pair combo).
5. **One pool for everything recorded about the player:** per-tone/per-combo
   stats, `player_tone_shapes`, `run_log`, leaderboard, run cap. No style
   column anywhere server-side.
6. **Pro tone-evolution chart** draws Jane's average for the player's
   *current* effective style.
7. **Classifier:** the §5.2 check (done, see there) showed textbook anchors
   cost correct natural speakers hearts, which breaks hard rule 8. Floor
   rule, whatever happens next: **a natural gate never loses a heart to the
   classifier until that is shown safe** — until then
   `isDrasticToneMismatch` and `applyClassifierBoost` are off for natural
   gates (the same treatment pair gates get). Style-aware anchors are
   measured offline first (§5.2 follow-up); Pierre chooses between them and
   the floor after the numbers.
8. **Always textbook, regardless of setting:** the calibration flight, the
   guided teaching tutorial that follows it. `learn` mode stays synthetic.
9. **Visualiser follows the effective style:** tapped word plays that
   style's clip, draws that clip's polyline, and its tone-accuracy readout
   uses that style's average.
10. **Fallback bundle (`wordsFallback.json`) stays textbook-only.** On a dead
    network a natural-mode player plays textbook (no clip audio plays
    anyway; the corridors are what remain).
11. **Analytics:** `run_end` (and `visualiser_session`) gain
    `speechStyle`. `setting_changed` gains key `speech_style`. Closed-union
    rule applies (CLAUDE.md analytics rule 1).

## 3. Design

### 3.1 Catalog (`src/data/`)

- `words.ts`'s live query drops its hard `style = 'textbook'` filter and
  fetches both styles for the default speaker. `flattenCatalogRows` groups
  rows per word: a `Word` keeps its existing top-level textbook fields
  (unchanged consumers) and gains `natural?: ClipMeasurements` — the same
  measurement fields (`polyline`, `durationS`, `onsetS`, `clipS`,
  `updatedAt`, …) from the natural row. The "exactly one clip" guard
  becomes "exactly one per style".
- One helper, `clipFor(word, style): ClipMeasurements | null`, is the only
  thing that picks between them (`src/game/words.ts`, no `src/data/`
  imports). Everything downstream (`shapeForWord`, cue timing in `run.ts`,
  prefetch, visualiser) asks it instead of reading the word's fields.
- `catalogSeam.test.ts` pins the new shape. `FALLBACK_COLUMNS` unchanged.
- Alternative rejected: two separate inventories (one per style). It
  duplicates the word list and makes "is this the same word" a join again.

### 3.2 Clip audio (Worker + `src/audio/`)

- `GET /clip/:speaker/:id?style=natural` (absent ⇒ `textbook`, invalid ⇒
  400). Style is part of the **edge cache key** (same reason as speaker:
  otherwise one style's audio is served under the other's URL). `?v=` is
  that style's row's `updated_at`. R2 key: `clips/{speaker}/natural/{id}.wav`
  (what `process-clips` already writes).
- `clipQueue`'s `loads` cache key includes style. `reference.ts` and
  `prefetch.ts` take the style from the run/visualiser, never read the
  setting themselves.
- Worker deploys **before** the client that sends `?style=` (an old Worker
  ignores the param and would serve textbook audio under a natural
  corridor).

### 3.3 Run (`src/game/run.ts`, `src/ui/Game.tsx`)

- `Run` gets `speechStyle` at construction (fixed for the run; a mid-run
  change applies next run). `Game.tsx` resolves it like the tier: from a
  synchronous read (`effectiveSpeechStyle(getTier())`), so the cold-load
  `"guest"` default gives textbook, and a later widening to free/Pro
  applies from the next run (no mid-run rebuild).
- `resolvedPool` gains the style filter (decision 3). Calibration and
  tutorial runs pass `"textbook"` explicitly.
- Each gate records its style (needed by tone accuracy and gate log).

### 3.4 Tone accuracy and averages

- `npm run make-tone-averages` emits `AVERAGED_TONE_SHAPE` and
  `AVERAGED_PAIR_SHAPE` keyed by style: `Record<SpeechStyle, …>`. Natural
  sources: the default speaker's published natural `word_clips`.
- `toneAccuracy(…, style)` picks the matching reference. The classifier
  reads `AVERAGED_TONE_SHAPE.textbook` explicitly (not implicitly) unless
  Pierre picks style-aware anchors after the §5.2 follow-up; either way
  decision 7's floor rule holds until he does.
- `fixtures/contours/jane-natural-sample.json` (a sample of natural
  `word_clips.contour`, SQL in its `source` field) backs a
  leave-one-out test mirroring the textbook one.

### 3.5 UI

- `Settings.tsx`, Proficiency section: a two-option choice (`Textbook` /
  `Natural`) labelled "Speech style", with one line of explanation
  ("Natural: everyday speed. Textbook: slow and clear."). Disabled for a
  guest with a sign-up hint, same pattern as other account-gated controls.
- Visualiser and `PlayerToneEvolution.tsx` read the effective style.

## 4. Out of scope

Recording the 12 missing natural words · a natural-specific calibration ·
splitting stats/leaderboard by style · a second speaker in natural ·
syncing the setting · tier-gating natural behind Pro.

## 5. Checks before shipping

1. **Shape preview (Pierre plays).** After §3.1–3.3 land, a dev-only
   override (`?style=natural`, behind `import.meta.env.DEV`, gated at the
   usage site — hard rule 7) lets Pierre fly natural runs in `npm run dev`
   and the Lab before any UI exists. Look for: gates too narrow to fly,
   corridors that move too fast at 200px/s, pairs whose pause collapses
   under `multiMergeGapMs`, utterances under `minUtteranceMs` (would read
   "couldn't hear that" on a correct speaker — hard rule 8).
2. **Classifier check — done 7 Oct 2026.** All 211 natural and 211
   textbook single-syllable clips of Jane, 185 scorable in each, both
   against the live textbook-anchored classifier (`classifier-check`;
   contours in scratchpad, not committed). The spec's earlier "200/211"
   baseline was over all 211 on 28 Sep; the like-for-like figure today is
   174/185.

   | | textbook right | textbook wall hits | natural right | natural wall hits |
   |---|---|---|---|---|
   | T1 (38) | 33 | 0 | 31 | 0 |
   | T2 (35) | 31 | 0 | 33 | 1 |
   | T3 (49) | 49 | 0 | 37 | 2 |
   | T4 (63) | 61 | 0 | 62 | 0 |
   | clean total | 174 | 0 | 163 | 3 |
   | all 8 variants | 1380 | 4 | 1193 | 37 |

   Natural T3s dip less, and the T2/T3 cue leans on the dip, so T3 drops
   from 100% to 76% (1 of 49 under a creak gap), and correct speech starts
   costing hearts. Hence decision 7's floor rule.

   **Follow-up — done 7 Oct 2026 (session 3). Decision: keep the floor.**
   `classifier-check --anchors textbook|natural` re-ran the same 185 clips
   per style, with every template (family correlation and T2/T3 cue)
   taken from the chosen style's averages:

   | | textbook clips, textbook anchors | natural clips, textbook anchors | natural clips, natural anchors |
   |---|---|---|---|
   | T1 / T2 / T3 / T4 right | 33 / 31 / 49 / 61 | 31 / 33 / 37 / 62 | 30 / 25 / 46 / 62 |
   | clean total | 174 | 163 | 163 |
   | clean wall hits | 0 | 3 | 3 |
   | all 8 variants (right / wall hits) | 1384 / 3 | 1188 / 38 | 1200 / 57 |

   Natural anchors recover T3 (37 → 46) but lose T2 (33 → 25), leave clean
   wall hits on correct speech at 3, and raise them under trouble (38 → 57;
   jitter, creak and a miscalibrated range worst). They also make the
   fallback T2 corridor flown 120ms early cost a heart. Neither condition
   (0 clean wall hits, T3 near textbook) is met, so **Pierre kept the
   floor rule as the shipped behaviour**: `isDrasticToneMismatch` and
   `applyClassifierBoost` stay off for natural gates (the classifier is not
   run on them at all), and the live classifier reads textbook averages
   only. Small drift from the first table (1380/4, 1193/37) is the live
   catalog moving between pulls; the clean rows match.

   Tone accuracy is separate and does follow the style, T2/T3 cue
   included: on natural clips the natural-anchored cue scores a right T3
   0.85 (0.77 textbook-anchored) and a right T2 0.86 (0.69), so it never
   costs a heart and does read the player better.

3. `npm run test`, `typecheck`, `build` + the dev-tooling grep (rule 7) +
   the landing `PitchTracker` grep. `npm run worker:test`.
4. `?intent=visualiser` on a cleared-localStorage session still works.

## 6. Docs to update when built

CLAUDE.md ("clip catalog": the game now reads `natural`; analytics fields),
PRD §8 Settings + §9, DECISIONS.md (why the pool drops instead of falling
back; why calibration is always textbook; classifier outcome).
