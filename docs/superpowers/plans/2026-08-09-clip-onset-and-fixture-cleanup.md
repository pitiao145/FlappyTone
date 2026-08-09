# Clip Onset Restoration + Fixture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the consonant onset to the 52 reference clips that currently start too late (`chang2` sounds like "hang"), and reduce the fixture/clip inventory to Jane's recordings only.

**Architecture:** The cutter currently finds the syllable by looking for *voicing* (vocal-fold vibration), so it starts the clip at the vowel and throws away everything before it. Aspirated and fricative onsets — the breathy part of ch/c/q/sh/s/f/h/j/x — carry no voicing, so they are discarded. The fix separates two windows that are currently one: the **tone window** (unchanged — what the corridor is measured over and what `durationS` means) and the **clip window** (extended backwards to include the consonant). One new manifest field, `onsetS`, records the gap between them. Because the tone window does not move, every existing `polyline`, `contour` and `durationS` stays byte-identical — the manifest diff is purely additive and no tuning value is invalidated.

**Tech Stack:** TypeScript, Node (`--experimental-strip-types`) for the cutter, Vitest, React + Canvas 2D for the game.

## Global Constraints

- **`src/pitch/` must have zero Web Audio dependencies.** No `AudioContext` import may appear there.
- **Tunable constants live in `src/game/tuning.ts`, not as bare module constants** — for anything the Lab should move during a session. Cutter-side measurement constants (`PAD_MS`, `MAX_ONSET_MS`) are *not* Lab knobs and stay as module constants in `src/dev/clipCut.ts`, alongside the existing `PAD_MS`/`FADE_MS`/`MERGE_GAP_MS`.
- **`src/dev/clipCut.ts` is the only cutter.** Both `make-ref-clips` and `make-clips` call it. After touching it, regenerate and check `git diff fixtures/anchors` is empty.
- **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** After any change touching `src/dev/` or `src/main.tsx`, run the boundary check in "Verification Commands" below.
- **Manifest fields are parsed defensively.** `loadWords` drops malformed clips rather than throwing. A new field must be **optional with a safe default**, never required — a required field would make an older manifest parse to an empty inventory, which degrades silently to the tuning defaults and looks exactly like the game working.
- **Baseline before starting: 38 test files, 551 tests, all passing.** Verified 9 Aug 2026. Any task that reduces the test count must say so explicitly and say which tests were removed and why.
- **Do not push.** Commit freely; publishing is the user's call.

## Verification Commands

Used repeatedly below; defined once here.

```bash
npm run test        # vitest — baseline 38 files / 551 tests
npm run typecheck   # tsc -b
npm run build       # tsc -b && vite build
# dev-tooling boundary — must print nothing:
for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done
```

## File Structure

**Part A — cleanup (Tasks 1–3):**

| Path | Responsibility | Action |
|---|---|---|
| `public/clips/**` | audio-cmn mp3s (chen, tan) for the dev soundboard. 676K, and it lives in `public/` so it **ships to production today**. | Delete |
| `src/dev/Soundboard.tsx` | The lab's "sounds" tab; plays `public/clips`. | Delete |
| `src/dev/fetch-clips.ts` | Downloads `public/clips` from audio-cmn. | Delete |
| `src/dev/Lab.tsx` | Lab tab shell. | Modify — drop the `sounds` tab |
| `src/main.tsx` | `?soundboard` route. | Modify — drop the route |
| `fixtures/captures/chen_*.wav`, `tan_*.wav` | Speaker-into-mic captures. No test reads them. | Delete |
| `fixtures/captures/pierre_*.wav` | Learner captures. **Read by `analyze-recording.test.ts`** — see Task 3's decision note. | Delete + remove dependent tests |
| `fixtures/captures/speakers.json` | `f0Center` per speaker. | Modify — jane only |
| `docs/TESTING.md`, `CLAUDE.md` | Document the fixture inventory. | Modify |

**Part B — onset fix (Tasks 4–8):**

| Path | Responsibility | Action |
|---|---|---|
| `src/dev/clipCut.ts` | The single cutter and contour measurement. | Modify — add onset backoff, `onsetMs` on `CutClip` |
| `src/dev/clipCut.test.ts` | Cutter unit tests. | Modify — add onset cases |
| `src/dev/make-clips.ts` | Writes `public/ref/*.wav` + `manifest.json`. | Modify — emit `onsetS` |
| `public/ref/**` | The shipped inventory. | Regenerate |
| `src/game/words.ts` | Parses the manifest into `Word`. | Modify — parse `onsetS`, default 0 |
| `src/game/words.test.ts` | Parser tests. | Modify |
| `src/dev/manifest.test.ts` | The cutter↔game seam. | Modify — assert `onsetS` survives |
| `src/audio/reference.ts` | Loads and plays clips; **currently re-trims them in the browser**. | Modify — trust the manifest, drop `trimBounds` |
| `src/game/run.ts` | Builds `CueView`. | Modify — add `sweepDelayMs` |
| `src/render/world.ts` | Draws the demo dot. | Modify — honour `sweepDelayMs` |

---

# Part A — Cleanup

## Task 1: Remove the dev soundboard and its clip library

The soundboard played audio-cmn mp3s from a phone into the laptop mic. The clip inventory is Jane's own recordings now, and `public/clips/` is 676K shipping to every player for a dev tool.

**Files:**
- Delete: `public/clips/` (whole directory: `chen/`, `tan/`, `manifest.json`, `README.md`)
- Delete: `src/dev/Soundboard.tsx`
- Delete: `src/dev/fetch-clips.ts`
- Modify: `src/dev/Lab.tsx` (lines 23, 26, 34, 186)
- Modify: `src/main.tsx` (whole soundboard route, lines 6–31)
- Modify: `package.json` (the `fetch-clips` script)
- Modify: `docs/TESTING.md:145`, `CLAUDE.md:19,22`

- [ ] **Step 1: Confirm nothing else depends on the soundboard**

```bash
cd /Users/pierrebruyninckx/repos/Pierrebuilds/FlappyTone
grep -rn "Soundboard\|soundboard\|public/clips\|fetch-clips" src package.json docs CLAUDE.md
```

