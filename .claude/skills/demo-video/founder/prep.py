"""Prepare iPhone talking-head takes for the TalkingHead composition.

    python3 -I prep.py <outDir> <take.MOV>[=<mic.m4a>] ...

Takes are numbered in argument order: outDir/shot1.mp4, shot2.mp4, ...
Each gets: HDR (HLG / Dolby Vision) -> SDR H.264 1080x1920 via macOS avconvert
(this ffmpeg has no zscale, so it cannot tonemap), and a voice track:
  - with `=mic.m4a`: the separate phone-mic recording, synced to the camera
    audio by envelope cross-correlation (prints the offset and match peak;
    a peak under ~0.5 means a wrong pairing),
  - without: the camera's own audio.
Every voice is gain-matched to shot1's speech level, so a camera-only re-take
does not drop in volume. Also writes outDir/shot<i>.wav (16 kHz mono) for
islands.py.
"""
import os, subprocess, sys, tempfile
import numpy as np

SR = 16000


def pcm(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def speech_db(a):
    n = len(a) // 160
    db = 20 * np.log10(np.sqrt((a[: n * 160].reshape(n, 160) ** 2).mean(1)) + 1e-9)
    live = db[db > -100]
    floor = np.percentile(live, 10)
    return float(np.mean(db[db > floor + 10]))


def offset_s(cam, mic):
    """Seconds to delay the mic so it lines up with the camera."""
    def env(x):
        x = np.abs(x); n = len(x) // 16
        e = x[: n * 16].reshape(n, 16).mean(1)
        return e - e.mean()
    c, m = env(cam), env(mic)
    N = 1 << int(np.ceil(np.log2(len(c) + len(m))))
    r = np.fft.irfft(np.fft.rfft(c, N) * np.conj(np.fft.rfft(m, N)), N)
    lag = int(np.argmax(r))
    if lag > N // 2: lag -= N
    peak = r.max() / np.sqrt((c * c).sum() * (m * m).sum())
    return lag / 1000, peak


def main():
    out, takes = sys.argv[1], sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    plan = []
    for i, t in enumerate(takes, 1):
        mov, _, mic = t.partition("=")
        sdr = os.path.join(tmp, f"sdr{i}.mov")
        subprocess.run(["avconvert", "-s", mov, "-o", sdr, "-p", "Preset1920x1080", "--replace"], check=True, capture_output=True)
        cam = pcm(mov)
        if mic:
            off, peak = offset_s(cam, pcm(mic))
            print(f"shot{i}: {os.path.basename(mic)} delayed {off:.3f}s (match {peak:.2f})")
            voice, level = mic, speech_db(pcm(mic))
        else:
            off, voice, level = 0.0, None, speech_db(cam)
            print(f"shot{i}: camera audio")
        plan.append((i, sdr, voice, off, level))
    ref = plan[0][4]
    for i, sdr, voice, off, level in plan:
        gain = ref - level
        dst = os.path.join(out, f"shot{i}.mp4")
        if voice:
            args = ["-i", sdr, "-i", voice, "-map", "0:v", "-map", "1:a",
                    "-af", f"adelay={max(0, int(off * 1000))}:all=1,apad,volume={gain:.1f}dB", "-shortest"]
        else:
            args = ["-i", sdr, "-af", f"volume={gain:.1f}dB"]
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", dst], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dst, "-ac", "1", "-ar", str(SR), os.path.join(out, f"shot{i}.wav")], check=True)
        print(f"shot{i}.mp4  gain {gain:+.1f} dB")


main()
