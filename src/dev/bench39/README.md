# bench39 — offline test bench for brief 39 (pitch foundation review)

Dev-only. Plain Node scripts (`.mjs`), not imported by the app, not in `dist/`.
They read the local audio under `fixtures/` (gitignored) and write only numbers
to `node_modules/.cache/bench39/` (also ignored). No audio leaves the machine.

Run from the repo root, in this order:

```bash
node src/dev/bench39/inventory.mjs      # what each fixture folder really is
node src/dev/bench39/ref-test.mjs       # the reference, checked on known glides
node src/dev/bench39/build-ref.mjs      # built-in reference contour for every clip (~30 s)
# Praat reference (preferred; used automatically when its cache exists):
python3 -m venv node_modules/.cache/bench39/venv
node_modules/.cache/bench39/venv/bin/pip install praat-parselmouth
node_modules/.cache/bench39/venv/bin/python src/dev/bench39/praat-ref.py
node src/dev/bench39/eval.mjs --worst   # listener vs reference, 5 gate levels (~5 min)
node src/dev/bench39/detail.mjs         # error split: delay / creak / rest (~3 min first run, cached after)
node src/dev/bench39/gate-t4.mjs        # how often a raised gate removes a low end
node src/dev/bench39/soft.mjs           # gate at its cap + a softer voice
node src/dev/bench39/noise.mjs          # rooms: wind (real), pink (synthetic), talk (real speech) (~8 min)
node src/dev/bench39/voices.mjs         # lower / higher voice STAND-IN (~3 min)
node src/dev/bench39/heights.mjs --worst # target polylines vs what Jane said
node src/dev/bench39/reading.mjs        # classifier v2 and the pair read
node src/dev/bench39/reader45.mjs [--half fit|held|all] [--confusion] [--accuracy] [--learning] [--pierre]
                                        # brief 45: reader + tone accuracy on Jane's one ruler
node src/dev/bench39/fit45.mjs          # brief 45: coordinate-descent fit of toneReaderRuler on the FIT half
node_modules/.cache/bench39/venv/bin/python src/dev/bench39/praat-int49.py   # brief 49: Praat loudness cache
node src/dev/bench39/cut49.mjs [--summary] # brief 49 step 2: four ways to cut a pair, per tone pair and style
node src/dev/bench39/cut49ship.mjs [--pairs|--swap|--pierre|--praat|--pipe|--emit]
                                        # brief 49: the shipped pair cut, production path; --emit writes src/game/pairCutSpotsData.ts
node src/dev/bench39/t3low49.mjs [--cut] # brief 49 part 2: low-only natural third tone
```

| File | What it is |
|---|---|
| `ref.mjs` | The independent pitch reference. Written from scratch, shares no code with `src/pitch/`. Method A: normalised cross-correlation + Viterbi path (offline, no delay). Method B: subharmonic summation on an FFT. A frame is "trusted" when both agree within 1 semitone. |
| `tracks.mjs` | Runs the real `PitchTracker` with the clip-pipeline settings (`pipe`) or the live settings (`live`) and caches the numbers. |
| `lib.mjs` | WAV loading and small statistics helpers. |

Limits, stated once:
- Two references exist. `praat-ref.py` (Praat 6.1.38 through `praat-parselmouth` 0.4.7, GPL-3, offline, in a local ignored venv) is the answer sheet. `ref.mjs` is the built-in one; the two differ by 0.02 semitone (median) on 829 clips. `BENCH_REF=own|praat` forces one. `eval.mjs` still uses the built-in one.
- One speaker (Jane). `voices.mjs` only replays her slower or faster.
- `pink` noise is synthetic. `wind` is about 8 s of real wind from `fixtures/captures/`. `talk` is other Jane clips.
