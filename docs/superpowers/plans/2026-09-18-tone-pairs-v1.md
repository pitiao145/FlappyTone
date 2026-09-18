# Tone pairs v1 — implementation plan

**Goal:** the scored game can fly multi-syllable words the same way it flies single syllables today: a gate whose corridor is the measured polyline of a native speaker's recording of that word. New `pairs` run mode (shuffle or drill one tone combo), plus an opt-in word mix in the classic game. Visualiser, neutral tone, classifier support and per-pair stats are **out of v1**.

**Read first:** `CLAUDE.md`, `docs/tonepairs/tone-pairs-implementation-review.md`, `docs/DECISIONS.md` sections "Clip pipeline" and "Gate duration vs. clip length". The technical reference (`mandarin_tone_pairs_technical_reference.md`) is theory: it feeds review flags only, never a corridor.

## Decisions already made (do not re-open)

| Topic | Decision |
|---|---|
| Schema | **No migration.** `words.tones smallint[]` and `words.syllables` exist since `0013`; `word_clips` is per recording and syllable-agnostic. `words.tone` stays "first non-neutral tone". |
| Where pairs live | New `RunMode` `"pairs"` (endless, scored, hearts/combo like `game`). Classic `game` gains a player setting `wordMix: "single" \| "multi" \| "all"`, default `"single"`. |
| Syllable count | Designed for N ≥ 2, not exactly 2 (TOCFL import will bring 3–4). "Pair" in UI copy, `multi` in code. |
| Corridor for multi | **Shape-agnostic**, never tone-role templates (sandhi: a 3+2 first syllable never reaches 5; a 3+3 first syllable rises). Per-syllable extremum-preserving simplification, concatenated. |
| Cutter | Branches on `syllables` from the `words` row. `syllables === 1` runs today's path unchanged (anchors golden must not move). |
| Classifier | `isDrasticToneMismatch` and `applyClassifierBoost` **off** for multi gates. |
| Tolerance | `max(TOLERANCE_FACTOR[t] for t in tones)`. T3 grace applies if any syllable is T3. |
| Per-tone stats / takeaway | Multi gates update score/hearts/combo but **skip** `perTone`/`lifetimePerTone`. Analytics carry `tones` so per-combo stats can come later without a schema bump. |
| Neutral tone | Excluded from every pool (`tones.includes(0)`), even though the importer accepts it. |
| Fixtures first | `fixtures/tonepairs/wav/{hao_wan,mei_guo,xiao_shi,yi_qian}.wav` (Jane, all 3+2) are the dev/test inventory. The game must be playable with pairs **before** any DB roundtrip, via a dev-only fixture inventory. |

## Sequence

Phases are ordered so the repo is safe at every commit. Phase 0 must land before any multi-syllable word is imported into the live `words` table.

---

### Phase 0 — Guard the classic game (ship first, tiny)

Today nothing filters on `syllables`; a published two-syllable word would enter the classic run as a "Tone 3" gate.

**Task 0.1 — pool helpers** (`src/game/words.ts`)
- Add `isSingle(w)`: `w.syllables === 1`. Add `isMulti(w)`: `w.syllables > 1 && !w.tones.includes(0)`.
- `wordsOfTone` filters `isSingle` in addition to `tone`. `availableTones` likewise.
- Add `multiWords(words)`, `toneComboKey(tones): string` (`"3-2"`), `availableToneCombos(words): Tone[][]` (sorted, deduped), `wordsOfCombo(words, tones)`, and `pickMultiWord(words, combo | null, recent, rand)` mirroring `pickWord`'s recent-window logic.
- Tests (`words.test.ts`): a fallback-shaped row with `syllables: 2` never comes out of `wordsOfTone`/`pickWord`; a row with a 0 tone never comes out of `multiWords`; combos derive from inventory.

**Task 0.2 — the other readers**
- `src/audio/prefetch.ts`: speculative tier uses the same helpers (no behaviour change for single modes; add the `pairs` case in Phase 3).
- `src/dev/export-fallback.ts`: no filter (multi rows should ship in the bundle), but `catalogSeam.test.ts` pins that `tones`/`syllables` are in `FALLBACK_COLUMNS`.
- `src/ui/ModeSelect.tsx` drill availability and `run.ts`'s `calibrationWordFor` already go through `words`/`pickWord`; confirm with a test that a mixed inventory still yields single-syllable calibration words.

