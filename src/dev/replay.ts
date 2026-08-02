// Dev-only replay driver: feeds a decoded WAV into the app's frame sink at
// real-time pace, standing in for the microphone. Whatever screen has a sink
// installed (the game, the calibration preview) flies from the recording.
import { feedFrame } from "../audio/session.ts";

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const TICK_MS = 20;

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts feeding frames; stops itself at the end of the recording. */
export function startReplay(samples: Float32Array, sampleRate: number): void {
  stopReplay();
  let pos = 0;
  const t0 = performance.now();
  timer = setInterval(() => {
    const target = ((performance.now() - t0) / 1000) * sampleRate;
    while (pos + FRAME_SIZE <= samples.length && pos + FRAME_SIZE <= target) {
      feedFrame(samples.subarray(pos, pos + FRAME_SIZE), sampleRate);
      pos += HOP_SIZE;
    }
    if (pos + FRAME_SIZE > samples.length) stopReplay();
  }, TICK_MS);
}

export function stopReplay(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
