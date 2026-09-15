/**
 * Warms the clip cache for a run, in priority order.
 *
 * A run needs its clips in two very different timeframes, and conflating them
 * is what made the first gate of every run cue as a synthetic sweep: the bulk
 * pool saturated all four connection slots with catalog words 1–4 (almost
 * never the first gate's word) before the first gate's own `loadClip` was
 * issued. So there are two tiers, in one ordered list:
 *
 * 1. **Exact** — the words of the gates the `Run` has already queued
 *    (`snapshot().gates`, QUEUE_AHEAD = 2). Needed in seconds. Requested
 *    first, always.
 * 2. **Speculative** — a mode-scoped, per-tone-capped slice of the pool, in
 *    case a later gate picks one of them. `pickWord` draws pseudo-randomly
 *    from the whole 30-word tone pool with a don't-repeat window, so this tier
 *    is a bet, not a prediction: with a cap of N it warms roughly N/30 of the
 *    gates a run will actually fly. Deliberately not predicted by cloning the
 *    run's RNG — advancing that generator would change the run itself.
 *
 * Two rules that have not changed:
 *
 * 1. **Fire-and-forget.** Nothing here returns a promise a caller could await,
 *    because nothing in the game may wait on audio. An unloaded clip is a
 *    synthetic sweep, not a stall.
 * 2. **Bounded concurrency.** 120 parallel fetches on a phone would starve the
 *    one request that actually matters — the next gate's.
 */
import type { Tone } from "../game/gates.ts";
import type { RunMode } from "../game/run.ts";
import { wordsOfTone, type Word } from "../game/words.ts";
import { loadClip } from "./reference.ts";

/** Parallel clip fetches. Enough to use the connection, few enough to leave
 * room for the gate the bird is about to reach. */
const CONCURRENCY = 4;

const ALL_TONES: Tone[] = [1, 2, 3, 4];

export interface PrefetchPlanInput {
  mode: RunMode;
  /** The tone every `drill` gate is drawn from. Ignored in other modes. */
  drillTone?: Tone | null;
  /**
   * The words of the gates already queued by the Run — the exact tier.
   *
   * `null` means the Run's queue was not readable at all (the host's ref was
   * empty). That must NOT degrade to "just fetch the pool", which is exactly
   * the bulk-first inversion this module exists to remove, so it plans nothing
   * and leaves the whole job to the HUD tick's own look-ahead. Failing to
   * nothing is recoverable; failing to bulk-first is the bug coming back.
   */
  queued: Array<Word | null | undefined> | null;
  /** The tier-filtered inventory the run may draw from. */
  pool: Word[];
  /** Speculative words per tone — `tuning().prefetchWordsPerTone`. */
  perTone: number;
  /**
   * False when this mode never plays a clip at all (learn mode cues
   * synthetically on purpose), in which case nothing is worth fetching —
   * not even the exact tier.
   */
  cuesUseClips?: boolean;
}

/**
 * The ordered, de-duplicated list of words to request: exact tier first, then
 * the mode's speculative slice. Pure — the caller does the fetching.
 *
 * Mode scoping: `game` and `learn` speculate over all four tones; `drill` over
 * its own tone only; `single` and `tutorial` (which includes the calibration
 * flight, `tutorialTones: CALIBRATION_TONES`) speculate over nothing — they
 * fly a fixed, tiny set of gates, and the exact tier already covers it.
 */
export function planPrefetch(input: PrefetchPlanInput): Word[] {
  if (input.cuesUseClips === false) return [];
  if (input.queued === null) return [];
  const ordered: Word[] = [];
  const seen = new Set<string>();
  const push = (w: Word | null | undefined): void => {
    if (!w || seen.has(w.id)) return;
    seen.add(w.id);
    ordered.push(w);
  };
  for (const w of input.queued) push(w);
  for (const w of speculativeWords(input)) push(w);
  return ordered;
}

function speculativeWords(input: PrefetchPlanInput): Word[] {
  const cap = Math.max(0, Math.floor(input.perTone));
  if (cap === 0) return [];
  switch (input.mode) {
    case "single":
    case "tutorial":
    case "learn": // learn always cues synthetically (Game.tsx forces it), so cuesUseClips===false already returns [] before this switch runs
      return [];
    case "drill":
      return input.drillTone ? wordsOfTone(input.pool, input.drillTone, cap) : [];
    case "game":
      return ALL_TONES.flatMap((t) => wordsOfTone(input.pool, t, cap));
  }
}

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