Commit: `guard: classic pool is single-syllable only`.

---

### Phase 1 — Multi-syllable measurement in the pipeline (`src/dev/`)

**Task 1.1 — `multiSyllableSpan`** (new file `src/dev/clipCutMulti.ts`, pure)
- Port `wordSpan` from `generate-tonepair-polylines.ts`. Inputs: samples, sampleRate, f0Center, `syllables`. Output: `{ start, end, runs: Array<{start,end}> }` where `runs` are the voiced runs after merging gaps ≤ `MULTI_MERGE_GAP_MS` (start at 400) and trimming stray runs isolated by > 2× gap.
- If `runs.length < syllables`, still return the span but set `underSegmented: true` (review flag, not a failure: creak can fuse two syllables). If `runs.length > syllables`, keep the `syllables` longest and mark `overSegmented: true`.
- Onset: reuse `onsetStart` on the first run (export it from `clipCut.ts`).
- Test with the four fixture wavs: each yields 2 runs, span within ±30ms of the Lab's existing `tonePairPolylines.json` `durationMs` (regenerate that file first with `npm run tonepairs:generate` to have a fresh reference).

**Task 1.2 — `multiSyllablePolyline`** (same file)
- Input: the measured contour (from `measureContour`, `MEASURE_RANGE_SEMITONES`, on the cropped span) plus the run boundaries mapped to contour t.
- Per syllable: `[start, interior min, interior max (ordered by t), end]` where end = `holdValue` in the syllable's final direction of travel, dropping min/max nodes within `EXTREMUM_TRIM_FRAC` of the ends or with < 0.15 chao excursion. Cap at 4 nodes per syllable. First syllable's start is extended to t=0 as `templateContour` does.
- The gap between syllables gets **no node**; the spline bridges it. Do not invent pitch there.
- Output is a `Polyline` in the same format `shapeForWord` reads. Test: rendering each fixture through `corridorChaoAt` at 48 samples stays within tolerance of the raw resampled contour where voiced, and is monotone across the gap.

**Task 1.3 — `cutClip` branch** (`src/dev/clipCut.ts`)
- New optional `syllables` parameter (default 1). `syllables === 1` → existing code path, untouched. `> 1` → `multiSyllableSpan` + `multiSyllablePolyline`, returning the same `CutClip` shape (`durationS` = span, `onsetS`, `clipS`, `polyline`, `contour`).
- Verify: `git diff fixtures/anchors` empty; `clipPipeline.test.ts` golden unchanged; `takeDetector.test.ts` unchanged.

**Task 1.4 — `process-clips` and `clipReview`**
- `process-clips.ts`: select `words.syllables, words.tones` in the join, pass `syllables` to `cutClip`. Cohort for medians and review: `syllables === 1` → tone as today; multi → `toneComboKey(tones)`, same speaker.
- `clipReview.ts`: for multi clips, replace `shapeFlag(tone)` with a combo-aware `multiShapeFlag(tones, runs)` that applies the reference doc's sandhi expectations as **flags only**: 3+3 → first syllable should net-rise; 3+X → first syllable should net-fall and not recover; 4+4 → both fall. Add `underSegmented`/`overSegmented` flags. Still never blocks.
- `verify-clips.ts`: same `syllables` pass-through.
- `--dry-run` on Jane's 120 words must produce zero diff.

**Task 1.5 — dev fixture inventory** (`src/dev/fixtureWords.ts`, dev-only)
- A script `npm run tonepairs:fixtures` that runs the real `cutClip(…, syllables=2)` on the four wavs and writes `src/dev/fixtureWords.json`: an array of `Word`-shaped objects (`id`, `hanzi`, `pinyin`, `english`, `tone`, `tones`, `syllables`, `speakerId: "jane"`, `clipKey: "fixture:<file>"`, `durationS`, `onsetS`, `clipS`, `polyline`, `minTier: "free"`, `updatedAt`). Hanzi must be Traditional (好玩 美國 小時 以前 already are).
- Copy the four cropped wavs to `public/dev-fixtures/tonepairs/` (dev-only; add to `.gitignore` if size matters, or keep, they are small). `src/audio/reference.ts`'s loader gets a dev-only branch: a `clipKey` starting with `fixture:` fetches `/dev-fixtures/tonepairs/<file>` instead of the Worker. Gate behind `import.meta.env.DEV`; hard rule 7 check must still print nothing.
- Replace `generate-tonepair-polylines.ts`'s bespoke span code with a call into `clipCutMulti.ts` so there is one measurement.

