import { describe, expect, it } from "vitest";
import { TakeBuffer } from "./takeBuffer.ts";

const RATE = 48000;
const FRAME = 2048;
const HOP = 1024;

/** Pushes n overlapping frames of a ramp, so every sample is identifiable. */
function fill(buf: TakeBuffer, frames: number): Float32Array {
  const total = FRAME + (frames - 1) * HOP;
  const source = new Float32Array(total);
  for (let i = 0; i < total; i++) source[i] = i;
  for (let f = 0; f < frames; f++) {
    buf.push(source.subarray(f * HOP, f * HOP + FRAME));
  }
  return source;
}

describe("TakeBuffer", () => {
  it("reconstructs the signal without doubling the overlap", () => {
    const buf = new TakeBuffer(RATE);
    const source = fill(buf, 10);
    const all = buf.slice(0, buf.elapsedMs);
    expect(all.length).toBe(source.length);
    expect(Array.from(all.subarray(0, 5))).toEqual([0, 1, 2, 3, 4]);
    // If the 50% overlap were kept, the last sample would be far short of this.
    expect(all[all.length - 1]).toBe(source.length - 1);
  });

  it("slices an interior window at the right samples", () => {
    const buf = new TakeBuffer(RATE);
    fill(buf, 20);
    const startMs = 100;
    const endMs = 200;
    const cut = buf.slice(startMs, endMs);
    expect(cut.length).toBe(Math.round((100 / 1000) * RATE));
    expect(cut[0]).toBe(Math.round((startMs / 1000) * RATE));
  });

  it("does not grow without bound", () => {
    const buf = new TakeBuffer(RATE, 500);
    fill(buf, 200);
    // ~4.3s pushed, 500ms of history asked for. Some slop is fine — whole
    // chunks are dropped, not partial ones — but it must not keep everything.
    const held = buf.slice(0, buf.elapsedMs);
    expect(held.length).toBeLessThan(RATE);
  });

  it("returns what survives when a slice reaches past the trim horizon", () => {
    const buf = new TakeBuffer(RATE, 500);
    fill(buf, 200);
    // Asking for the very beginning, long since dropped.
    expect(buf.slice(0, 10)).toHaveLength(0);
    // Asking for the recent past still works.
    expect(buf.slice(buf.elapsedMs - 100, buf.elapsedMs).length).toBeGreaterThan(0);
  });

  it("keeps the clock running across clear(), so bounds stay comparable", () => {
    const buf = new TakeBuffer(RATE);
    fill(buf, 10);
    const before = buf.elapsedMs;
    buf.clear();
    fill(buf, 10);
    expect(buf.elapsedMs).toBeGreaterThan(before);
    expect(buf.slice(0, before)).toHaveLength(0);
  });

  it("copies frames rather than aliasing the worklet's buffer", () => {
    const buf = new TakeBuffer(RATE);
    const frame = new Float32Array(FRAME).fill(0.5);
    buf.push(frame);
    frame.fill(-1); // the worklet reuses and overwrites its buffer
    expect(buf.slice(0, buf.elapsedMs)[0]).toBe(0.5);
  });
});
