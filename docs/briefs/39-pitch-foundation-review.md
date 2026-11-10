---
status: ready
notion_task:
risk: needs-approval
---
# 39 Pitch foundation review: one correct way to hear a tone, for every voice and every room

## Goal
Close the question "is the shape the bird flies a true picture of the tone?" once and for all.

Pierre's words, in short: the shape the bird flies must accurately show the tone's pitch movement. All of Jane's recordings must be measured with that same correct method. The result must give a better game for everyone, whatever their voice (high, low, male, female, learner, native) and whatever the room (quiet, fan, café, TV, wind).

The core of the game today rests on decisions made at the very start, on very little audio. This brief asks you to:
1. **Phase A, analysis (do this first, report, then stop):** make your own analysis of how pitch detection, voicing, noise handling, calibration and target shapes work today, and how good they really are. Measure. Do not trust the earlier conclusions in this file without checking them.
2. **Phase B, proposal (after Pierre reads Phase A):** propose a better design, built and checked on the audio we already have. Include how to roll it out without breaking the game.

**No production code changes in this brief.** Throwaway scripts and new offline measurement tools under `src/dev/` are fine. Implementation is a later brief, after Pierre approves the proposal.

Pierre has no audio/DSP background. Explain every signal idea in plain words, unprompted. Write in Simplified Technical English (short sentences, active voice, one word for one meaning).

## Why this brief exists (the story so far)
- 9 Nov 2026, a Discord user (Foorgol): "calibration works good for the actual playing part, but not at all for the visualizer. Trying to get tone pairs right in the training mode is almost impossible because I would have to start with a much deeper voice than in the game." Device, browser, page and speech style are still unknown.
- Brief 37 investigated it. Report: `docs/briefs/reports/37-visualiser-pairs-deep-start.md` (branch `research/37-visualiser-pairs-deep-start`). Its findings are summarised below.
- During that work it became clear that the voice detector was tuned on about 8 short clips from August, and that the same detector also measured every target shape. Pierre wants this foundation reviewed properly, not patched again.

## Hard rules that still apply (from CLAUDE.md)
- 1: game loop outside React. 2: `AudioWorkletNode` only. 3: all pitch math in semitones. 4: every audio call behind a user gesture (test on a real iPhone).
- 5: `src/pitch/` has zero Web Audio dependencies; it takes `Float32Array` frames, returns pitch state, and is testable offline.
- 6: tunable values live in `src/game/tuning.ts`.
- 8: **an unclear signal is never scored wrong** ("couldn't hear that"). This is the most important product rule here.
- 9: hanzi is Traditional. 12: **player voice audio is never uploaded**; only derived numbers, and any new voice-derived data needs a privacy-policy update.
- Ask Pierre before adding a dependency (an offline-only dev tool is still a dependency). Never push or deploy.
- Any change to `src/pitch/` needs the fixture tests to pass **and** a before/after `npm run report` (state which of fit/lag/wiggle/voiced% moved, also the ones that got worse). Tone classifier work is checked with `npm run classifier-check`; "wall hits on a correct speaker" must not go up.
- Read first: `docs/TESTING.md`, `docs/PRD.md` (§5 pitch, §6 corridors), `docs/ARCHITECTURE.md` ("The clip catalog and its Worker", "Score and tone accuracy", "Tone pairs"), and search `docs/DECISIONS.md` before you call a tuned value wrong.

## How it works today (verified in brief 37; check it yourself)