Expected hits, and only these: `src/main.tsx`, `src/dev/Lab.tsx`, `src/dev/Soundboard.tsx`, `src/dev/fetch-clips.ts`, `src/dev/Capture.tsx:2` (a comment only), `package.json`, `docs/TESTING.md:145`, `docs/SEO_PRERENDER_BRIEF.md:237`, `docs/flappytone-SPEC-*.md:414`, `CLAUDE.md:19,22`, and `docs/superpowers/plans/2026-08-05-*.md:374`.

Historical documents — `docs/SEO_PRERENDER_BRIEF.md`, `docs/flappytone-SPEC-unheard-fix-and-gamification.md`, and anything under `docs/superpowers/plans/` — are records of what was decided at the time. **Do not edit them.**

- [ ] **Step 2: Delete the files**

```bash
git rm -r public/clips
git rm src/dev/Soundboard.tsx src/dev/fetch-clips.ts
```

- [ ] **Step 3: Remove the `sounds` tab from the Lab**

In `src/dev/Lab.tsx`, make three edits.

Line 23 — delete the import:

```ts
import { Soundboard } from "./Soundboard.tsx";
```

Line 26 — drop `"sounds"` from the union:

```ts
type Tab = "play" | "shapes" | "pitch" | "gates" | "capture";
```

Line 34 — delete the entry from `TABS`:

```ts
  { id: "sounds", label: "sounds" },
```

Line 186 — delete the render branch:

```tsx
      {tab === "sounds" && <Soundboard />}
```

- [ ] **Step 4: Remove the `?soundboard` route from `src/main.tsx`**

Replace the whole file with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Remove the `fetch-clips` npm script**

In `package.json`, delete the line:

```json
    "fetch-clips": "node --experimental-strip-types src/dev/fetch-clips.ts",
```

- [ ] **Step 6: Update the docs that describe the soundboard as a live tool**

In `docs/TESTING.md`, find the numbered item at line 145 beginning `1. **Phone soundboard**` and delete that list item, renumbering the items that follow it. If the surrounding section exists only to describe the soundboard, delete the section.

In `CLAUDE.md`, rule 7 (line 19) names `Soundboard` as one of the DEV-gated components and line 22 greps for `soundboard`. The rule itself stays — it is still true of the Lab and `GateLogPanel`. Edit line 19 to read:

```
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** `src/dev/Lab.tsx` and `GateLogPanel` are both gated this way so Rollup drops the subtree. A query-param flag is *not* a gate on its own — `?gatelog` and `?soundboard` both shipped to production for exactly that reason, and a guard *inside* a component only hides it, it does not remove it. Gate the JSX at the usage site as well. Check the whole boundary after touching it:
```

Leave the grep on line 22 as-is: `soundboard` staying in the check is a free regression guard against the string ever coming back.

- [ ] **Step 7: Verify — tests, types, build, and the dev boundary**

```bash
npm run test && npm run typecheck && npm run build
for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done
```

Expected: 38 files / 551 tests pass (no test read the soundboard), typecheck clean, build succeeds, and the grep loop prints nothing.

- [ ] **Step 8: Confirm the clips are gone from the build output**

```bash
ls dist/clips 2>&1
```

Expected: `No such file or directory`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: remove the dev soundboard and its audio-cmn clip library

The inventory is Jane's own recordings now. public/clips was 676K of
third-party mp3s shipping to every player for a dev tool that only ever
existed to play reference audio into the laptop mic."
```

---

## Task 2: Remove the chen and tan captures

Speaker-into-mic recordings whose round trip CLAUDE.md already flags as a confound. **No test reads them** — verified by grep in Step 1.

**Files:**
- Delete: `fixtures/captures/chen_ma{1,2,3,4}.wav`, `fixtures/captures/tan_{ba1,ma2,ma3,ma4}.wav`
- Modify: `fixtures/captures/speakers.json`
- Modify: `src/pitch/mpm.ts:9`, `src/dev/report.ts:12`, `src/dev/Capture.tsx:17,219` (comments referencing them)
- Modify: `docs/TESTING.md:29`, `CLAUDE.md:195`

- [ ] **Step 1: Prove no test reads them**

```bash
grep -rn "chen_\|tan_" src --include="*.test.ts"
```

Expected: no output. If this prints anything, **stop** — the plan's premise is wrong and the affected test needs a decision before deleting its fixture.

- [ ] **Step 2: Delete the captures**

```bash
git rm fixtures/captures/chen_ma1.wav fixtures/captures/chen_ma2.wav \
       fixtures/captures/chen_ma3.wav fixtures/captures/chen_ma4.wav \
       fixtures/captures/tan_ba1.wav fixtures/captures/tan_ma2.wav \
       fixtures/captures/tan_ma3.wav fixtures/captures/tan_ma4.wav
```

- [ ] **Step 3: Trim `speakers.json`**

`fixtures/captures/speakers.json` becomes:

```json
{ "pierre": 115, "jane": 168 }
```

(`pierre` is removed in Task 3, not here — keeping the two deletions separate keeps each commit revertible on its own.)

- [ ] **Step 4: Fix the code comments that name deleted files**

`src/pitch/mpm.ts:9-10` currently cites `chen_ma2 / pierre_ma2_fast` as the evidence for band-limiting the search. The *finding* is still true; only the files are gone. Rewrite the citation to name a fixture that still exists:

```ts
 * unvoiced while onsets survived (see fixtures/captures, jane_ma2 frame
 * dumps). PRD §5.2 says to band-limit the *search*,
