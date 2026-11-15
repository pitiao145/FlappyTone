# Report: 46 Pairs: one shared way to find the syllables
- Result: **blocked** at step 1 (measure). A premise is false. No production code changed.

## What changed
- New: `src/dev/bench39/split46.mjs` (dev-only, offline, numbers only). Brief status → blocked. This report, handover entry.
- Not touched: `src/game/`, `src/site/`, `src/ui/`, `src/pitch/`, the clip pipeline, the scorecard baseline.

## Why blocked
The brief says: take the pipeline's own `syllableSpans` as the true boundary. For natural pairs that is not a true boundary.

1. **`shapes-v2.json` does not store `syllableSpans`.** (MEASURED: its rows have `polyline, contour, onset_s, duration_s, adjusted, fitNodesAdded, knee` only.) I measured the spans again with the same code and settings (`multiSyllableSpan`, centre `ruler.measuredAtHz` 197 Hz, per-clip gate). This part is a small gap, not the reason to stop.
2. **For natural pairs the pipeline's spans are mostly a guess.** (MEASURED, `node src/dev/bench39/split46.mjs`, first lines.)
   - Natural: only 59 of 215 words have a real silence between syllables. 156 are cut by the pipeline's fallback: "split the longest voiced stretch at its quietest frame, 20% in from each end".
   - Of the 203 natural pairs, **79 (39%)** have a reference cut that is not a boundary: in 52 the cut sits exactly on the edge of the search window (the voice just gets quieter toward the end, so the "quietest frame" is wherever the search stops), and 55 have no real dip (the quiet point is above 0.7 × the quieter side's loudest frame).
   - Textbook is fine: 175 of 220 have a real silence; of the 44 dip-cut pairs, 2 are doubtful.
   So "boundary error in ms" on natural measures the distance to an artefact. The natural row of the table below cannot pick a splitter.
3. **"Right count %" cannot fail for (b) and (c).** Once the expected count is known, these splitters always cut until the count fits. Every one scores 100.0% on both styles. The acceptance "wrong-tone reads on pairs not split correctly: 0" is then also always true. Neither number tests the splitter. (In plain words: if you always cut a word in two, you always get two pieces. That says nothing about whether you cut in the right place.)

## Step 1 numbers (MEASURED, `node src/dev/bench39/split46.mjs`)
Live tracker frames (cache `live`: floor 1e-4, `minVoicedRunMs` 64). 411 pairs (no neutral tone: 208 textbook, 203 natural). "Longer" = 12 + 12 words of 3–4 syllables without a neutral tone (the brief's 34 includes 10 with a neutral tone).
Reading on the Phase A board, flag off (the scorecard's section 4). The ruler (flag on) gives the same picture, 1–5 points lower on textbook.

| splitter | style | n | right count % | boundary err median / p90 ms | within 50 ms % | both tones right % |
|---|---|---|---|---|---|---|
| a silence > 150 ms (today) | textbook | 208 | 67.3 | 21 / 53 | 90.0 | 57.7 |
| a | natural | 203 | 3.9 | 21 / 32 | 100.0 | 3.4 |
| b silence 150 + loudness dip | textbook | 208 | 100.0 | 21 / 53 | 86.5 | **74.0** |
| b | natural | 203 | 100.0 | 32 / 469 | 55.2 | 8.4 |
| b silence 60 + dip | textbook | 208 | 100.0 | 32 / 96 | 78.8 | 70.2 |
| b | natural | 203 | 100.0 | 21 / 352 | 69.0 | 7.9 |
| c silence 60 + pitch reset ≥ 2 st + dip | textbook | 208 | 100.0 | 32 / 213 | 76.4 | 69.7 |
| c | natural | 203 | 100.0 | 32 / 341 | 68.5 | 8.4 |
| c with reset ≥ 1 st | textbook | 208 | 100.0 | 32 / 299 | 73.1 | 70.2 |
| c | natural | 203 | 100.0 | 32 / 341 | 62.6 | 9.4 |

Longer words (12 each), b silence 150 + dip: right count 100%, boundary p90 64 ms textbook / 288 ms natural; all syllables right 58.3% textbook, 0% natural.

Wrong-tone reads on wrong-count pairs: today (a) 51 textbook, 116 natural; (b) and (c) 0 by construction (see point 3). Wrong reads where the cut is more than 80 ms from the reference: b150 6 textbook, 33 natural (the natural ones partly measure the artefact).

**Per-syllable reader with the reference cut** (oracle cut, live frames):

| grid | style | syllables right % | "?" % | wrong % | pairs both right % |
|---|---|---|---|---|---|
| old board, flag off | textbook | 85.8 | 2.6 | 11.5 | 76.0 |
| old board | natural | 39.2 | 44.8 | 16.0 | 9.4 |
| ruler, flag on | textbook | 83.7 | 2.4 | 13.9 | 72.1 |
| ruler | natural | 40.9 | 40.6 | 18.5 | 7.9 |

What this says, with the textbook reference (which is sound):
- On textbook, splitter **b (silence 150 ms, then loudness dip)** is as good as the oracle cut: 74.0% vs 76.0% both right (old board). The reader is the limit there, not the splitter.
- On natural, the reader is the limit too, by far: even with the reference cut, 41–45% of natural syllables read "?", and only 8–9% of pairs are both right. Of the 406 natural syllables, 130 are shorter than `minUtteranceMs` (160 ms), so rule 8 makes them "?"; the reader calls 44 more "none" (MEASURED, scratch script, old board). The 60% natural target cannot be reached by any splitter. (ASSUMED that a better natural reference would not change this much: the "?" share comes mostly from syllable length, which a different cut moves only a little.)
- The pitch-reset rule (c) did not help: same or worse boundaries than (b).

## Checks run
- `node src/dev/bench39/split46.mjs`: as above (31 s).
- No `npm run test` / `typecheck` / `bench` / build: no app, pitch or scorecard file changed.

## Needs Pierre's eyes (decisions)
1. **Natural boundaries: what is the truth?** Options: (a) judge the splitter on textbook only, and on natural only by "both right" and "?" share; (b) a better reference for natural, e.g. Praat intensity + pitch together, or hand marks on a sample of ~40 natural pairs; (c) forced alignment (needs a new tool: ask first).
2. **When may a splitter say "found"?** Today's (b) always cuts. To make "right count" and "no wrong read on a bad split" real tests, the dip must be real (for example trough under 0.7 × the quieter side's peak), else the word reads "?". On natural pairs that would turn about half of all reads into "?". Is that the wanted trade (rule 8), or is a forced cut acceptable because pair gates take no heart?
3. **Acceptance numbers.** Textbook both right 75%: b reaches 74.0% (old board) / 69.7% (ruler); the oracle cut reaches 76.0 / 72.1, so the reader caps it. Natural 60%: out of reach while 40% of natural syllables are too short to read. Lower the stretch numbers, or let 46 ship on the splitter numbers only, with the reader as a later brief?

## Follow-ups
- If Pierre picks (1a) and a real-dip rule: rerun 46 with "count right %" defined as "count found AND every cut within 50 ms of a textbook reference", and the dip rule in splitter b.
- The pipeline's own dip fallback has the same edge artefact (39% of natural pairs). That affects the natural pair shapes in `shapes-v2.json` (their corridor joins), not only this brief. Worth its own check before brief 48.
