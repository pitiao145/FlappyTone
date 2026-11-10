# Report: 41 Pierre's voice: intake, and the first male learner numbers
- Result: done

## What changed
- `src/dev/bench39/pierre.mjs` (new): Pierre's block. Information only: no baseline, no PASS/FAIL.
- `src/dev/bench39/scorecard.mjs`: prints the block after Jane's numbers. Exit code unchanged.
- `src/dev/bench39/praat-ref.py`: set `pierre`, search floor 40 Hz for that set only, optional set filter (`praat-ref.py pierre`).
- Audio: `fixtures/captures/pierre/` (gitignored, never committed). Three phone files (`talk`, `singles`, `pairs`, AAC 16 kHz) became 42 WAV files at 48 kHz, cut at the pauses: 24 singles, 16 pairs, `pierre_talk_1`, `pierre_silence_1`. The order was checked with Praat (each single shows the shape of its tone cycle; both 媽媽 takes are flat). `calibration.json` copied from the phone's Safari storage.

## Checks
- `npm run bench`: 209 Jane numbers, 0 FAIL, exit 0. The `pierre` block prints after them. MEASURED.
- `npm run test` 1824 passed; `npm run typecheck` clean; `npm run build` + hard-rule-7 grep prints nothing. MEASURED.

## His voice (MEASURED, `node src/dev/bench39/pierre.mjs`; Praat floor 40 Hz)
- Median pitch: talk **127.5 Hz**, tone syllables 131.3 Hz, saved calibration centre 129.1 Hz.
- Praat frames under 70 Hz / under 55 Hz: talk 0.0% / 0.0%; singles 1.9% / 1.1%; pairs 0.9% / 0.5%.
- Singles, creak out, semitones from talk median, lowest (5th pct) | highest (95th pct): T1 1.3 | 5.3; T2 −3.1 | 5.5; T3 −4.0 | 3.6; T4 −4.1 | 9.4.
- Live tracker (same settings as Jane's bench, centre = his calibration):

| group | voice heard | error, delay removed, med / p90 (st) | delay |
|---|---|---|---|
| T1 | 87.6% | 0.03 / 0.20 | 40 ms |
| T2 | 87.8% | 0.06 / 0.31 | 40 ms |
| T3 | 81.7% | 0.11 / 0.57 | 40 ms |
| T4 | 81.7% | 0.12 / 0.34 | 40 ms |
| pairs | 91.2% | 0.06 / 0.26 | 40 ms |

  Jane for comparison (handover): T3 p90 0.28–0.32, T4 0.37–0.44. His T3 p90 (0.57) is worse; the rest is in Jane's range.
- Creak (Praat under 72 Hz = 10 st under his middle, Jane's rule): 1.0% of voiced frames. The tracker draws 10% of those frames, and when it draws, it draws about an octave too high (med +11.9 st, all over +6 st). Small share, wrong when it happens.

## Step 3: real range vs three grids (MEASURED)
Real range = 5th–95th pct of his tone syllables, creak out: **102.5–185.1 Hz**. Gap > 0: his voice goes past the grid. Gap < 0: spare room.

| grid | centre Hz | bottom–top Hz | gap at top (st) | gap at bottom (st) |
|---|---|---|---|---|
| (a) saved calibration (up 2, down 3.75) | 129.1 | 103.9–144.9 | **+4.24** | +0.25 |
| (b) Jane halves (+8.8/−7.9) around talk median | 127.5 | 80.8–212.0 | −2.35 | −4.11 |
| (c) Jane halves around tone-syllable median | 131.3 | 83.2–218.3 | −2.86 | −3.60 |

**Standard grid fits.** It does not miss: it is bigger than his range by 2.4–2.9 st at the top and 3.6–4.1 st at the bottom. His saved calibration misses badly at the top (4.2 st): its "up" is 2, which is the floor clamp (`RANGE_UP_SEMITONES_MIN`, READ IN CODE `src/pitch/calibration.ts:100`), so the phone calibration measured almost no rise.

## Step 4: reader on (a), (b), (c) (MEASURED)
"Clean" = clips where the Praat shape check says he said the intended tone.

| grid | singles right | singles, clean | pairs split in two | pairs both right | pairs both right, clean |
|---|---|---|---|---|---|
| (a) | 20/24 | 18/22 | 5/16 | 4/16 | 4/9 |
| (b) | 19/24 | 19/22 | 5/16 | 4/16 | 4/9 |
| (c) | 20/24 | 20/22 | 5/16 | 3/16 | 3/9 |

- On (b) and (c) the misses on singles are mostly third tone read as second (ma3, shu3, yi3). On (a) second tone is read as third (shu2, yi2). His second and third tones have a similar dip-then-rise in Praat; the grid decides which side wins.
- Pairs: the reader splits only 5 of 16 in two. Same weakness as Jane's natural speech (3.9% split). It is the pair split, not his voice.
- Praat shape not the intended tone (11 syllables, not the reader's fault): ma3_1 (looks T2), shu3_2 (looks T4), bangmang12_2 syl 1 (T4), gongren12_2 syl 1 (T4), haowan32_1 syl 1 (unclear), keneng32_1 syl 1 (T1) and syl 2 (T4), nihao33_1 syl 2 (T2), niunai23_1 syl 2 (T2), niunai23_2 syl 1 (T4) and syl 2 (T2).
- The shape check is a rough rule set on Praat's contour, and pairs are split at the longest silent gap (ASSUMED good enough to flag clips, not to grade him). 你好 is expected as 2+3 (sandhi); 媽媽 counts only its first syllable.

## Surprises
- The recordings are phone AAC at 16 kHz, not booth WAV. Converted to 48 kHz; nothing above 8 kHz exists in them. Pitch is not affected; voice-loudness numbers are not comparable with Jane's booth clips. ASSUMED harmless for pitch.
- The saved calibration's "up" is at the clamp (2 st). The current top-from-first-tone step failed for him.
- Praat's search floor had to go to 40 Hz for his set, or "under 55 Hz" would always be 0.

## For brief 42 and 44
- 42 (band): he has ~1–2% of tone frames under 70 Hz, ~1% under 55 Hz, all creak at the low end of T3/T4. Lowering the band to ~55 Hz would reach most of it; creak itself stays unreliable (octave too high when drawn). Talk has no frames under 70 Hz.
- 42 (delay): 40 ms for him too.
- 44 (calibration): a middle from his talk (127.5 Hz) is within 1.2% of his calibration centre and of his tone median. A standard grid around it holds all his tones with room to spare, so "middle + standard grid" works for a male learner. The old top step gave up = 2 st (4.2 st miss). Spare room of 2–4 st means his tones use less of the screen; slow learning in play should shrink it.
- 45 (reader): second vs third tone is the main single-tone confusion for him, and it flips with the grid.

## Needs Pierre's eyes
- Whether to re-record in the booth (`/record`, WAV) for loudness numbers.
