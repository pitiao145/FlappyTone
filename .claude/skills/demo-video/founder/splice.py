"""Check a cut by ear-proxy: splice a props file's segments and transcribe them.

    python3 -I splice.py <whisperDir> video/props/<name>.json [from-segment to-segment]

Writes the spliced voice to a temp wav and prints Whisper's transcript and the
total length. Read every join: a swallowed word ("a bird" gone) or a leftover
one ("I" before the next line) means a cut point is wrong. Whisper's language
model can also invent a joining word: re-check a suspect join by splicing just
those two segments (the optional range, 0-based, inclusive).
Also regenerates the props file's `captions` from each segment's `say` chunks.
"""
import json, os, subprocess, sys, tempfile

whisper, props = sys.argv[1], sys.argv[2]
d = json.load(open(props))
segs = d["segments"]
lo, hi = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (0, len(segs) - 1)
pub = os.path.join(os.path.dirname(props), "..", "public")

# captions: each segment's `say` chunks share its time, weighted by length
caps = []
for s in segs:
    say = s.get("say") or []
    a, b = s["from"] + 0.06, s["to"] - 0.08  # islands carry lead/tail padding
    w = [len(c) + 4 for c in say]; t = a
    for j, (c, x) in enumerate(zip(say, w)):
        dt = (b - a) * x / sum(w)
        end = s["to"] if j == len(say) - 1 else round(t + dt, 2)
        caps.append({"text": c, "from": {"shot": s["shot"], "t": round(t, 2)}, "to": {"shot": s["shot"], "t": end}})
        t += dt
if caps:
    d["captions"] = caps
    json.dump(d, open(props, "w"), indent=1, ensure_ascii=False)

pick = segs[lo: hi + 1]
inp, fc = [], []
for k, s in enumerate(pick):
    if s.get("still"):  # a held picture: silence
        inp += ["-f", "lavfi", "-t", str(s["to"] - s["from"]), "-i", "anullsrc=r=48000:cl=mono"]
        fc.append(f"[{k}:a]asetpts=PTS-STARTPTS[a{k}]")
        continue
    inp += ["-i", os.path.join(pub, d["shots"][str(s["shot"])])]
    fc.append(f"[{k}:a]atrim={s['from']}:{s['to']},asetpts=PTS-STARTPTS[a{k}]")
fc.append("".join(f"[a{k}]" for k in range(len(pick))) + f"concat=n={len(pick)}:v=0:a=1[o]")
wav = os.path.join(tempfile.mkdtemp(), "cut.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, "-filter_complex", ";".join(fc), "-map", "[o]", "-ac", "1", "-ar", "16000", wav], check=True)
print(subprocess.run([os.path.join(whisper, "main"), "-m", os.path.join(whisper, "ggml-medium.en.bin"), "-f", wav, "-np"],
                     capture_output=True, text=True).stdout)
print(f"{len(pick)} segments, {sum(s['to'] - s['from'] for s in pick):.1f} s, {len(caps)} captions")
