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
 * 2. **Bounded rate, not just bounded concurrency.** Ordering and a
 *    concurrency cap were never enough on their own: this module still handed
 *    ~30 requests to the network as fast as two slots could drain them, which
 *    is what tripped the clips Worker's WAF rate limit on a run whose actual
 *    appetite is one clip every 3-5 seconds. `clipQueue.ts` now owns the rate:
 *    the exact tier goes in at `"now"`, the speculative tier at `"soon"`,
 *    where it trickles and can be cancelled.
 */
import type { Tone } from "../game/gates.ts";
import type { RunMode, WordMix } from "../game/run.ts";
import { multiWords, wordsOfCombo, wordsOfTone, type Word } from "../game/words.ts";
import { loadClip } from "./reference.ts";

const ALL_TONES: Tone[] = [1, 2, 3, 4];

export interface PrefetchPlanInput {
  mode: RunMode;
  /** The tone every `drill` gate is drawn from. Ignored in other modes. */
  drillTone?: Tone | null;
  /** The exact combo a `pairs` drill is pinned to, or null to shuffle across every combo. Ignored outside `pairs`. */
  pairCombo?: Tone[] | null;
  /** Classic `game` mode's word pool setting — `"all"`/`"multi"` add a multi-syllable slice. Ignored outside `game`. */
  wordMix?: WordMix;
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
 * Mode scoping: `game` speculates over all four tones; `drill` over its own
 * tone only; `single` and `tutorial` (which includes the calibration flight,
 * `tutorialTones: CALIBRATION_TONES`) speculate over nothing — they fly a
 * fixed, tiny set of gates, and the exact tier already covers it. `learn`
 * never reaches the switch at all: it cues synthetically, so `cuesUseClips`
 * is false and the whole plan is empty, exact tier included.
 */
export function planPrefetch(input: PrefetchPlanInput): Word[] {
  return planPrefetchTiers(input).words;
}

/**
 * The same plan, with the boundary between the two tiers still visible.
 *
 * `prefetchPool` needs to know where the exact tier ends, because that is
 * exactly where pacing starts: the queued gates' own clips are due in seconds
 * and go in at `"now"`, everything after is a bet and is dripped. `planPrefetch`
 * flattens this for callers (and tests) that only care about the order.
 */
export function planPrefetchTiers(input: PrefetchPlanInput): {
  words: Word[];
  exactCount: number;
} {
  if (input.cuesUseClips === false) return { words: [], exactCount: 0 };
  if (input.queued === null) return { words: [], exactCount: 0 };
  const ordered: Word[] = [];
  const seen = new Set<string>();
  const push = (w: Word | null | undefined): void => {
    if (!w || seen.has(w.id)) return;
    seen.add(w.id);
    ordered.push(w);
  };
  for (const w of input.queued) push(w);
  // Counted AFTER de-duplication, so a queue holding the same word twice does
  // not push a speculative word into the "now" lane.
  const exactCount = ordered.length;
  for (const w of speculativeWords(input)) push(w);
  return { words: ordered, exactCount };
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
    case "pairs":
      return input.pairCombo
        ? wordsOfCombo(input.pool, input.pairCombo).slice(0, cap)
        : multiWords(input.pool).slice(0, cap);
    case "game": {
      const single = ALL_TONES.flatMap((t) => wordsOfTone(input.pool, t, cap));
      // "single" (default) never spawns a multi gate, so speculating on one
      // would warm clips the run can't draw. "all"/"multi" can, so they add
      // the same capped slice `pairs` uses when shuffling.
      if (input.wordMix === "all" || input.wordMix === "multi") {
        return [...single, ...multiWords(input.pool).slice(0, cap)];
      }
      return single;
    }
  }
}

/**
 * Requests the plan: the exact tier at `"now"`, the speculative tail paced at
 * `"soon"`.
 *
 * The lead clip still gets the road to itself, and that is still load-bearing.
 * Measured cold, the first four clips took 1.23-1.43s each where every later
 * one took ~180-200ms, same file sizes — and the budget before the first gate
 * (`baseRestMs` 2400ms, minus a `/token` round trip and a CORS preflight) does
 * not fit 1.4s plus decode. So word 0 is requested alone and the rest wait for
 * it to *settle* (not resolve — a lead clip that rejected must never wedge the
 * plan, and that must not rest on a promise contract owned by another module).
 *
 * What changed is everything after the lead. The remaining exact-tier words go
 * in at `"now"`; the speculative tail goes in at `"soon"`, which `clipQueue`
 * drips rather than dumps. Nothing here loops over a concurrency constant any
 * more — the queue owns both concurrency and rate, in one testable place.
 *
 * `signal` cancels only work that has not started. Pass a run's (or a screen's)
 * own signal so speculation for a run the player quit does not keep spending
 * the rate budget the next screen needs.
 *
 * Still fire-and-forget — this returns nothing a caller could await.
 */
export function prefetchPool(
  words: Word[],
  opts: { exactCount?: number; signal?: AbortSignal } = {},
): void {
  const queue = [...words];
  const lead = queue.shift();
  if (!lead) return;
  // How many of `words` are the exact tier (the Run's already-queued gates).
  // Everything past it is the bet, and is paced.
  const exactCount = Math.max(1, opts.exactCount ?? 1);
  let index = 1;
  const next = (): void => {
    const word = queue.shift();
    if (!word) return;
    const priority = index < exactCount ? "now" : "soon";
    index++;
    // loadClip never rejects (it swallows its own failures), so `then` is
    // enough to keep the worker going through a 404 as well as a success.
    void loadClip(word, { priority, signal: opts.signal }).then(next, next);
  };
  const rest = (): void => {
    // Two walkers, matching the queue's own concurrency: the queue is what
    // actually decides when either one gets to send.
    next();
    next();
  };
  void loadClip(lead, { priority: "now", signal: opts.signal }).then(rest, rest);
}
