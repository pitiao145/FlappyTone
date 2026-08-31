# Clip Edge Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every clip in `public/ref/` contains its whole syllable — the consonant at the front and the natural decay at the end — with nothing borrowed from a neighbouring attempt, and with every corridor unchanged.

**Architecture:** The cutter finds the syllable by looking for voicing, then pads 45ms either side. Two problems follow. (1) It measures loudness in the pitch pipeline's 46ms windows, which cannot see a 10ms stop burst, so short onsets and natural decays are clipped. (2) The onset backoff added on 9 Aug walks backwards on an energy threshold with no notion of where the *chosen* attempt begins — and each raw take contains two attempts, so on 9 clips it walked into the previous attempt's creak and glued it on. This plan replaces the backoff with a gap-finding search on a fine (5ms) envelope, applies the same treatment to the tail, and records the tail in the manifest as `tailS` so the tone window — and therefore every corridor — stays exactly where it is.

**Tech Stack:** TypeScript, Node (`--experimental-strip-types`) for the cutter, Vitest.

## Global Constraints

- **`src/dev/clipCut.ts` is the only cutter.** Both `npm run make-ref-clips` and `npm run make-clips` call it. After touching it, regenerate and check `git diff --stat fixtures/anchors` is empty.
- **The tone window must not move.** `durationS`, `polyline` and `contour` are measured over the voiced run plus its 45ms pads, faded before measuring. Every one of the 120 must come out byte-identical to the current manifest. This is the same property the previous plan established and it remains non-negotiable — every tuning decision in the game rests on it.
- **Measurement constants live in `src/dev/clipCut.ts`** as module constants, not in `src/game/tuning.ts` (that file is for values a live tuning UI moves during play).
- **`src/pitch/` must have zero Web Audio dependencies.**
- **Manifest fields are parsed defensively:** optional, with a safe default. A required field would drop every clip from an older manifest and degrade to the tuning defaults, which looks exactly like a working game.
- **Baseline: 38 test files, 559 tests, all passing**, at commit `fbf9b6d` on branch `clip-onset-and-fixture-cleanup`.
- **Do not push.**
- **Never run `git clean -fdx`** — `fixtures/recordings/` is gitignored, 15M, and is the cutter's input.

## Verification Commands

```bash
npm run test        # vitest — baseline 38 files / 559 tests
npm run typecheck
npm run make-ref-clips && git diff --stat fixtures/anchors   # must print nothing
```

## What was measured (9 Aug 2026) — the evidence this plan rests on

Session `fixtures/recordings/2026-08-07-xujzgs/`, 120 takes, `f0Center` 201.4.

**Each raw take contains two attempts at the word.** The recording booth ends a take after 500ms of silence (`DEFAULT_TAKE_CONFIG.silenceMs`) and the speaker often repeated the word sooner than that. `longestVoicedRun` picks whichever attempt is longer. Sound level across `wo3`, one character per 20ms:

```
wo3   ............cvvvvVVVVVVvvvvvvvcccccccccccccccvvvvvvVVVVVVVVvvvcccccc.
                  └── attempt 1 ──┘  └── creak ──┘ └──── attempt 2 ─────┘
```

