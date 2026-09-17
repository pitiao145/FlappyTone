/**
 * The wait between "the player pressed Play" and the run actually starting,
 * so the first gate cues with its real recording instead of the synthetic
 * sweep.
 *
 * Pure and timer-injectable on purpose: the ordering rules here (a floor, a
 * cap, and a load that is allowed to fail) are the whole feature, and they
 * should be testable without an AudioContext, a network, or a React tree.
 *
 * Nothing here may reject. `loadClip` already swallows its own failures, but
 * this must hold even if that ever changes — a warm-up that throws would
 * strand the player on a loading screen, which is strictly worse than the
 * synthetic cue it exists to avoid.
 */

/**
 * How the wait ended. Distinguished rather than collapsed to a boolean so the
 * name never claims more than it established: a load that *failed* has nothing
 * left to wait for, but it did not make the clip ready either — the cue will
 * be synthetic, exactly as on a timeout.
 */
export type WarmupOutcome = "ready" | "timeout" | "failed";

export interface WarmupOptions {
  /**
   * The floor. Below this the screen would flash — on a warm cache
   * `loadClip` resolves in single-digit ms, and a loading screen that appears
   * and vanishes inside one frame reads as a glitch, not as progress.
   */
  minMs: number;
  /**
   * The cap. A dead or pathological network must never trap the player on a
   * loading screen: past this the run starts anyway and the first cue falls
   * back to the synthetic sweep, exactly as it did before this existed.
   */
  maxMs: number;
  /** Injectable for tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

export async function warmupWait(
  load: () => Promise<unknown>,
  { minMs, maxMs, sleep }: WarmupOptions,
): Promise<WarmupOutcome> {
  // The cap's timer outlives the wait whenever the clip wins the race, and the
  // floor's outlives it whenever the clip is slower. Tracked so both can be
  // cleared the moment this settles rather than ticking on to expiry.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wait =
    sleep ??
    ((ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, Math.max(0, ms));
        timers.add(id);
      }));

  let loaded = false;
  let failed = false;
  let clip: Promise<void>;
  try {
    clip = Promise.resolve(load()).then(
      () => {
        loaded = true;
      },
      () => {
        failed = true;
      },
    );
  } catch {
    // A synchronous throw from `load` is the same answer as a rejection: no
    // clip. Still honour the floor below rather than returning instantly.
    failed = true;
    clip = Promise.resolve();
  }
  try {
    const floor = wait(minMs);
    await Promise.race([clip, wait(maxMs)]);
    await floor;
  } finally {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }
  if (loaded) return "ready";
  return failed ? "failed" : "timeout";
}
