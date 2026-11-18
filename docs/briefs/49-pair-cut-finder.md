---
status: ready
notion_task:
risk: low
---
# 49 Pairs: find the cut between two syllables (and the low-only third tone)

## Goal
The pair read tells a learner how **each syllable** of a two-syllable word sounded. Today it often names the wrong tones because the cut between the syllables lands in the wrong place. Test on 18 Nov 2026 (test guide, test 7): Pierre followed the target line of 公園 gōngyuán closely (tone accuracy 76–86%), yet 0 of 7 tries named both tones right, in both foundations. Syllable 1 came out "?", T4 or T3; syllable 2 often came out T3. Natural pairs read both right only ~8% of the time (brief 48).

Find a better way to place the cut. It must work for **all 16 tone pairs** (first to fourth tone × first to fourth tone) and in **both speech styles** (textbook and natural). Keep reading each syllable on its own.

Part 2 (small, same reader): in Natural style, a third tone that only goes low and does not rise again (the normal everyday form) is sometimes read "none". It should read as a third tone.

## Read first
- `docs/briefs/refs/39-test-guide.md` (Test session notes, test 6 and test 7) and `docs/briefs/refs/39-handover.md`.
- Reports `45-reader-on-new-ruler.md`, `46-pairs-one-syllable-finder.md`, `47-visualiser-honest-target.md`.
- `src/game/syllables.ts` (today's finder: silence 150 ms, then a real loudness dip, else "?"), `src/dev/stretchPairs.ts` (time-stretch of the player's pair onto Jane's), `src/game/toneClassifierV2.ts`, `src/game/freeAttempts.ts`, `src/game/visualiserCore.ts`, `src/site/checker/engine.ts`.
- `src/dev/bench39/README.md`, `split46.mjs`, `pairs46.mjs`, `pierre.mjs`.

## Approaches to measure (Pierre's ideas 1 and 2, decided 19 Nov 2026)
Measure all of them on the same frames before choosing:
- **(0) Today:** `findSyllables` as shipped on this branch.
- **(1) Middle:** cut at half the voiced length of the word. The baseline.
- **(2) Expected spot, then search nearby (preferred going in):** for each of the 16 tone pairs and each style, learn from Jane's clips where the join usually sits (share of the word length, and what pitch and loudness do there, e.g. 1+2: the high flat ends and the drop starts; 3+2: the low point). At read time, search only a window around that spot and take the strongest sign inside it: silence, then loudness dip, then the pitch event typical for the pair.
- **(3) Lay Jane's pair over the player's line:** stretch Jane's version of the word in time onto the player's (reuse `stretchPairs.ts`), then cut where Jane's known join lands.
Combinations (for example (2) with (3) as a fallback) are allowed if the numbers favour them.

## The rule that must hold (anti-goal)
The target word may only decide **where** to cut. Each half is then read **without** the target. A reader that tells every learner "you said it right" is a failure even when its numbers look good. When the cut is unsure, the read is "?" for that syllable, never a guessed tone (hard rule 8).

## Do
1. **Measure first, change nothing in the app.** References for the cut: Jane's pairs that have a real silence between the syllables (textbook 175, natural 59; brief 46). For pairs without a silence, use Praat's view of the clip (pitch and intensity) to mark a reference where it is clear, and leave the rest out of the cut-error numbers (say how many).
2. Run approaches (0)–(3) on the live tracker frames. Per tone pair (16) and per style, report: cut error in ms (median, p90), both syllables right %, a wrong tone named %, "?" %.
3. **Label-swap test** for the rule above: read every pair clip once with its true label and once with a wrong pair label (for example 1+2 read as 4+2). The tone names must not move toward the wrong label. Report the share that changed.
4. **Pierre's takes** (`fixtures/captures/pierre/`, local, gitignored): his 8 natural pairs from brief 41 are there now; a fuller set (16 tone pairs × textbook and natural × 2 takes) is coming, file names `pierre_<pinyin><tones>_<textbook|natural>_<take>.wav`, possibly as one long recording per style that you cut into takes yourself. If the fuller set is not there when you reach this step, ask Pierre in this session and go on with what exists. He is a learner: list the syllables where Praat itself shows a shape that is not the intended tone, so the reader is not blamed for them. Must hold: in 1+2 words (公園, 工人), syllable 1 is never read as a fourth tone.
5. Ship the winner in `src/game/syllables.ts` (or next to it) for the game, the Visualiser and the public checker (one shared function, as in brief 46). Keep it pure: no Web Audio, no React. Any new number is a `tuning()` field with a Lab knob.
6. **Part 2:** check the low-only third tone on Jane's natural single third tones and on Pierre's natural takes. If the reader says "none" where Praat shows a clear low-only third tone, fix it in Natural style only, without new wrong reads of second tones.
7. Information only, do not change: would the winner also fix the clip pipeline's natural pair cuts (39% on an artefact, brief 46)? Give the number. The pipeline stays as it is.

## Constraints
- Branch `research/39-pitch-foundation` line of work; never push, deploy or merge. No writes to Supabase, R2, the Worker or PostHog.
- Hard rules 5, 6, 8, 10, 12 (Pierre's audio stays local, never committed or uploaded). If `src/pitch/` changes: fixture tests pass and a before/after `npm run report`, naming which of fit/lag/wiggle/voiced% moved, also the ones that got worse.
- `npm run classifier-check`: "wall hits on a correct speaker" stays 0. Reads never cost a heart.
- Ask before adding a dependency.

## Acceptance checks
- The comparison table from step 2 exists for all 16 pairs × 2 styles × 4 approaches.
- Winner, both syllables right, of all pairs: textbook ≥ today's 74%; natural clearly above today's ~8% (report the number; aim ≥ 50%). Wrong tone named on a badly cut pair: 0 (must be "?").
- Label-swap: names move toward the wrong label in ≤ 2% of reads.
- Pierre's 1+2 takes: syllable 1 never read as T4.
- Part 2: Jane's natural low-only third tones read as third tone ≥ 90%, and second-tone wrong reads do not go up.
- `npm run test`, `npm run typecheck`, `npm run bench` (0 FAIL), `npm run build` + the hard rule 7 grep.

## Report back with
- `docs/briefs/reports/49-pair-cut-finder.md`: the tables, the winner and why, the tone pairs that still fail, the label-swap number, Pierre's takes result, Part 2 result, the pipeline number from step 7. Handover entry.
