"""Brief 39 bench - Praat as the pitch reference (the standard tool in speech research).

Offline, dev-only. Reads local clips, writes numbers only (JSON) to
node_modules/.cache/bench39/ref-praat/. Uses Praat's autocorrelation pitch
method with Praat's own default settings, except the search range 55-600 Hz
(wider than the app's 70-400 Hz, so the reference can see what the app cannot).

Setup (once):
  python3 -m venv node_modules/.cache/bench39/venv
  node_modules/.cache/bench39/venv/bin/pip install praat-parselmouth
Run:
  node_modules/.cache/bench39/venv/bin/python src/dev/bench39/praat-ref.py
"""
import json, os, glob, sys
import numpy as np
import parselmouth

SETS = {
    "textbook": "fixtures/clips/jane",
    "natural": "fixtures/clips/jane/natural",
    "captures": "fixtures/captures",
    "tonepairs": "fixtures/tonepairs/wav",
    # Brief 41: Pierre (male learner). Own block, never part of Jane's baseline.
    "pierre": "fixtures/captures/pierre",
}
# Search floor per set. Pierre's floor is 40 Hz so the share of his frames under
# 55 Hz can be measured at all (at 55 Hz Praat cannot report anything lower).
FLOOR = {"pierre": 40.0}
ONLY = sys.argv[1:]  # optional: set names to (re)make, e.g. `praat-ref.py pierre`
OUT = "node_modules/.cache/bench39/ref-praat"
for name, d in SETS.items():
    if ONLY and name not in ONLY:
        continue
    os.makedirs(f"{OUT}/{name}", exist_ok=True)
    n = 0
    for f in sorted(glob.glob(f"{d}/*.wav")):
        snd = parselmouth.Sound(f)
        pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=FLOOR.get(name, 55.0), pitch_ceiling=600.0)
        t = pitch.xs()
        f0 = pitch.selected_array["frequency"]
        f0 = np.nan_to_num(f0)
        strength = np.nan_to_num(pitch.selected_array["strength"])
        out = {
            "sr": snd.sampling_frequency, "durS": snd.duration,
            "t": [round(float(x), 4) for x in t],
            "f0": [round(float(x), 2) for x in f0],
            "peak": [round(float(x), 3) for x in strength],
            "trusted": [1 if x > 0 else 0 for x in f0],
        }
        with open(f"{OUT}/{name}/{os.path.basename(f)[:-4]}.json", "w") as fh:
            json.dump(out, fh)
        n += 1
    print(name, n)