```

`src/dev/report.ts:12` uses `chen_ma3.wav → tone 3` as an example of the filename convention. Change the example to `jane_ma3.wav → tone 3`.

`src/dev/Capture.tsx:17` uses `chen_ma3.wav → chen` as the same kind of example, and line 219's helper text reads `name (speaker_syllableTone, e.g. chen_ma3)`. Change both examples to `jane_ma3`.

`src/dev/Capture.tsx:47` defaults the capture name to `"pierre_ma1"` — leave it for Task 3.

- [ ] **Step 5: Update the fixture tables in the docs**

`docs/TESTING.md:29` — delete the whole `chen_*`, `tan_*` table row.

`CLAUDE.md:195` — replace the sentence so it no longer promises fixtures that are gone:

```
Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.
```

- [ ] **Step 6: Verify**

```bash
npm run test && npm run typecheck
grep -rn "chen_\|tan_\|\"chen\"\|\"tan\"" src fixtures/captures/speakers.json docs/TESTING.md CLAUDE.md
```

Expected: 38 files / 551 tests pass; the grep prints nothing (historical docs under `docs/superpowers/plans/`, `docs/SEO_PRERENDER_BRIEF.md` and `docs/flappytone-SPEC-*.md` are excluded from that grep on purpose — they are records, not instructions).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove the chen and tan captures

Recorded speaker-into-mic; CLAUDE.md already flagged the round trip as a
confound and no test rested on them."
```

---

## Task 3: Remove the pierre captures

> **⚠ DECISION REQUIRED BEFORE EXECUTING THIS TASK.** Unlike chen/tan, the
> `pierre_*` captures are load-bearing. `src/dev/analyze-recording.test.ts`
> uses them as the **negative** case for the cue classifier: the classifier
> decides whether a voiced run is the game's own reference clip leaking back
> through the mic, and if it says yes, that audio is discarded. Five tests
> assert that none of Pierre's four captures is ever mistaken for a cue.
> Deleting the fixtures deletes the only guard against the game silently
> throwing away a real player's attempt.
>
> The steps below implement the deletion as asked, and remove the five tests
> that depend on it. **If that trade is not wanted, the alternative is to keep
> the four `pierre_ma{1,2,3,4}.wav` files and delete only
> `pierre_ma2_fast.wav`** — Task 3 then shrinks to one `git rm` and no test
> loss. Confirm which before running this task.

**Files:**
- Delete: `fixtures/captures/pierre_ma{1,2,3,4}.wav`, `fixtures/captures/pierre_ma2_fast.wav`
- Modify: `src/dev/analyze-recording.test.ts:44-58` (remove 5 tests)
- Modify: `fixtures/captures/speakers.json`
- Modify: `src/pitch/math.ts:20`, `src/pitch/math.test.ts:45`, `src/dev/analyze-recording.ts:213`, `src/dev/Capture.tsx:47` (comments and one default)
- Modify: `docs/TESTING.md:28,201`

- [ ] **Step 1: Delete the captures**

```bash
git rm fixtures/captures/pierre_ma1.wav fixtures/captures/pierre_ma2.wav \
       fixtures/captures/pierre_ma2_fast.wav fixtures/captures/pierre_ma3.wav \
       fixtures/captures/pierre_ma4.wav
```

- [ ] **Step 2: Remove the tests that read them**

In `src/dev/analyze-recording.test.ts`, delete these two blocks in full (lines ~44–58), including their comments:

```ts
  // The reason REF_DIR is the anchors and not the shipped inventory. Profiling
  // all 120 words puts a clip within 1.4st and 16% duration of this capture,
  // and it reads as a cue — see the comment on REF_DIR.
  it("would mistake a player for a cue if it profiled the whole inventory", () => {
    const inventory = loadRefProfiles(JANE_F0, "public/ref");
    const p = profileOf(`fixtures/captures/pierre_ma1.wav`, PIERRE_F0);
    expect(matchRef(p.f0s, p.medianF0, p.durMs, inventory)).not.toBeNull();
  });

  // Pierre is the player. None of his captures may be mistaken for a cue —
  // this is the false positive that would silently discard real attempts.
  for (const name of ["pierre_ma1", "pierre_ma2", "pierre_ma3", "pierre_ma4"]) {
    it(`does not mistake ${name} for a reference clip`, () => {
      const p = profileOf(`fixtures/captures/${name}.wav`, PIERRE_F0);
      expect(matchRef(p.f0s, p.medianF0, p.durMs, profiles)).toBeNull();
    });
  }
```

Then delete the now-unused `PIERRE_F0` constant near the top of the file, and any import it alone was using. Add a comment where the blocks were, so the gap is legible to the next reader:

```ts
  // The player-voice negative cases (five tests) were removed on 9 Aug 2026
  // with the pierre_* captures. The classifier's false-positive behaviour —
  // mistaking a real attempt for the game's own cue, and discarding it — is
  // now unguarded. Re-record a non-native voice to restore it.
```

- [ ] **Step 3: Run the tests and confirm the expected reduction**

```bash
npm run test
```

Expected: **38 files / 546 tests** — 5 fewer than the 551 baseline, all passing. Any other number means something unintended broke; investigate before continuing.

- [ ] **Step 4: Trim `speakers.json`**

```json
{ "jane": 168 }
```

- [ ] **Step 5: Fix the comments and the one default that name deleted files**

`src/pitch/math.ts:20` cites `fixtures/captures/pierre_ma1.wav` as the source of a 77 Hz octave-error observation. The finding stands; rewrite the citation so it does not point at a missing file:

```ts
 * (observed on a learner capture since removed: a 77 Hz first frame pinned a
```

`src/pitch/math.test.ts:45` has the same citation in a comment above a regression test. The test itself uses inline numbers, not the file — confirm that with:

```bash
grep -n "readFileSync\|decodeWav" src/pitch/math.test.ts
```

Expected: no output. Then reword the comment to `// learner-capture regression: first frame read 77 Hz (half of the true 154);`.

`src/dev/analyze-recording.ts:213` cites `pierre_ma1` (median 154Hz, 372ms) as a worked example. Reword to `a 154Hz, 372ms learner capture`.

`src/dev/Capture.tsx:47` defaults the capture filename to `"pierre_ma1"`. Change the default to `"jane_ma1"`.

- [ ] **Step 6: Update the docs**

`docs/TESTING.md:28` — delete the `pierre_ma1..4.wav` table row.
`docs/TESTING.md:201` — the sentence containing "`pierre_*` capture may match any clip." Delete the sentence; if its paragraph exists only to make that point, delete the paragraph.

- [ ] **Step 7: Verify**

```bash
npm run test && npm run typecheck && npm run build
grep -rn "pierre_" src docs/TESTING.md CLAUDE.md
```

Expected: 546 tests pass, typecheck and build clean, grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove the pierre captures