### The listener (`src/pitch/`)
One `PitchTracker` is used everywhere: game, app Visualiser, public tone visualizer, calibration, and the offline clip pipeline.
- Frames of 2048 samples, a new frame every 1024 samples (about 23ms at 44.1kHz). Pitch is found with MPM (`src/pitch/mpm.ts`, McLeod's method; "clarity" = how regular, how voice-like the frame is), searched in the middle 1024 samples (`detectWindow`), in 70–400 Hz (`fMin`/`fMax`).
- A frame is voice (`isFrameVoiced`, `src/pitch/math.ts:131`) when:
  - loudness (RMS) ≥ `noiseFloor × 3`, **and** clarity ≥ 0.7; **or**
  - "glide rescue" for fast falls: clarity ≥ 0.4, loudness ≥ `noiseFloor × 10`, at most 3 frames since the last voiced frame, and the pitch moved at most 3 semitones per frame from the last one.
- Then: octave-error correction (`correctOctave`), a 5-frame median filter, a slew limit (3 st per frame), semitones → chao, and an exponential smoother (`alpha` 0.85). `minVoicedRun` (3 in live play) rejects blips.
- Semitones → chao (`semitonesToChao`, `math.ts:24`): chao = 3 + st / half × 2, clamped to [1, 5]. `half` is `rangeSemitones` above the centre and `rangeDownSemitones` below it.
- `DEFAULT_CONFIG` comments say most values were "chosen on fixtures/captures via `npm run report`".

### Calibration (per browser)
- `f0Center` = median voiced f0 of a talk step. Range halves come from a short calibration flight: `up` from T1 gates, `down` from T3 gates (`computeRangeHalvesFromExtremes`). Saved as `toneflap.settings.v3`, together with `noiseFloor` and `voiceRms` (the player's voice loudness).
- The public tone visualizer has its own 10-second quick calibration (`src/site/checker/quickCal.ts`): the centre is the geometric middle of a high "mā" and a low "mǎ". It uses the app's calibration instead when the same browser has one.

### Room noise, per session (`src/pitch/noiseMeter.ts`, `src/game/sessionNoise.ts`)
- Skip the first 200ms of audio, then take the median loudness of the next 400ms. That number is the session's `noiseFloor`. The gate is floor × 3.
- Clamped. The upper limit is `voiceRms × voiceCapFraction / 3`, so the gate is at most 40% of the player's calibrated voice loudness (`voiceCapFraction` 0.4, marked "NOT YET TUNED" in `tuning.ts`).
- **Game:** a new measurement each run, inside the warm-up hold (`warmupMinMs` 650ms), while the player waits.
- **App Visualiser:** measured in the first 600ms after its effect starts, with no hold. It is **measured again every time the canvas changes size**: the effect deps are `[settings, canvasW, canvasH]` (`src/ui/Visualiser.tsx:685`) and the size comes from a ResizeObserver. That happens right after mount, and again on rotation, on a window resize, or on a layout change.
- The measured value is **not logged anywhere**. PostHog has only the calibration floor.
- The browser's own processing is off on purpose: `echoCancellation`, `noiseSuppression` and `autoGainControl` are `false` (`src/audio/mic.ts:188-190`).

### Target shapes (offline, `src/dev/clipCut.ts`, `src/dev/clipCutMulti.ts`, `npm run process-clips`)
- Each catalog clip is run through the **same `PitchTracker`**, with the **default fixed `noiseFloor` 0.0033** (not measured per clip) and Jane's session reference (`measurePitchReference`: f0Center and range from that recording session; e.g. f0Center 181.3, range 6.5 in the catalog meta).
- Special cases already added because the listener lost parts of real speech: `TONE_3_RESCUE` (looser rescue for T3) and `TONE_3_MERGE_GAP_MS` 600 (see DECISIONS, 15 Aug 2026: 22 of 30 T3 targets had been measured as "dip, no rise" because the rise was dropped).
- **Single syllables are forced into a fixed template** (`templateContour`, `clipCut.ts:488`): T1 = 2 nodes, forced flat; T2 = start, interior min, end; T3 = start, min, mid-rise, end; T4 = start, interior max, end. The end "holds" at the furthest point in the tone's direction (the release is not modelled). So a single-syllable target is the textbook tone category, with timing and heights from Jane's take, not her raw contour.
- **Multi-syllable words** are not templated by tone role (sandhi). Syllables are found by voicing, with a 400ms merge gap (`MULTI_MERGE_GAP_MS`). When voicing gives too few runs, they are **split at a loudness dip** (2 of the 4 `fixtures/tonepairs` words need this).
- On screen, a corridor centre is a monotone cubic spline through the nodes (`corridorChaoAt`). The game corridor half-width is `toleranceChao` = 0.11 H → 0.73 chao (×1.3 if any syllable is T3), and it widens toward the end.

### Reading the player's tone
- **Score** (game): corridor error on the gate's clock. **Tone accuracy** (stats, Visualiser %): `toneAccuracyDetail` (`src/game/toneAccuracy.ts`): shape correlation 0.6, movement size 0.25, height 0.15, plus a T2/T3 cue for single T2/T3.
- **Tone classifier v2** (`src/game/toneClassifierV2.ts`): feature thresholds, three of them absolute heights: T1 tail ≥ chao 3, T4 peak ≥ 3.4, and a T3 "low" vote.
- **Pair read** in the Visualiser and the public page (`readContourSyllables`, `src/game/freeAttempts.ts:76`): split the attempt at silences > `mergeGapMs` (150ms), drop pieces < 160ms, classify each piece with the single-tone classifier. It **does not** use the loudness-dip split the clip pipeline uses.

## What brief 37 measured (re-check these)
1. **Same calibration, same mapping, same target heights** in the game, the app Visualiser and the public page (when it has the app's calibration). Pair targets do not start lower than single tones (catalog means: pairs 3+x start 2.64–2.96, single T3 3.30).
2. **The Visualiser draws only a thin dashed centre line**; the game draws a ±0.73 chao corridor. The same voice can be "inside" in the game and visibly off in the Visualiser.
3. **The pair read fails on Jane's own pairs** (`fixtures/contours/jane-*-sample.json`, 48 pairs per style): Standard 56% both tones right, 31% never split into two syllables (voiced consonants: 幫忙, 工人, 牛奶, 好玩, 可能, 感冒, 號碼, 對面, 唱歌…). **Spoken: 0% split.** Shifting the voice up or down does not fix it; lower makes it worse.
4. **A higher noise gate removes the low, quiet end of a contour first.** Jane's captures through the real tracker, gate as a share of her median voice loudness:
   - `jane_ma4` (T4): lowest point 1.22 at gate ≈0, 1.92 at 10%, **4.70 at 20% (the whole fall gone)**.
   - `jane_ma3_natural`: lowest point 1.00 → 1.36; voiced time 372 → 255ms.
   - `jane_ma3` (slow, loud textbook T3): unchanged.
   - Main reason: the glide rescue needs loudness ≥ floor × **10**, so a raised floor switches the rescue off first. Fast T4 falls depend on the rescue.
   - At the current cap (gate up to 40% of voice loudness) the fall is gone. So `voiceCapFraction` 0.4 is not safe.
5. Working hypothesis for Foorgol (not proven): a high room-noise value in the Visualiser (noise or speech during its unguarded measurement, or a re-measurement after a resize) cuts the low ends. Pairs are hit harder (quieter, lower second syllables, many low endings). The line stops before it gets low, so the player "has to go much deeper". Brief 37 lists four possible causes and how to tell them apart.

## The audio we already have (all local, gitignored, under `fixtures/`)
| Folder | Content | Used today by |
|---|---|---|
| `captures/` | About 8 Jane WAVs (`jane_ma1..4`, `ma3_natural`, `ma0_neutral`, `ba1`, `chang2`) + `Jane-*.m4a`. One iPhone, August, audible wind. `speakers.json` = `{"jane": 168}` | **All listener tuning**: `npm run report`, `npm run tune`, `src/pitch/fixtures.test.ts`, `voicing.test.ts`, `toneAccuracy.fixtures.test.ts`, `classifier-check` |
| `clips/jane/` | **The full catalog: 358 textbook + 472 natural** cut clips (166 MB): every tone, every pair, both styles | Clip pipeline only (`process-clips`, `verify-clips`). **No listener test uses them.** |
| `recordings/` | Jane's raw booth sessions (textbook and natural, Sep–Oct), incl. room tone between takes (118 MB) | Clip processing |
| `contours/` | Measured contours of ~100 catalog clips per style (no audio) | Classifier and tone accuracy tests |
| `tonepairs/` | 4 early pair takes (好玩, 美國, 小時, 一千), m4a + wav | A dev screen; `MULTI_MERGE_GAP_MS` was set on them |
| `anchors/` | ma1–4 | Reference cues |
| `tone1..4.wav`, `tones-all.wav` | Synthetic | Prove nothing about real voices |
| `analytics/` | Old analytics exports | Not audio |

What we do not have: learner voices (the old non-native `pierre_*` captures were deleted; see memory "cue classifier guard lost"), deep male voices, laptop/headset mics, real noisy rooms, and an independent pitch reference.

## The core problem to solve
- **Too little, too narrow data decided the listener.** Every voicing and smoothing value was chosen on ~8 single syllables, one female native speaker, one phone, one room.
- **The listener checks itself.** Target shapes were measured by the same listener. If it drops a part of speech, the target loses it too, and every test still passes. This happened once already (T3 rise). Tests on Jane's clips today prove consistency, not truth.
- **Noise is handled by loudness, measured once, at a moment that is not guaranteed quiet.** Voice-likeness (clarity) already rejects most steady noise, but the loudness gate and its 10× rescue multiplier decide a lot.
- **Voice range limits**: `fMin` 70 Hz may cut deep male voices and creaky T3 bottoms. Not measured.
- **Pair handling is split three ways**: clip pipeline (loudness-dip split), game (corridor, no split needed), Visualiser/public page (silence split only, single-tone classifier).

## Phase A: analysis (report, then stop)
Answer with measured numbers, file:line references and plain-language explanations.

1. **Build an honest test bench first** (offline, under `src/dev/`, not shipped):
   - **Native truth:** all of Jane's catalog clips, textbook and natural.
   - **An independent pitch reference** for those clips, so we can say "right" and not only "consistent". Options: a standard offline tool (e.g. Praat/Parselmouth, or a modern neural pitch tracker such as CREPE/PESTO/pYIN), run once offline to make reference contours saved as JSON. **This is a new dev dependency: ask Pierre first and say what it costs (install, licence, size).** If he says no, propose the best alternative (e.g. careful hand-checked subsets, agreement between two methods).
   - **Rooms:** mix real noise into the clean clips at set levels (signal-to-noise ratios from mild to bad). Use the room tone in `fixtures/recordings/` between takes, and ask Pierre for 10–20 s phone recordings of fan, café, street, TV and wind. Do not invent noise you cannot justify.
   - **Voices:** list what we lack (learners, low male voices, other mics) and give Pierre a short recording plan (who, what words, which devices, how long). Never use in-app player audio (hard rule 12). Volunteers recorded on purpose are fine.
   - Keep the old `captures/` as a regression set for known past bugs (wind before speech, the T4 fall).
2. **Measure today's listener on that bench**, for both the live settings and the clip-pipeline settings:
   - Pitch error against the reference (in semitones), voiced-frame recall and false voicing, per tone, per style, per noise level.
   - Where it fails: onsets, T4 falls, T3 creak, quiet endings, voiced consonants between syllables, octave errors.
   - The effect of the session noise gate and `voiceCapFraction`, including the 10× rescue rule.
   - The effect of `fMin`/`fMax` and the frame size on low voices (pitch-shift Jane's clips down as a stand-in, and say clearly that it is only a stand-in).
3. **Measure how wrong today's target shapes are**: compare each catalog polyline with the reference contour of the same clip. Report per tone and per combo, and the worst words. Say how much is caused by the listener, by the fixed noise floor, and by the T1–T4 templates.
4. **Check the reading side** with the same data: corridor scoring, tone accuracy, classifier v2, the pair read. Say which ones depend on absolute height or loudness, and how they behave per noise level.
5. **Re-check brief 37's claims** (numbers above) and say plainly where they are wrong.
6. **Answer Foorgol's case** as far as the data allows, and list what we still need from them.

Phase A output: `docs/briefs/reports/39-pitch-foundation-review.md` (Phase A section), the bench tools, and a short list of decisions Pierre must make. Then set `status: blocked` with the reason "waiting for Pierre's review of Phase A" and stop.

## Phase B: proposal (only after Pierre's go-ahead)
Propose one design (with at most one alternative) that:
- **Hears the shape correctly**: the line the bird flies follows the real pitch movement, including fast falls, creaky dips and quiet endings, within a stated error you measured.
- **Uses one method for everything**: the same listener (and the same settings, or a clearly stated and measured difference) measures Jane's clips and the players. All target shapes are re-measured with it.
- **Adapts to the room without the player's help**: no "be quiet now" moment needed; it follows changes during a session (e.g. a fan turning on); it isolates the voice as well as is practical. Compare at least: continuous noise tracking (e.g. minimum tracking in pauses), a gate relative to the player's own voice, band-limiting to the voice range, relying more on voice-likeness than on loudness, spectral noise reduction, and a small ML voice detector. For each: measured benefit on the bench, CPU cost on a phone, added delay (the bird must stay responsive), and risk.
- **Works for every voice**: low and high, male and female, learner and native. State how calibration changes, if it does.
- **Keeps hard rule 8**: unclear audio is "couldn't hear that", never wrong.
- **Makes target shapes honest**: decide, with evidence, whether the fixed T1–T4 templates should stay, change, or be replaced by the measured contour (and what that does to how the corridors look and feel).
- **Treats pairs as first-class**: one way to find syllables that the clip pipeline, the game and the Visualiser all share.

Include:
- A migration plan: which numbers in `tuning.ts` move; re-measuring the catalog (`process-clips`, `export-fallback`); golden snapshots that will move; how to compare old vs new in the Lab before shipping; how to roll back.
- What the player will notice, in plain words.
- What to log (derived numbers only, e.g. session noise level, share of frames heard) so the next user report can be checked, with the privacy-policy change it needs.
- A slice plan: small, separately shippable steps, smallest-risk first.

## Constraints
- Phase A changes no production behaviour: no edits to `src/pitch/`, `src/audio/`, `src/game/`, `src/ui/`, `tuning.ts`, the classifier, scoring or golden snapshots. New dev-only files under `src/dev/` are fine (keep them out of `dist/`, hard rule 7).
- Do not upload, publish or move any audio. Do not touch the R2 bucket, Supabase or the Worker.
- Ask before adding any dependency, even dev-only.
- Never push or deploy. Commit on a branch.

## Acceptance checks
- Phase A report exists, with: the bench described and reproducible (exact commands); numbers per tone, style and noise level; the target-shape error table; a plain-language summary Pierre can read in five minutes; decisions needed from Pierre.
- `npm run test` and `npm run typecheck` pass; `npm run build` + the dev-tooling grep in CLAUDE.md hard rule 7 prints nothing.

## Report back with
- The plain-language summary first: what is right today, what is wrong, how sure you are.
- The evidence (numbers, file:line).
- Decisions Pierre must make before Phase B (dependency, recordings, scope such as "TV in the room").

## Appendix: brief 37 measurement scripts
Saved in `docs/briefs/assets/39/` (throwaway; run from the repo root with `node --experimental-strip-types <file>`):
- `pairs.ts`: target start/mid/end/min/max per tone and combo, from `wordsFallback.json`.
- `shift.ts`: Jane's contour fixtures shifted ±1 chao through the pair read, tone accuracy and the corridor check.
- `combo.ts`: per-pair reads at shifts; argument `textbook` or `natural`.
- `noise.ts`: Jane's capture WAVs through `PitchTracker` at gates of 0–40% of her voice loudness.