Commit per task.

---

### Phase 2 — Multi-syllable gates in the engine (`src/game/`, no React)

**Task 2.1 — `Gate` carries `tones`** (`gates.ts`)
- `Gate` gets `tones: Tone[]` and `syllables: number`; `tone` stays (first tone) for every existing reader. `makeGate(word)` fills them; bare-tone gates get `[tone]`, 1.
- `toleranceChao(tones: Tone[], baseTolH)` uses `Math.max(...tones.map(t => TOLERANCE_FACTOR[t]))`. Keep a `toleranceChao(tone)` overload or update the 3 call sites; tests for both.
- `nextTone` untouched (single path only).

**Task 2.2 — run plumbing** (`run.ts`)
- `RunMode` += `"pairs"`. New `RunOptions`: `pairCombo?: Tone[] | null` (drill one combo; `null` = shuffle), `wordMix?: "single" | "multi" | "all"` (classic `game` only).
- `fillQueue`: for `pairs`, `pickMultiWord(words, pairCombo, spawnedWords, rand)`; if the pool is empty the run ends cleanly (`isOver`) rather than falling back to a bare tone. For `game` with `wordMix === "all"`, each gate rolls `rand() < tuning().multiGateChance` (new tuning field, default 0.5) to draw multi vs single; `"multi"` always multi. `spawnedTones` only receives single gates' tones so the repeat guard is unaffected.
- Grace: `graceMs` uses T3 grace if `gate.tones.includes(3)`.
- Utterance test: `heardUtterance` gets a `mergeGapMs` argument; multi gates pass `tuning().multiMergeGapMs` (new, default 400) so a two-syllable attempt with a pause is one utterance. `longestUtteranceMs` likewise.
- Settle: skip classifier block when `gate.syllables > 1`; `applyGate` gets `tones` and only updates `perTone` when `syllables === 1`. `gateLog`, `lastOutcome`, `hud.upcoming/activeGate` carry `tones`.
- Prefetch: `pairs` speculates over `wordsOfCombo` or `multiWords` capped by `prefetchWordsPerTone`; `game` with mix `all`/`multi` adds a multi slice.
- Tests (`run.test.ts`): a `pairs` run with the fixture inventory spawns only multi gates; classic default never spawns one; mix `all` spawns both; a multi gate's `perTone` is untouched after `applyGate`; the collision sustain timer still resets on unvoiced frames across a 300ms pause (bird drift during the pause must not cost a heart).

**Task 2.3 — scoring / history / analytics**
- `scoring.ts`: `applyGate(stats, tones, …)`; `toneBreakdown`/`takeaway` unchanged (they read `perTone`).
- `runHistory.ts`: no shape change. Multi gates count toward `gates`/`words` totals only.
- `analytics/session.ts`: `gate_end`-style event and `run_end` gain `tones: number[]` and `mode: "pairs"`. Closed union stays closed; `sanitizeGameProperties` test updated. `run_end` gains `wordMix`.

Commit per task.

---

### Phase 3 — UI and settings (`src/ui/`, `src/app/`)

**Task 3.1 — settings**: `settings.ts` gains `wordMix` (default `"single"`, validated). `Settings.tsx` shows a three-way choice under the voice section, hidden when the inventory has no multi words (`multiWords(words).length === 0`), same pattern as the speaker switch.

**Task 3.2 — ModeSelect**: a "Tone pairs" card with Shuffle plus a combo chip list from `availableToneCombos(tierWords)`; hidden when empty. Sets `pairComboRef` in `GameApp.tsx` the way `drillToneRef` works. `GameApp` `Screen` += `"pairs"`, `lastModeRef` union widened, daily-limit check treats `pairs` like `game`/`drill`.