Leaves the cue classifier's false-positive case untested — noted in
analyze-recording.test.ts. Restoring it needs a non-native re-record."
```

---

# Part B — Restore the consonant onset

## Task 4: Teach the cutter to find the consonant

The cutter finds the syllable by looking for voicing, so an aspirated onset (the breathy part of ch/q/sh/f/h) is discarded — measured across the 120 takes in session `2026-08-07-xujzgs`, 52 clips lose more than the 45ms `PAD_MS` covers, 44 lose more than 100ms, and none loses more than 200ms. This task adds a backwards walk from the start of voicing through any sound still above the room noise.

**Files:**
- Modify: `src/dev/clipCut.ts`
- Test: `src/dev/clipCut.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CutClip` gains `onsetMs: number` — milliseconds of consonant audio in front of the tone window. `cutClip()`'s existing fields keep their exact current meaning: `durationMs` is the **tone window only**, and `contour` is measured over the tone window only. Task 5 reads `onsetMs`.

- [ ] **Step 1: Write the failing tests**

Add to `src/dev/clipCut.test.ts`. `JANE_F0` and the `capture()` helper already exist in that file; reuse them.

```ts
describe("consonant onset", () => {
  // chang2's affricate runs from ~85ms to ~256ms at rms 0.006-0.0135, against
  // a room floor of 0.0008, and carries no voicing at all. Cutting at the
  // vowel throws it away and the clip sounds like "hang".
  it("keeps the aspirated onset of chang2", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeGreaterThan(100);
    expect(cut.onsetMs).toBeLessThanOrEqual(MAX_ONSET_MS);
  });

  // ba1's stop burst is inside the 45ms pad already, and the 250ms before it
  // is genuine silence (rms 0.0009 == the floor). Walking back must stop
  // immediately rather than dragging room tone in.
  it("takes nothing extra from ba1, which is silent before the vowel", () => {
    const { samples, sampleRate } = recording("ba1");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeLessThan(30);
  });

  // The tone window is what the corridor is measured over. Extending the audio
  // must not move it, or every shipped polyline and duration shifts.
  it("does not change the tone window", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    // 1.007s is the duration the shipped manifest already records for chang2.
    expect(cut.durationMs).toBeCloseTo(1007, -1);
  });

  it("returns audio long enough to hold both windows", () => {
    const { samples, sampleRate } = recording("chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    const totalMs = (cut.samples.length / sampleRate) * 1000;
    expect(totalMs).toBeCloseTo(cut.onsetMs + cut.durationMs, -1);
  });
});
```

Add the two helpers this needs at the top of the file, next to the existing `capture()`:

```ts
/** A raw take from the recording session the shipped inventory was cut from. */
function recording(id: string) {
  return decodeWav(
    new Uint8Array(readFileSync(`${root}fixtures/recordings/2026-08-07-xujzgs/${id}.wav`)),
  );
}

/** That session's own measured f0Center — see manifest.json's `sessions`. */
const JANE_SESSION_F0 = 201.4;
```

and extend the existing import from `./clipCut.ts` with `MAX_ONSET_MS`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/dev/clipCut.test.ts
```

Expected: FAIL. The first three fail on `cut.onsetMs` being `undefined`, and `MAX_ONSET_MS` is not exported yet, so the file may fail to compile — either is the expected red.

- [ ] **Step 3: Implement the onset backoff in `src/dev/clipCut.ts`**

Add below the existing `PAD_MS` / `FADE_MS` constants:

```ts
/**
 * How far back the cut may reach for a voiceless onset.
 *
 * A Mandarin syllable can begin with up to ~200ms of sound that carries no
 * pitch at all — the burst and aspiration of ch/c/q/zh/sh/t/k/p, or the
 * friction of s/f/x/h. `longestVoicedRun` cannot see any of it, so a cut made
 * on voicing alone starts at the vowel: `chang2` came out as "hang".
 *
 * Measured over the 120 takes of session 2026-08-07-xujzgs, the sound before
 * voicing runs to 171ms at most and 52 clips exceed the 45ms `PAD_MS`. The cap
 * is what stops the walk when a take has no silence to stop it — a preceding
 * cough or a neighbouring word would otherwise be swallowed whole.
 */
export const MAX_ONSET_MS = 200;

/** Sound this many times above the room floor is the word, not the room. */
const ONSET_FLOOR_FACTOR = 3;
```

The `3×` matches the voicing gate PRD §5.2 already specifies (`rms >= noiseFloor * 3`), so the cutter and the game agree on what counts as sound.

Add the two helpers after `longestVoicedRun`:

```ts
function frameRms(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  for (let i = start; i < start + length && i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / length);
}

/**
 * Walks back from the start of voicing through sound still above the room
 * floor, and returns where the syllable audibly begins.
 *
 * The floor is measured from this take's own lead-in rather than assumed: gain
 * and room differ per session, and a fixed threshold would either swallow room
 * tone in a loud room or clip the aspiration in a quiet one. The 20th
 * percentile rather than the minimum, so one anomalously dead frame cannot
 * drive the floor to zero and make everything look like speech.
 *
 * Self-limiting by construction: on a take with real silence before the vowel
 * (`ba1`) the very first frame back is at the floor and the walk stops at once.
 */
function onsetStart(
  samples: Float32Array,
  sampleRate: number,
  voicedStart: number,
): number {
  const firstFrame = Math.max(0, Math.floor((voicedStart - WIN / 2) / HOP));
  if (firstFrame < 2) return voicedStart;

  const lead: number[] = [];
  for (let f = 0; f < firstFrame; f++) lead.push(frameRms(samples, f * HOP, WIN));
  const sorted = [...lead].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] * ONSET_FLOOR_FACTOR;

  const limit = Math.max(0, voicedStart - (MAX_ONSET_MS / 1000) * sampleRate);
  let f = firstFrame - 1;
  while (f >= 0 && f * HOP >= limit && lead[f] > floor) f--;
  return Math.max(limit, (f + 1) * HOP);
}
```

Add `onsetMs` to the `CutClip` interface, with a comment that says what it is for:

```ts
export interface CutClip {
  samples: Float32Array;
  sampleRate: number;
  /**
   * The tone window — the voiced part plus its pads. This is what the corridor
   * is measured over and what the gate lasts. Deliberately *not* the length of
   * `samples`, which also carries the consonant in front of it.
   */
  durationMs: number;
  /**
   * Consonant audio in front of the tone window, in ms. The demo plays from
   * sample 0; the corridor starts `onsetMs` later. 0 for a vowel or nasal onset.
   */
  onsetMs: number;
  /** Every voiced frame, over the tone window's timeline. */
  contour: ContourPoint[];
  /** Fraction of voiced frames pinned against chao 1 or 5 — see `pinnedWarning`. */
  pinnedFraction: number;
}
```

Now rewrite the body of `cutClip`. The critical property is that **`tone` is sliced exactly as before**, so `measureContour` sees byte-identical input and every shipped polyline is unchanged:

```ts
export function cutClip(
  samples: Float32Array,
  sampleRate: number,
  f0Center: number,
  rangeSemitones?: number,
): CutClip {
  const run = longestVoicedRun(samples, sampleRate, f0Center);
  if (!run) throw new Error("no voiced frames");

  const pad = (PAD_MS / 1000) * sampleRate;
  // The tone window, unchanged: this is what the corridor is measured over.
  const a = Math.max(0, Math.round(run.start - pad));
  const b = Math.min(samples.length - 1, Math.round(run.end + pad));
  // The clip window: the same tail, reaching further back for the consonant.
  const onsetA = Math.min(a, Math.round(onsetStart(samples, sampleRate, a)));

  const cut = samples.slice(onsetA, b + 1);
  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < cut.length; i++) {
    cut[i] *= i / fade;
    cut[cut.length - 1 - i] *= i / fade;
  }

  // Measured over the tone window only — a contour normalised over the whole
  // clip would slide every polyline vertex by the onset's length.
  const tone = samples.slice(a, b + 1);
  const { contour, pinnedFraction } = measureContour(tone, sampleRate, f0Center, rangeSemitones);

  return {
    samples: cut,
    sampleRate,
    durationMs: (tone.length / sampleRate) * 1000,
    onsetMs: ((a - onsetA) / sampleRate) * 1000,
    contour,
    pinnedFraction,
  };
}
```

Note `onsetStart` is passed `a` (the padded start), not `run.start`, so the 45ms pad is never double-counted.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/dev/clipCut.test.ts
```

Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Prove the anchors are untouched**

The four `ma` anchors are the invariant CLAUDE.md protects. `m` is a nasal — voiced throughout — so the backoff should find nothing and the files should regenerate byte-identical.

```bash
npm run make-ref-clips
git diff --stat fixtures/anchors
```

Expected: **no output from `git diff`.** If the anchors moved, stop: either the backoff is reaching into room tone, or `measureContour` is no longer seeing the same samples. Do not proceed to Task 5 with a dirty anchor diff.

- [ ] **Step 6: Run the full suite**

```bash
npm run test && npm run typecheck
```

Expected: all pass at whatever the count is after Part A (546 if Task 3 ran as written, plus 4 new = 550).

- [ ] **Step 7: Commit**

```bash
git add src/dev/clipCut.ts src/dev/clipCut.test.ts
git commit -m "fix(clips): cut from the consonant, not from the vowel

