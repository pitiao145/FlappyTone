"""Brief 49 bench - Praat's loudness (intensity) curve, the second half of
"Praat's view of the clip" used to mark a reference cut in pairs that have no
silence between the syllables. Pitch comes from praat-ref.py's cache.

Offline, dev-only. Reads local clips, writes numbers only (JSON) to
node_modules/.cache/bench39/ref-praat-int/. Praat's own default intensity
settings, except the minimum pitch (75 Hz for Jane, 60 Hz for Pierre), which
sets the analysis window (3.2 / min pitch).

Run (venv from praat-ref.py):
  node_modules/.cache/bench39/venv/bin/python src/dev/bench39/praat-int49.py [set ...]
"""
import json, os, glob, sys
import parselmouth

SETS = {
    "textbook": "fixtures/clips/jane",
    "natural": "fixtures/clips/jane/natural",
    "pierre": "fixtures/captures/pierre",
}
MIN_PITCH = {"pierre": 60.0}
ONLY = sys.argv[1:]
OUT = "node_modules/.cache/bench39/ref-praat-int"
for name, d in SETS.items():
    if ONLY and name not in ONLY:
        continue
    os.makedirs(f"{OUT}/{name}", exist_ok=True)
    n = 0
    for f in sorted(glob.glob(f"{d}/*.wav")):
        snd = parselmouth.Sound(f)
        it = snd.to_intensity(minimum_pitch=MIN_PITCH.get(name, 75.0), time_step=0.01)
        out = {
            "t": [round(float(x), 4) for x in it.xs()],
            "db": [round(float(x), 2) for x in it.values[0]],
        }
        with open(f"{OUT}/{name}/{os.path.basename(f)[:-4]}.json", "w") as fh:
            json.dump(out, fh)
        n += 1
    print(name, n)
