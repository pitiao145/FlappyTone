/**
 * Warms the clip cache for a run's word pool.
 *
 * The Run already asks for the next word two gates ahead of the bird, which is
 * enough warning for one ~100KB file. This is the cheap extra: once a run's
 * tone pool is known, start pulling its clips in the background so a later gate
 * is already decoded when it arrives, and a slow connection does not show up as
 * a synthetic cue three gates in.
 *
 * Two rules:
 *
 * 1. **Fire-and-forget.** Nothing here returns a promise a caller could await,
 *    because nothing in the game may wait on audio. An unloaded clip is a
 *    synthetic sweep, not a stall.
 * 2. **Bounded concurrency.** 120 parallel fetches on a phone would starve the
 *    one request that actually matters — the next gate's.
 */
import type { Word } from "../game/words.ts";
import { loadClip } from "./reference.ts";

/** Parallel clip fetches. Enough to use the connection, few enough to leave
 * room for the gate the bird is about to reach. */
const CONCURRENCY = 4;

export function prefetchPool(words: Word[]): void {
  const queue = [...words];
  const next = (): void => {
    const word = queue.shift();
    if (!word) return;
    // loadClip never rejects (it swallows its own failures), so `then` is
    // enough to keep the worker going through a 404 as well as a success.
    void loadClip(word).then(next, next);
  };
  for (let i = 0; i < CONCURRENCY; i++) next();
}