**The 250ms before the vowel, 10ms per character** (`.` <2%, `-` <5%, `+` <12%, `o` <30%, `O` ≥30% of the take's peak):

```
chang2   ..-.-+oooooooOooooooooooO   silence, then ~190ms of affricate  → onset is real
chi1     .-..+++ooOoOooooOOOoooooO   same
ba2      ....................+oOOO   silence, then a ~50ms /b/ burst    → currently clipped
da4      ....................---+o   silence, then a ~40ms /d/ burst    → currently clipped
bei1     ........................O   silent right up to the vowel       → nothing to recover
ba3      -+++++++++++-+++-++++oo+o   never silent — the other attempt   → must NOT extend
hao3     oo+oo+oo+oo+oooooo+oooooo   same
```

**Current state of the shipped inventory:**

| | count |
|---|---|
| clips with a genuine (hiss-like) restored onset | 42 |
| clips whose restored onset is contaminated creak | 9 — `ba3 hao3 hua4 huang2 ren2 tang1 wan2 wang2 yuan3` |
| clips still starting mid-sound (>15% of peak at 20ms in) | 11 — worst `ba2` at 28.5% |
| clips still sounding 20ms before the end (>15% of peak) | 2 — `qi1`, `ni3` |
| clips whose end is clipped by >10ms | ~70, mean 57ms |

**Approaches already tried and rejected** — do not repeat them:

1. *"Start at the quietest point in the 200ms before the vowel."* The minimum drifts to the far end of the window (silence), so 13 clips got a **negative** onset — the start moved past the vowel and truncated it.
2. *"Walk back while above `noiseFloor × 3` on the 46ms pitch frames."* This is what shipped and caused the contamination: on `ba3`/`hao3` the inter-attempt creak never drops below the threshold, so the walk runs to the cap. It is also blind to a 10ms burst, because a 46ms window dilutes one to under half its true level.
3. *"Scan back 200ms for a 20ms quiet run."* Closer, but `chang2`'s silence sits at −200ms, exactly on the boundary, so it found nothing and lost its affricate. The search window must be wider than the longest real onset.

**A phonetic subtlety that bit approach 3:** an affricate or aspirated stop contains its *own* silence — the closure — before its burst. "The last quiet moment before the vowel" can therefore land *inside* the consonant, keeping the aspiration but dropping the burst. Whatever gap-finding rule you land on has to tolerate that; a short quiet stretch immediately followed by a loud broadband burst is part of the consonant, not the boundary before it.

---

## Task 1: Fine-grained edge detection in the cutter

**Files:**
- Modify: `src/dev/clipCut.ts`
- Test: `src/dev/clipCut.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CutClip` keeps `onsetMs` (unchanged meaning: consonant audio in front of the tone window) and gains `tailMs: number` — audio after the tone window, in milliseconds, ≥ 0. `durationMs` and `contour` keep their exact current meaning: the tone window alone.

**Your job is to satisfy the acceptance criteria below.** The plan deliberately does not hand you an algorithm, because three were tried and all three failed on real data (see "Approaches already tried"). What it hands you instead is a measurable definition of correct. Iterate against it.

**Shape of the approach that is expected to work** (a starting point, not a specification):
- Build an amplitude envelope on a fine grid — around 5ms windows at 1ms hops — rather than the pitch pipeline's `WIN`/`HOP`. This is what makes a 10ms burst visible.
- Derive "quiet" from the take's own statistics (a low percentile of the envelope), not a fixed number: gain and room differ per session.
- Search *outward* from the tone window for the boundary between the syllable and the silence around it, over a window wider than the longest real onset (~190ms), but only *extend* up to `MAX_ONSET_MS`.
- **When no clean boundary is found inside the search window, do not extend** — fall back to the existing 45ms pad. This is the rule that fixes `ba3` and `hao3`: if the cutter cannot see where the word starts, guessing is what glued the previous attempt on. Silence about an unknown beats a confident wrong answer, which is the same posture the game takes with "couldn't hear that".
- Apply the same treatment at the end, independently.

- [ ] **Step 1: Write the acceptance test**

This is the gate for the whole plan. Add to `src/dev/clipCut.test.ts`. It reads the two committed fixtures plus the gitignored session; skip the session-wide cases when the directory is absent rather than failing (`fixtures/recordings/` is not committed — check with `existsSync`), but the two committed-fixture cases must always run.

```ts
import { existsSync } from "node:fs";

const SESSION = `${root}fixtures/recordings/2026-08-07-xujzgs`;
const HAVE_SESSION = existsSync(SESSION);

/** Peak-relative RMS over a 5ms window `atMs` into `samples`. */
function levelAt(samples: Float32Array, sampleRate: number, atMs: number): number {
  const w = Math.round(sampleRate * 0.005);
  const start = Math.round((atMs / 1000) * sampleRate);
  let sum = 0;
  for (let i = start; i < start + w && i < samples.length; i++) sum += samples[i] * samples[i];
  const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  return peak === 0 ? 0 : Math.sqrt(sum / w) / peak;
}

describe("clip edges", () => {
  // chang2's affricate is ~190ms of hiss before the vowel. Cutting on voicing
  // alone discarded all of it and the clip said "hang".
  it("keeps the whole affricate on chang2", () => {
    const { samples, sampleRate } = capture("jane_chang2");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeGreaterThan(80);
    expect(cut.onsetMs).toBeLessThanOrEqual(MAX_ONSET_MS);
  });

  // ba1 is silent for 250ms before the vowel: there is nothing to recover, and
  // reaching back anyway would drag room tone into the demo.
  it("takes nothing extra on ba1, which is silent before the vowel", () => {
    const { samples, sampleRate } = capture("jane_ba1");
    const cut = cutClip(samples, sampleRate, JANE_SESSION_F0);
    expect(cut.onsetMs).toBeLessThan(30);
  });

  it("never starts mid-sound", () => {
    if (!HAVE_SESSION) return;
    // A clip already at 15% of its peak 20ms in began part-way through the
    // syllable. Measured at 20ms so the 15ms fade-in is past.
    const loud: string[] = [];
    for (const id of sessionIds()) {
      const cut = cutOf(id);
      if (levelAt(cut.samples, cut.sampleRate, 20) > 0.15) loud.push(id);
    }
    expect(loud).toEqual([]);
  });

  it("never ends mid-sound", () => {
    if (!HAVE_SESSION) return;
    const loud: string[] = [];
    for (const id of sessionIds()) {
      const cut = cutOf(id);
      const endMs = (cut.samples.length / cut.sampleRate) * 1000;
      if (levelAt(cut.samples, cut.sampleRate, endMs - 25) > 0.10) loud.push(id);
    }
    expect(loud).toEqual([]);
  });

  it("does not borrow audio from the other attempt in the take", () => {
    if (!HAVE_SESSION) return;
    // Each raw take holds two attempts. On these nine there is no silence at
    // all in the 250ms before the vowel — the gap is filled by the previous
    // attempt's creak — so the cutter must decline to extend rather than glue
    // the two together.
    for (const id of ["ba3", "hao3", "hua4", "huang2", "ren2", "tang1", "wan2", "wang2", "yuan3"]) {
      expect(cutOf(id).onsetMs, id).toBeLessThanOrEqual(60);
    }
  });

  it("keeps the aspirated onsets that already sound right", () => {
    if (!HAVE_SESSION) return;
    for (const id of ["chang2", "chi1", "qi1", "shou3", "che1", "qiu2", "cai4", "shi4"]) {
      expect(cutOf(id).onsetMs, id).toBeGreaterThan(80);
    }
  });
});
```

Write the `sessionIds()` and `cutOf()` helpers to suit — `cutOf` decodes `${SESSION}/${id}.wav` and returns `cutClip(samples, sampleRate, JANE_SESSION_F0)`; `sessionIds()` lists the ids from `public/ref/manifest.json`. `capture()`, `root` and `JANE_SESSION_F0` already exist in the file.

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run src/dev/clipCut.test.ts
```

Expected: the "never ends mid-sound", "does not borrow audio", and "never starts mid-sound" cases fail against today's cutter, and `tailMs` does not exist yet.

- [ ] **Step 3: Implement**

Replace `onsetStart` and its `ONSET_FLOOR_FACTOR` with the fine-envelope edge search described above, and add the matching tail search. Keep `MAX_ONSET_MS` (200) as the extension cap and add a `MAX_TAIL_MS`. Document *why* each constant has the value you land on, citing the measurements in this plan — this codebase's comments carry reasoning, not restatement.

The critical structural property, unchanged from the previous plan: **`measureContour` must receive the tone window**, sliced as `samples.slice(a, b + 1)` where `a`/`b` come from `longestVoicedRun` ± `PAD_MS`, and faded before measuring. Only the *clip* window moves. If you find yourself measuring the contour over the extended slice, stop — that shifts every corridor in the game.

`cutClip` returns:
- `samples` — the clip window: `[onsetStart, tailEnd]`
- `durationMs` — the tone window only, unchanged
- `onsetMs` — `(a - onsetStart) / sampleRate * 1000`
- `tailMs` — `(tailEnd - b) / sampleRate * 1000`
- `contour`, `pinnedFraction` — over the faded tone window, unchanged

- [ ] **Step 4: Run the tests until they pass**

```bash
npx vitest run src/dev/clipCut.test.ts
```

Expected: PASS, including every pre-existing test in the file. Expect to iterate on thresholds here — that is the intended shape of this task. If a criterion proves unreachable, say which and by how much rather than loosening the assertion.

- [ ] **Step 5: Prove the tone window did not move**

Write a throwaway script under `.superpowers/sdd/2026-08-09-clip-edges/` (NOT in `src/`; delete it when done) that runs `cutClip` over all 120 takes and compares each `durationMs`/`contour` against the `durationS`/`contour` already in `public/ref/manifest.json`. Report the maximum absolute chao difference and the count of clips whose voiced-frame count differs.

Expected: **zero frame-count differences, max difference 0.** Anything else means the tone window moved; stop and report BLOCKED.

- [ ] **Step 6: Prove the anchors are untouched**

```bash
npm run make-ref-clips
git diff --stat fixtures/anchors
```

Expected: no output. The four `ma` anchors are nasal-onset and must be unaffected.

- [ ] **Step 7: Full suite**

```bash
npm run test && npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/dev/clipCut.ts src/dev/clipCut.test.ts
git commit -m "fix(clips): find clip edges on a fine envelope, and decline to guess

The 46ms pitch frame cannot see a 10ms stop burst, so short onsets and
natural decays were clipped; and the energy walk had no notion of where
the chosen attempt begins, so on nine clips it reached into the other
attempt in the same take. Where no clean boundary is visible the cutter
now keeps the 45ms pad rather than guessing."
```

---

## Task 2: Carry `tailS` into the manifest and regenerate

**Files:**
- Modify: `src/dev/make-clips.ts`
- Regenerate: `public/ref/*.wav`, `public/ref/manifest.json`

**Interfaces:**
- Consumes: `CutClip.tailMs` and `CutClip.onsetMs` from Task 1.
- Produces: each manifest clip carries `onsetS` (existing) and gains `tailS`, both in seconds to 3dp. Absent means 0. Task 3 parses it.

- [ ] **Step 1: Thread `tailMs` through**

Add `tailMs: number` to the `Cut` interface in `src/dev/make-clips.ts` beside the existing `onsetMs`, populate it from the cut result, and emit `tailS: Number((c.tailMs / 1000).toFixed(3))` in the manifest entry immediately after `onsetS`.

- [ ] **Step 2: Regenerate**

```bash
npm run make-clips
```

Expected: `120 clip(s) -> public/ref/, manifest.json written.`

- [ ] **Step 3: The verification gate**

Copy the manifest aside before regenerating. After, write a throwaway script (under `.superpowers/sdd/2026-08-09-clip-edges/`, deleted when done) that loads both, parses them as JSON — **not** a text diff, since each clip is one line and the whole line shows as changed — and for every clip id asserts `durationS`, `polyline` and `contour` are deeply equal, and that the only new key is `tailS`.

Expected: 120/120 clips, zero mismatches. If any corridor moved, STOP and report BLOCKED. Do not adjust a tolerance.

- [ ] **Step 4: Report the distribution**

Print, for the report: how many clips have a non-zero `onsetS` and non-zero `tailS`, the min/max of each, how many are at the caps, and the values for `chang2`, `ba1`, `ba2`, `ba3`, `hao3`.

Sanity expectations from the measurements: `ba3` and `hao3` at or near 0 onset; `chang2` above 0.08; `ba2` gaining a little; most clips gaining some tail.

- [ ] **Step 5: Suite, then commit**

```bash
npm run test && npm run typecheck
git add src/dev/make-clips.ts public/ref
git commit -m "feat(clips): regenerate with both edges restored

manifest gains tailS. durationS, polyline and contour byte-identical."
```

---

## Task 3: Read `tailS` in the game

**Files:**
- Modify: `src/game/words.ts`, `src/audio/reference.ts`
- Test: `src/game/words.test.ts`, `src/dev/manifest.test.ts`

**Interfaces:**
- Consumes: the `tailS` field from Task 2.
- Produces: `Word` gains `tailS: number` — always finite and ≥ 0, defaulted to 0. The full audible length of a clip is `onsetS + durationS + tailS`.

- [ ] **Step 1: Write the failing tests**

Mirror the existing `onsetS` tests in `src/game/words.test.ts` — read them first and follow their shape exactly. Cover: present and read; absent defaults to 0; a nonsense value (string, `NaN`, `Infinity`, negative, `null`) defaults to 0 **without dropping the clip**.

Note the validity rule differs from `onsetS`: `onsetS` must be less than `durationS` because it sits inside the same audio in front of the tone, but a tail has no such relation — bound it by `MAX_DURATION_S` instead. State that reasoning in a comment.

In `src/dev/manifest.test.ts`, add a case asserting every shipped clip has a finite `tailS` ≥ 0, in the same shape as the existing `onsetS` case.

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/game/words.test.ts src/dev/manifest.test.ts
```

- [ ] **Step 3: Implement in `src/game/words.ts`**

Add `tailS: number` to `Word` with a doc comment saying what it is and why it is separate from `durationS` (the corridor's length must not grow when the audio does). Add a reader beside `readOnsetS` and call it in the `words.push` literal.

- [ ] **Step 4: Make the cue cover the tail — `src/audio/reference.ts`**

Three places currently compute the audible length as `onsetS + durationS`. All three must become `onsetS + durationS + tailS`, or the world unfreezes and the microphone opens while the clip is still sounding — and the mic then hears the game's own demo:

- `RefClip` gains `tailS`, populated from `word.tailS` in `loadClip`.
- `cueAudibleUntilMs` in `playToneCue` — the mic gate.
- `cueDurationMsFor` — the freeze window, on **both** the loaded-clip path and the `word` fallback path.

`sweepDelayMs` and `sweepMs` in `src/game/run.ts` are unaffected: the dot still waits out `onsetS` and still traces the corridor in `durationS`. The tail is audible after the dot finishes, which is correct — the word is decaying.

- [ ] **Step 5: Run to verify they pass, and fix the type fallout**

```bash
npm run test && npm run typecheck
```

Add `tailS: 0` to any `Word` literal that fails to compile. Do not loosen the type to `tailS?: number`.

- [ ] **Step 6: Commit**

```bash
git add src/game/words.ts src/game/words.test.ts src/dev/manifest.test.ts src/audio/reference.ts
git commit -m "feat(game): read tailS, and let the cue cover the decay

The freeze window and the mic gate both span the whole audible clip now;
the corridor and the demo dot still measure the tone alone."
```

---

## Task 4: Update the documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/PRD.md`

- [ ] **Step 1: Correct the onset paragraph in `CLAUDE.md`**

The clip-inventory section currently describes the energy-threshold backoff added on 9 Aug. That mechanism is gone. Rewrite that paragraph to describe what the cutter now does, and — this is the part worth writing down — **why the "decline to guess" rule exists**: each raw take holds two attempts, the energy walk had no notion of the boundary between them, and on nine clips it glued the previous attempt's creak onto the front of the word. Record that a take contains two attempts, because nothing else in the repo says so and it is not visible from the code.

Also update the "three clocks" paragraph: there are now four spans on one cue — `onsetS` before the tone, `durationS` of tone, `tailS` after it, and the corridor which measures `durationS` alone.

- [ ] **Step 2: Amend PRD §9**

Append an `⚠️ Amended (9 Aug 2026)` block in the style of the existing ones — never rewrite the original text. Say that clips carry the syllable's decay as well as its onset, that the corridor still measures the voiced window alone, and that where the cutter cannot see a clean boundary it keeps the old padding rather than guessing.

- [ ] **Step 3: Verify and commit**

```bash
npm run test && npm run typecheck
git add CLAUDE.md docs/PRD.md
git commit -m "docs: record the edge-finding rule and the two-attempt takes"
```

---

## Self-Review Notes

**Coverage.** The user's ask was "make sure the clips in `public/ref/` let us fully hear everything". Task 1 finds both edges and stops borrowing from the neighbouring attempt; Task 2 ships it; Task 3 makes the game play and wait for the whole thing; Task 4 records it.

**The load-bearing assumption**, stated so a reviewer can attack it: slicing the tone window exactly as before means `measureContour` receives byte-identical samples, so every `polyline`, `contour` and `durationS` is unchanged. Task 1 Step 5 and Task 2 Step 3 are the gates. If either fails the plan stops rather than being worked around.

**Deliberately left alone:** which of the two attempts gets cut (`longestVoicedRun` picks the longer — changing that is a separate question), and the Tone 3 corridors, which remain synthetic per CLAUDE.md.

**Known residual risk:** the acceptance criteria are amplitude thresholds, which are a proxy for "sounds complete". They cannot catch a clip that is intact but starts with a click, or one where the two attempts overlap so closely that no boundary exists. A human listening pass is still required before merge.