**Task 3.3 — HUD** (`Game.tsx`): `displayTone` becomes `displayTones`; label renders full pinyin + hanzi and `T3·T2`, tone colours per syllable (`toneColors.ts`). Cue fallback: `playToneCue` needs a tone for the synthetic sweep; for a multi word with no clip, sweep the word's own polyline instead (`reference.ts` already has the polyline-sweep code path for single tones; generalise the input). Mismatch flash copy never appears for multi gates (classifier off).

**Task 3.4 — GameOver / Progress**: no per-pair section in v1. Ensure the takeaway line does not claim anything about pairs (it reads `perTone`, so it won't). Add one line "Pairs: N gates" only if trivially available from `gateLog`; otherwise skip.

**Task 3.5 — Lab**: the play tab gets a mode selector for `pairs` and reads the fixture inventory when `import.meta.env.DEV` and the catalog has no multi words, so tuning of `multiMergeGapMs`/`multiGateChance` can be flown. "copy diff as TS" already covers new tuning fields.

Commit per task. Playtest gate: Pierre flies the four fixture words in `pairs` mode from the Lab and the modes screen before Phase 4.

---

### Phase 4 — Content and the live pipeline

**Task 4.1 — import**: a TSV of the first pair batch through `npm run import-words` (already parses multi-syllable pinyin; `lists` column can tag `tonepairs-v1`). Confirm rows land with `syllables=2`, `tones` filled, `status='pending'`. Because Phase 0 shipped, these rows are invisible to the classic game until recorded and published, and even then only via the new mode/setting.

**Task 4.2 — booth**: `/record` needs no change for recording; check `boothWords.ts` and the Overview render pinyin/hanzi for two syllables sensibly and that `takeDetector` (booth) does not stop the take at the first syllable's end. If it does, pass `syllables` through `/booth/words` and widen its merge gap the same way as `multiSyllableSpan` — pin to `clipCutMulti` in a test like `takeDetector.test.ts` does today for single.

**Task 4.3 — process + export**: `npm run process-clips -- --speaker jane` on the recorded batch, review the flags, `npm run export-fallback`, `catalogSeam.test.ts` green, `npm run build` + hard-rule-7 grep.

**Task 4.4 — docs**: CLAUDE.md "Tone pairs" section rewritten from "exploration only" to current behaviour; PRD §3/§8/§12 updated; DECISIONS.md entry: "shape-agnostic corridor for multi-syllable words, because sandhi" and "classic pool is single-syllable by construction".

---

## Test matrix (must all be green before merge)

- `npm run test`, `npm run typecheck`, `npm run build` + the hard-rule-7 grep (prints nothing).
- `git diff fixtures/anchors` empty after Phase 1; `process-clips --speaker jane --all --dry-run` zero diff.
- `wordsFallback.json` diff after re-export is either empty (before content) or adds only the new rows.
- Fixture-driven tests never touch Supabase or the Worker.

## Agent brief (paste to the coding agent)

You are implementing `docs/superpowers/plans/2026-09-18-tone-pairs-v1.md` in the FlappyTone repo, branch `tone-pair-testing`. Rules:

1. Read `CLAUDE.md` fully first. Its hard rules and the "clip catalog" section bind you. `src/game/` has no React; `src/pitch/` has no Web Audio; tunables go in `tuning.ts`; dev-only code stays out of `dist/`.
2. Work phase by phase, task by task, one commit per task, tests first where a test is named. Do not start Phase 1 until Phase 0 is committed. Do not push.
3. The decisions table is settled. If implementing one turns out impossible, stop and report, do not substitute a design.
4. Develop and test against `fixtures/tonepairs/wav/*.wav` and the dev fixture inventory (Task 1.5). No database or Worker calls are needed until Phase 4, and Phase 4 is Pierre's call.
5. The single-syllable pipeline must not move: anchors golden, `clipPipeline.test.ts`, `takeDetector.test.ts`, `catalogSeam.test.ts`, and a `--dry-run` over Jane's 120 words all unchanged. Report the result of each check explicitly.
6. You cannot hear. Verify contours with `npm run analyze` style ASCII output and numeric sampling of `corridorChaoAt` across t, not by reading the formula.
7. All hanzi Traditional. Pinyin/hanzi for the four fixtures: 好玩 hǎowán, 美國 měiguó, 小時 xiǎoshí, 以前 yǐqián.
8. At the end of each phase, write a short status: what landed, which tests moved, what was left out and why.