A cut made on voicing alone discards an aspirated onset entirely -
chang2 came out as 'hang'. 52 of 120 takes lose more than the 45ms pad.
The tone window is untouched, so every shipped polyline is unchanged."
```

---

## Task 5: Write `onsetS` into the manifest and regenerate the inventory

**Files:**
- Modify: `src/dev/make-clips.ts`
- Regenerate: `public/ref/*.wav`, `public/ref/manifest.json`

**Interfaces:**
- Consumes: `CutClip.onsetMs` from Task 4.
- Produces: each manifest clip gains `"onsetS": <number>` in seconds, rounded to 3 decimals. Absent means 0. Task 6 parses it.

- [ ] **Step 1: Carry `onsetMs` through the `Cut` record**

In `src/dev/make-clips.ts`, add to the `Cut` interface (around line 66):

```ts
  onsetMs: number;
```

and set it where the other fields are copied off the `cutClip` result. Find the object literal that populates `durationMs` and `contour` from the cut and add `onsetMs: cut.onsetMs` alongside them.

- [ ] **Step 2: Emit it in the manifest**

Find where each clip's manifest entry is built (the object with `id`, `hanzi`, `pinyin`, `english`, `tone`, `file`, `durationS`, `polyline`, `contour`). Add `onsetS` immediately after `durationS`:

```ts
      onsetS: Number((c.onsetMs / 1000).toFixed(3)),
```

Placed after `durationS` on purpose — the two describe the same timeline and reading the manifest by eye should show them together.

- [ ] **Step 3: Regenerate the inventory**

```bash
npm run make-clips
```

Expected: the console report ends with `120 clip(s) -> public/ref/, manifest.json written.`

- [ ] **Step 4: Verify the diff is purely additive**

This is the whole safety argument for the design — the corridors must not have moved.

```bash
# Every changed field in the manifest, deduplicated:
git diff -U0 public/ref/manifest.json | grep '^[-+]' | grep -o '"[a-zA-Z]*":' | sort -u
```

Expected: only `"onsetS":` appears on `+` lines, and `"durationS":`/`"polyline":`/`"contour":` do **not** appear as changed. Because the manifest is one clip per line, confirm directly:

```bash
# No line may lose or change durationS/polyline; check a known clip by eye:
git diff public/ref/manifest.json | grep -c '^-' 
```

Every `-` line should have a matching `+` line differing only by the inserted `onsetS`. Spot-check `chang2` and `ba1`:

```bash
grep -o '"id":"chang2".\{0,120\}' public/ref/manifest.json
grep -o '"id":"ba1".\{0,120\}' public/ref/manifest.json
```

Expected: `chang2` shows `"onsetS":0.1` or larger; `ba1` shows `"onsetS":0`. Both show the same `durationS` they had before (1.007 and 1.178).

If any `durationS` or `polyline` value moved, **stop** — Task 4's tone window is not actually unchanged, and every tuning decision downstream rests on it.

- [ ] **Step 5: Confirm the audio got longer only where expected**

```bash
ls -l public/ref/chang2.wav public/ref/ba1.wav
```

Expected: `chang2.wav` is larger than it was (the git diff will show it as modified); `ba1.wav` is unchanged (`git diff --stat public/ref/ba1.wav` prints nothing).

- [ ] **Step 6: Listen to it**

You cannot hear. **Ask the user to play `public/ref/chang2.wav` and confirm it now says "chang" rather than "hang"**, and to spot-check two or three others from the worst-affected list: `chi1`, `qi1`, `shou3`, `fei1`. Do not proceed on the assumption that it worked.

- [ ] **Step 7: Run the suite**

```bash
npm run test && npm run typecheck
```

Expected: all pass. `manifest.test.ts` still passes because `onsetS` is an unknown extra field to the current parser, which ignores it — Task 6 makes it meaningful.

- [ ] **Step 8: Commit**

```bash
git add src/dev/make-clips.ts public/ref
git commit -m "feat(clips): regenerate the inventory with the consonant restored

manifest gains onsetS per clip. durationS, polyline and contour are
byte-identical - the tone window did not move."
```

---

## Task 6: Parse `onsetS` in the game

**Files:**
- Modify: `src/game/words.ts`
- Test: `src/game/words.test.ts`, `src/dev/manifest.test.ts`

**Interfaces:**
- Consumes: the `onsetS` field written in Task 5.
- Produces: `Word` gains `onsetS: number`, always a finite number ≥ 0 — defaulted to 0 when the manifest omits it or gives a bad value. Tasks 7 and 8 read `word.onsetS`.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/words.test.ts`:

```ts
describe("onsetS", () => {
  const base = {
    id: "chang2", hanzi: "長", pinyin: "cháng", english: "long",
    tone: 2, file: "chang2.wav", durationS: 1.007,
    polyline: [[0, 3], [1, 5]],
  };

  it("reads the onset when present", () => {
    const [w] = loadWords({ clips: [{ ...base, onsetS: 0.19 }] });
    expect(w.onsetS).toBe(0.19);
  });

  // An older manifest predates the field. Defaulting keeps those clips
  // playable at the old behaviour; treating the field as required would drop
  // all 120 and degrade to the tuning defaults, which looks like a working game.
  it("defaults to 0 when the manifest predates the field", () => {
    const [w] = loadWords({ clips: [base] });
    expect(w.onsetS).toBe(0);
  });

  it("defaults to 0 rather than dropping the clip when the value is nonsense", () => {
    for (const bad of ["0.19", NaN, Infinity, -0.5, null]) {
      const words = loadWords({ clips: [{ ...base, onsetS: bad }] });
      expect(words.length, String(bad)).toBe(1);
      expect(words[0].onsetS, String(bad)).toBe(0);
    }
  });

  // The onset sits in front of the tone, inside the same clip. One longer than
  // the tone itself is a measurement error, not a syllable.
  it("rejects an onset longer than the tone window", () => {
    const [w] = loadWords({ clips: [{ ...base, onsetS: 2 }] });
    expect(w.onsetS).toBe(0);
  });
});
```

Add to `src/dev/manifest.test.ts`, inside the existing `describe("the shipped manifest", ...)`:

```ts
  it("carries an onset for every word", () => {
    // The field crossing the cutter/game seam. If make-clips stops writing it
    // or loadWords stops reading it, every clip silently reverts to starting
    // at the vowel — which is audible but not detectable from the code.
    for (const w of words) {
      expect(Number.isFinite(w.onsetS), w.id).toBe(true);
      expect(w.onsetS, w.id).toBeGreaterThanOrEqual(0);
      expect(w.onsetS, w.id).toBeLessThan(w.durationS);
    }
  });

  it("restores the consonant on the aspirated onsets", () => {
    // The bug this field exists for: cut on voicing alone, chang2 said "hang".
    // These four were measured at 149-171ms of pre-voicing sound.
    for (const id of ["chang2", "chi1", "qi1", "shou3"]) {
      const w = words.find((x) => x.id === id)!;
      expect(w.onsetS, id).toBeGreaterThan(0.08);
    }
  });

  it("takes nothing extra where the syllable starts silent", () => {
    // ba1's stop burst is inside the pad already; a nonzero onset here would
    // mean the backoff is dragging room tone in.
    expect(words.find((x) => x.id === "ba1")!.onsetS).toBeLessThan(0.03);
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/game/words.test.ts src/dev/manifest.test.ts
```

Expected: FAIL — `w.onsetS` is `undefined`, so `Number.isFinite` is false and the equality assertions miss.

- [ ] **Step 3: Implement**

In `src/game/words.ts`, add to the `Word` interface after `durationS`:

```ts
  /**
   * Seconds of consonant audio in front of the tone, inside the same file.
   *
   * The clip plays from 0 so the player hears the whole syllable; the corridor
   * and the demo dot start `onsetS` later, so the tone still begins at gate
   * t=0. 0 for a vowel or nasal onset, and 0 for any manifest that predates
   * the field.
   */
  onsetS: number;
```

Add the reader above `loadWords`:

```ts
/**
 * A bad onset costs the consonant; a dropped clip costs the whole word. So
 * unlike every other field here, a nonsense value defaults rather than
 * rejecting — falling back to 0 is exactly the pre-onset behaviour, which was
 * wrong but playable.
 */
function readOnsetS(value: unknown, durationS: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < durationS
    ? value
    : 0;
}
```

and in the `words.push({...})` call, after `durationS: c.durationS,`:

```ts
      onsetS: readOnsetS(c.onsetS, c.durationS),
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run src/game/words.test.ts src/dev/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Fix the fallout in other tests**

`Word` is now wider, so any test building a `Word` literal will fail to typecheck.

```bash
npm run typecheck
```

For each error, add `onsetS: 0` to the literal. Do **not** loosen the type to `onsetS?: number` — an optional field on the parsed type would push the defaulting decision out to every consumer, which is the mistake this design avoids.

- [ ] **Step 6: Verify**

```bash
npm run test && npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/words.ts src/game/words.test.ts src/dev/manifest.test.ts
git commit -m "feat(game): parse onsetS, defaulting to 0

Optional by design: a required field would drop every clip from an older
manifest and degrade to the tuning defaults, which looks like a working game."
```

