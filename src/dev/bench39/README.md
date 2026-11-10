# bench39 — offline test bench for brief 39 (pitch foundation review)

Dev-only. Plain Node scripts (`.mjs`), not imported by the app, not in `dist/`.
They read the local audio under `fixtures/` (gitignored) and write only numbers
to `node_modules/.cache/bench39/` (also ignored). No audio leaves the machine.

Run from the repo root, in this order:

```bash
node src/dev/bench39/inventory.mjs      # what each fixture folder really is
node src/dev/bench39/ref-test.mjs       # the reference, checked on known glides
node src/dev/bench39/build-ref.mjs      # reference contour for every clip (~30 s)
node src/dev/bench39/eval.mjs --worst   # listener vs reference, 5 gate levels (~5 min)
node src/dev/bench39/detail.mjs         # error split: delay / creak / rest (~3 min first run, cached after)
node src/dev/bench39/gate-t4.mjs        # how often a raised gate removes a low end
node src/dev/bench39/soft.mjs           # gate at its cap + a softer voice
node src/dev/bench39/noise.mjs          # rooms: wind (real), pink (synthetic), talk (real speech) (~8 min)
node src/dev/bench39/voices.mjs         # lower / higher voice STAND-IN (~3 min)
node src/dev/bench39/heights.mjs --worst # target polylines vs what Jane said
node src/dev/bench39/reading.mjs        # classifier v2 and the pair read
```

| File | What it is |
|---|---|
| `ref.mjs` | The independent pitch reference. Written from scratch, shares no code with `src/pitch/`. Method A: normalised cross-correlation + Viterbi path (offline, no delay). Method B: subharmonic summation on an FFT. A frame is "trusted" when both agree within 1 semitone. |
| `tracks.mjs` | Runs the real `PitchTracker` with the clip-pipeline settings (`pipe`) or the live settings (`live`) and caches the numbers. |
| `lib.mjs` | WAV loading and small statistics helpers. |

Limits, stated once:
- The reference is two of my own methods agreeing. It is not Praat. See the report for the dependency decision.
- One speaker (Jane). `voices.mjs` only replays her slower or faster.
- `pink` noise is synthetic. `wind` is about 8 s of real wind from `fixtures/captures/`. `talk` is other Jane clips.
