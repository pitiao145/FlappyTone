// Noise lab only (dev + Vercel preview): the last ~30 s of raw mic, so a
// noisy-room session can be saved as a WAV and replayed offline through
// `npm run noise-bench`/`npm run analyze`. Frames arrive as 2048-sample windows
// on a 1024 hop, so only each frame's newest 1024 samples are new audio.
import { encodeWav } from "./wav.ts";

const SECONDS = 30;
let buf: Float32Array | null = null;
let rate = 44100;
let write = 0;
let filled = 0;

export function tapePush(frame: Float32Array, sampleRate: number): void {
  if (!buf || rate !== sampleRate) {
    rate = sampleRate;
    buf = new Float32Array(SECONDS * sampleRate);
    write = 0;
    filled = 0;
  }
  const fresh = frame.subarray(frame.length - 1024);
  for (let i = 0; i < fresh.length; i++) {
    buf[write] = fresh[i];
    write = (write + 1) % buf.length;
  }
  filled = Math.min(buf.length, filled + fresh.length);
}

/** Downloads the tape as a 16-bit mono WAV. Returns false if nothing was heard yet. */
export function tapeDownload(label: string): boolean {
  if (!buf || filled === 0) return false;
  const out = new Float32Array(filled);
  const start = (write - filled + buf.length) % buf.length;
  for (let i = 0; i < filled; i++) out[i] = buf[(start + i) % buf.length];
  const blob = new Blob([encodeWav(out, rate) as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `noisy_${label}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}