---

## Task 7: Stop the browser re-trimming the audio

`src/audio/reference.ts` trims each clip again at playback, at 3% of peak. It was written on 2 Aug when the clips were downloaded mp3s of unknown provenance; the cutter replaced that on 8 Aug and nobody removed the old defence. It is now actively dangerous: it is a rule that deletes quiet audio from the front of a clip, and Task 4 just deliberately put quiet audio there.

**Files:**
- Modify: `src/audio/reference.ts:50-68, 88, 145-151`
- Test: `src/audio/reference.test.ts` (create if absent — check first)

**Interfaces:**
- Consumes: `Word.onsetS` from Task 6.
- Produces: `cueDurationMsFor(word, tone)` now returns the **whole** audible clip, `(onsetS + durationS) * 1000` — it drives the freeze window, which must cover everything the player hears.

- [ ] **Step 1: Check whether a test file exists**

```bash
ls src/audio/reference.test.ts 2>&1
```

If it does not exist, this task has no unit test to write — `reference.ts` needs a real `AudioContext`. Verification is by the manifest values plus the on-device check in Task 8's final step. Note that in the commit message rather than inventing a mock that proves nothing.

- [ ] **Step 2: Delete `trimBounds` and trust the manifest**

Remove the whole `trimBounds` function (lines ~53–68) and the `TRIM_FLOOR` constant above it.

Change the `RefClip` interface so it carries what the manifest says rather than what the browser guessed:

```ts
interface RefClip {
  buffer: AudioBuffer;
  /**
   * Consonant audio before the tone begins, from the manifest.
   *
   * Not re-derived from the samples here. It used to be — a 3%-of-peak trim
   * left over from when these were third-party mp3s — and that rule deletes
   * quiet audio from the front of a clip, which is exactly what an aspirated
   * onset is. Two measurements of the same thing is one too many; the cutter's
   * is the one the corridor was built from.
   */
  onsetS: number;
  /** The tone window — what the corridor lasts. */
  durationS: number;
}
```

In `loadClip`, replace the `clips.set` line:

```ts
    clips.set(word.id, { buffer, onsetS: word.onsetS, durationS: word.durationS });
```

- [ ] **Step 3: Play the whole clip**

In `playToneCue`, the native-clip branch currently starts at `clip.offsetS` and plays for `clip.durationS` — i.e. it skips the onset. Replace it:

```ts
  if (clip) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(ctx.destination);
    // From 0: the consonant is the front of the syllable, not silence to skip.
    src.start(ctx.currentTime);
    const audibleMs = (clip.onsetS + clip.durationS) * 1000;
    cueAudibleUntilMs = performance.now() + audibleMs + CUE_TAIL_MS;
    return;
  }
```

`cueAudibleUntilMs` gates the microphone — while the cue is playing the game must not listen, or it flies the cue instead of the player. It has to cover the consonant too.

- [ ] **Step 4: Widen the cue duration**

`cueDurationMsFor` drives the freeze window, so it must span everything audible:

```ts
export function cueDurationMsFor(word: Word | null, tone: Tone): number {
  const clip = word ? clips.get(word.id) : undefined;
  if (clip) return (clip.onsetS + clip.durationS) * 1000;
  return word ? (word.onsetS + word.durationS) * 1000 : synthCueMsFor(tone);
}
```

Update its doc comment, which currently says "the real clip's trimmed duration": replace "trimmed duration" with "full audible length, consonant included".

- [ ] **Step 5: Verify**

```bash
npm run test && npm run typecheck && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/reference.ts
git commit -m "fix(audio): stop re-trimming clips in the browser

trimBounds dated from the audio-cmn mp3s and cut at 3% of peak - a rule
that deletes exactly the quiet aspiration the cutter now preserves. The
manifest's onsetS is the single measurement. No unit test: this path
needs a real AudioContext; verified on device."
```

---

## Task 8: Delay the demo dot by the onset

The demo dot starts sweeping the corridor the instant the audio starts. The audio now begins `onsetS` earlier than the tone does, so without this the dot traces the rise while the player is still hearing "ch" — eye and ear drift apart by up to 190ms.

**Files:**
- Modify: `src/game/run.ts:186` (the `CueView` interface), `src/game/run.ts:~629` (where the cue is built)
- Modify: `src/render/world.ts:373`
- Test: `src/game/run.test.ts`

**Interfaces:**
- Consumes: `Word.onsetS` from Task 6.
- Produces: `CueView` gains `sweepDelayMs: number` — how long after `atMs` the dot starts moving. 0 when there is no word or no onset.

- [ ] **Step 1: Write the failing test**

Add to `src/game/run.test.ts`. Match the file's existing helper for constructing a `Run` with injected words — read the top of the file and reuse it rather than writing a new one.

```ts
it("delays the demo dot by the clip's consonant", () => {
  // The dot traces the tone. The audio starts with the consonant, so the dot
  // must wait it out or it sweeps the rise while the player hears "ch".
  const word = { ...testWord, tone: 2 as const, onsetS: 0.19, durationS: 1.0 };
  const run = makeRun({ words: [word], demoStyle: "pause" });
  const cue = cueAfterAdvancing(run);
  expect(cue.sweepDelayMs).toBeCloseTo(190, 0);
});

it("does not delay a dot with no consonant to wait for", () => {
  const word = { ...testWord, tone: 1 as const, onsetS: 0, durationS: 1.0 };
  const run = makeRun({ words: [word], demoStyle: "pause" });
  expect(cueAfterAdvancing(run).sweepDelayMs).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/game/run.test.ts
```

Expected: FAIL — `sweepDelayMs` is `undefined`.

- [ ] **Step 3: Add the field to `CueView`**

In `src/game/run.ts`, after `sweepMs`:

```ts
  /**
   * How long after `atMs` the demo dot starts moving.
   *
   * The clip begins with the consonant and the corridor does not, so the dot
   * has to sit still through it. Separate from `sweepMs` for the same reason
   * `sweepMs` is separate from `durationMs`: these are three different clocks
   * and folding any two together has broken the demo once already.
   */
  sweepDelayMs: number;
```

- [ ] **Step 4: Populate it where the cue is built**

