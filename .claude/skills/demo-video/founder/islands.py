"""Find each take's speech islands and transcribe them one by one.

    python3 -I islands.py <whisperDir> <shot1.wav> [shot2.wav ...]

whisper.cpp 1.5.5 word timestamps drift by seconds, so cuts come from loudness
instead: 10 ms RMS, speech = floor (10th percentile) + 10 dB, gaps under 0.3 s
merged (a gap of 0.3 s or more is a pause the edit removes), padded
-0.08 s / +0.10 s. Each island is transcribed alone (with 0.5 s of silence
around it), which is accurate. Prints `[shot, from, to]  text` rows, ready to
paste into a props file's segments, and writes islands.json beside the wavs.
"""
import json, os, re, subprocess, sys, tempfile, wave
import numpy as np

whisper, wavs = sys.argv[1], sys.argv[2:]
model = os.path.join(whisper, "ggml-medium.en.bin")
tmp = tempfile.mkdtemp()
out = {}

for path in wavs:
    shot = int(re.search(r"(\d+)\.wav$", path).group(1))
    w = wave.open(path)
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    n = len(a) // 160
    db = 20 * np.log10(np.sqrt((a[: n * 160].reshape(n, 160) ** 2).mean(1)) + 1e-9)
    on = db > np.percentile(db[db > -100], 10) + 10
    runs, start = [], None
    for k, v in enumerate(on):
        if v and start is None: start = k
        if not v and start is not None: runs.append([start, k]); start = None
    if start is not None: runs.append([start, n])
    merged = []
    for p, q in runs:
        if merged and p - merged[-1][1] < 30: merged[-1][1] = q
        else: merged.append([p, q])
    rows = []
    for p, q in merged:
        if q - p < 15: continue
        lo, hi = round(max(0, p / 100 - 0.08), 2), round(min(n / 100, q / 100 + 0.10), 2)
        seg = np.concatenate([np.zeros(8000, np.float32), a[int(lo * 16000): int(hi * 16000)], np.zeros(8000, np.float32)])
        f = os.path.join(tmp, "isl.wav")
        o = wave.open(f, "wb"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(16000)
        o.writeframes((seg * 32767).astype(np.int16).tobytes()); o.close()
        text = subprocess.run([os.path.join(whisper, "main"), "-m", model, "-f", f, "-nt", "-np"],
                              capture_output=True, text=True).stdout
        text = " ".join(text.split())
        rows.append({"shot": shot, "from": lo, "to": hi, "text": text})
        print(f"[{shot}, {lo:5.2f}, {hi:5.2f}]  {text}")
    out[shot] = rows

json.dump(out, open(os.path.join(os.path.dirname(wavs[0]), "islands.json"), "w"), indent=1)
