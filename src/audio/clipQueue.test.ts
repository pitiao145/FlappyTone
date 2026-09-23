/**
 * The rate policy's own tests. Fake timers throughout — the whole point of
 * this module is what it does with TIME, so a test that ran on the wall clock
 * would either be slow or be asserting nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClipAborted,
  isBackingOff,
  noteRateLimited,
  promoteClipFetch,
  resetClipQueue,
  submitClipFetch,
} from "./clipQueue.ts";

/** A job that never settles on its own, so concurrency can be observed. */
function pending(key: string, priority: "now" | "soon", started: string[], signal?: AbortSignal) {
  let release!: () => void;
  const done = new Promise<void>((r) => {
    release = r;
  });
  const promise = submitClipFetch(
    async () => {
      started.push(key);
      await done;
      return key;
    },
    { key, priority, signal },
  );
  return { promise, release };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetClipQueue();
});
afterEach(() => {
  resetClipQueue();
  vi.useRealTimers();
});

describe("clipQueue", () => {
  it("runs at most two jobs at once", async () => {
    const started: string[] = [];
    const jobs = ["a", "b", "c", "d"].map((k) => pending(k, "now", started));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a", "b"]);
    jobs[0].release();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("lets a 'now' job overtake queued 'soon' work", async () => {
    const started: string[] = [];
    // Fill both slots, then queue speculation behind them.
    const blockers = [pending("b1", "now", started), pending("b2", "now", started)];
    pending("spec", "soon", started);
    pending("urgent", "now", started);
    await vi.advanceTimersByTimeAsync(0);
    blockers[0].release();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["b1", "b2", "urgent"]);
  });

  it("paces the 'soon' lane instead of draining it at once", async () => {
    const started: string[] = [];
    // These settle immediately, so concurrency is never what holds them back —
    // only the token bucket is, which is what this test is about.
    for (let i = 0; i < 8; i++) {
      void submitClipFetch(
        async () => {
          started.push(`s${i}`);
        },
        { key: `s${i}`, priority: "soon" },
      );
    }
    await vi.advanceTimersByTimeAsync(0);
    // Only the saved-up burst goes immediately — never all eight.
    expect(started).toEqual(["s0", "s1", "s2"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(started).toEqual(["s0", "s1", "s2", "s3"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(started).toHaveLength(8);
  });

  it("promotes a queued 'soon' job so a tap does not wait out the trickle", async () => {
    const started: string[] = [];
    const blockers = [pending("b1", "now", started), pending("b2", "now", started)];
    for (let i = 0; i < 5; i++) pending(`s${i}`, "soon", started);
    await vi.advanceTimersByTimeAsync(0);
    promoteClipFetch("s4");
    blockers[0].release();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toContain("s4");
  });

  it("rejects a queued job whose signal aborts, and never runs it", async () => {
    const started: string[] = [];
    const blockers = [pending("b1", "now", started), pending("b2", "now", started)];
    const controller = new AbortController();
    const { promise } = pending("dropped", "now", started, controller.signal);
    const caught = promise.catch((e: unknown) => e);
    controller.abort();
    blockers[0].release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await caught).toBeInstanceOf(ClipAborted);
    expect(started).not.toContain("dropped");
  });

  it("holds every lane after a 429 and resumes when the window passes", async () => {
    const started: string[] = [];
    noteRateLimited("1");
    expect(isBackingOff()).toBe(true);
    pending("after429", "now", started);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(started).toEqual(["after429"]);
  });

  it("bounds an absurd Retry-After rather than wedging for the session", () => {
    noteRateLimited("999999");
    expect(isBackingOff()).toBe(true);
    vi.advanceTimersByTime(31_000);
    expect(isBackingOff()).toBe(false);
  });
});
