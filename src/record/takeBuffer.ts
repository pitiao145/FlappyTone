/**
 * Holds the last few seconds of mic audio so a take can be sliced out of it
 * after the fact, using the millisecond bounds `TakeDetector` reports.
 *
 * Recording only *after* voicing is detected would clip every initial
 * consonant, so the mic runs continuously and this keeps a window behind it.
 * Bounded on purpose: Jane may leave the page open for an hour between words,
 * and an unbounded array of Float32Arrays would grow until the tab dies.
 *
 * Pure — no Web Audio, no React. The caller feeds it frames.
 */

/**
 * Frames arrive with 50% overlap, so only the second half of each is new. The
 * first frame is kept whole. Getting this wrong makes every clip play at half
 * speed — the same trap `src/dev/Capture.tsx` documents.
 */
const HOP_SIZE = 1024;

export class TakeBuffer {
  private chunks: Float32Array[] = [];
  /** Sample index of `chunks[0]`, which advances as old audio is dropped. */
  private baseSample = 0;
  private totalSamples = 0;
  private first = true;
  private readonly maxSamples: number;
  readonly sampleRate: number;

  constructor(sampleRate: number, historyMs = 6000) {
    this.sampleRate = sampleRate;
    this.maxSamples = Math.ceil((historyMs / 1000) * sampleRate);
  }

  /** Milliseconds of audio held right now. */
  get elapsedMs(): number {
    return (this.totalSamples / this.sampleRate) * 1000;
  }

  push(frame: Float32Array): void {
    const fresh = this.first ? frame : frame.subarray(HOP_SIZE);
    this.first = false;
    // Copy: the worklet reuses its buffer, so holding the view would leave us
    // with N references to whatever the mic is playing right now.
    this.chunks.push(Float32Array.from(fresh));
    this.totalSamples += fresh.length;
    this.trim();
  }

  private trim(): void {
    while (this.totalSamples - this.baseSample > this.maxSamples && this.chunks.length > 1) {
      this.baseSample += this.chunks[0].length;
      this.chunks.shift();
    }
  }

  /**
   * Concatenated samples between two times on the same clock `push` implies
   * (0 = the first frame ever pushed). Clamped to what is still held, so a
   * request reaching past the trim horizon returns what survives rather than
   * silence or a throw.
   */
  slice(startMs: number, endMs: number): Float32Array {
    const toSample = (ms: number) => Math.round((ms / 1000) * this.sampleRate);
    const from = Math.max(this.baseSample, toSample(startMs));
    const to = Math.min(this.totalSamples, toSample(endMs));
    if (to <= from) return new Float32Array(0);

    const out = new Float32Array(to - from);
    let cursor = this.baseSample;
    let written = 0;
    for (const chunk of this.chunks) {
      const chunkEnd = cursor + chunk.length;
      if (chunkEnd > from && cursor < to) {
        const a = Math.max(0, from - cursor);
        const b = Math.min(chunk.length, to - cursor);
        out.set(chunk.subarray(a, b), written);
        written += b - a;
      }
      cursor = chunkEnd;
      if (cursor >= to) break;
    }
    return out;
  }

  /** Drops everything held. The clock does not reset — bounds stay comparable. */
  clear(): void {
    this.chunks = [];
    this.baseSample = this.totalSamples;
  }
}