In the `this.cue = { ... }` literal (~line 629), after `sweepMs`:

```ts
        sweepDelayMs: (next.word?.onsetS ?? 0) * 1000,
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/game/run.test.ts
```

Expected: PASS.

- [ ] **Step 6: Honour the delay in the renderer**

In `src/render/world.ts`, `drawCueDemo`, replace line 373:

```ts
  const raw = (performance.now() - cue.atMs - cue.sweepDelayMs) / cue.sweepMs;
```

The existing `if (raw < 0) return;` on the next line already does the right thing with a negative value — the dot is simply not drawn while the consonant plays. Add a comment so that is deliberate rather than incidental:

```ts
  // Negative through the consonant: the dot appears when the tone starts, not
  // when the sound does.
  if (raw < 0) return;
```

- [ ] **Step 7: Fix any `CueView` literals in tests**

```bash
npm run typecheck
```

Add `sweepDelayMs: 0` to any test-constructed `CueView`.

- [ ] **Step 8: Full verification**

```bash
npm run test && npm run typecheck && npm run build
for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done
```

Expected: all pass; the grep loop prints nothing.

- [ ] **Step 9: Play it**

The three clocks — audio, demo dot, corridor — are what PRD §6 makes an invariant, and this task moves two of them. Static tests cannot see them disagree.

**Ask the user to run `npm run dev`, play a run, and confirm on a T2 or T4 gate with an aspirated onset (`chang2`, `chi1`, `qi1`, `qiu2`, `che1`) that:**
1. the whole word is audible, consonant included;
2. the ghost dot starts moving when the *tone* starts, not when the sound starts;
3. the freeze/"listen" beat still ends as the corridor arrives, not early.

Do not mark this task complete on the test suite alone.

- [ ] **Step 10: Commit**

```bash
git add src/game/run.ts src/game/run.test.ts src/render/world.ts
git commit -m "fix(demo): hold the demo dot through the consonant

The clip now starts with the consonant and the corridor does not, so the
dot waits out onsetS before tracing. Third clock, deliberately separate."
```

---

## Task 9: Record what changed

**Files:**
- Modify: `CLAUDE.md` (the clip-inventory section)
- Modify: `docs/PRD.md` §6 and §9

- [ ] **Step 1: Add the onset rule to `CLAUDE.md`**

In the clip-inventory section, after the paragraph beginning "**A gate is built from a word, not a tone.**", add:

```markdown
**The clip starts at the consonant; the corridor starts at the tone.** A cut
made on voicing alone begins at the vowel, so an aspirated onset — ch/c/q/sh/s/
f/h/x — is discarded entirely and `chang2` plays as "hang". 52 of the 120 takes
lost more than the 45ms pad. `clipCut` now walks back from the start of voicing
through sound still above the take's own room floor, capped at `MAX_ONSET_MS`
(200ms; the worst real case measured 171ms), and `manifest.json` records the gap
as `onsetS`. The tone window is deliberately untouched — `durationS`, `polyline`
and `contour` are all still measured over the voiced part alone, so restoring
the consonant changed no corridor and invalidated no tuning value.

That makes three clocks on one cue, and they must not be folded together:
`durationMs` freezes the world for the whole audible clip, `sweepMs` traces the
corridor, and `sweepDelayMs` holds the dot still through the consonant.
`reference.ts` no longer re-derives any of them — it used to re-trim each clip
at 3% of peak, a leftover from the audio-cmn mp3s, which is a rule that deletes
precisely the quiet aspiration this fix restores.
```

- [ ] **Step 2: Update the fixture inventory in `CLAUDE.md`**

The Testing section's ground-truth sentence was edited in Tasks 2 and 3. Confirm it now names only `jane_*` and the synthetic tones, and mentions no deleted file:

```bash
grep -n "chen\|tan_\|pierre" CLAUDE.md
```

Expected: no output.

- [ ] **Step 3: Add a superseded note to PRD §9**

The PRD is edited by appending `⚠️ Superseded` blocks, never by rewriting the original text. Add after the existing 8 Aug block in §9:

```markdown
> **⚠️ Amended (9 Aug 2026) — a clip begins at the consonant.** The cut was
> made on voicing, which starts at the vowel, so every aspirated and fricative
> onset was thrown away: `chang2` played as "hang", and 52 of the 120 takes lost
> more than the 45ms pad. Clips now carry the consonant and `manifest.json`
> records its length as `onsetS`. The corridor is unchanged — it is still
> measured over the voiced window alone — so this moved audio only. The demo dot
> waits out `onsetS` before it starts tracing.
```

- [ ] **Step 4: Verify the docs describe the code**

```bash
npm run test && npm run typecheck && npm run build
grep -rn "chen_\|tan_\|pierre_\|Soundboard" src CLAUDE.md docs/TESTING.md
```

Expected: tests and build pass; grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/PRD.md docs/TESTING.md
git commit -m "docs: record the onset fix and the fixture cleanup"
```

---

## Self-Review Notes

**Spec coverage.** The user asked for three things. (1) *Plan the onset fix, option C* — Tasks 4–8. (2) *Keep only Jane's recordings* — Tasks 2 and 3, with the `pierre_*` cost flagged for a decision. (3) *Remove the lab sounds* — Task 1.

**Deliberate scope choices, called out rather than silently taken:**
- `fixtures/captures/Jane-*.m4a` are kept — they are Jane's source recordings.
- `fixtures/recordings/` (15M, gitignored) is kept — it is the input `make-clips` reads and Task 5 needs it.
- Historical documents (`docs/SEO_PRERENDER_BRIEF.md`, `docs/flappytone-SPEC-*.md`, `docs/superpowers/plans/*`) are records of past decisions and are not edited.
- Task 3 is the only task that reduces the test count, and it says so explicitly.

**The load-bearing assumption**, stated so a reviewer can attack it: slicing the tone window exactly as before means `measureContour` receives byte-identical samples, so every `polyline`, `contour` and `durationS` in the regenerated manifest is unchanged. Task 4 Step 5 and Task 5 Step 4 are the two gates that prove it. If either fails, the design's whole claim — "additive change, no tuning invalidated" — is false and the plan should stop rather than be worked around.
