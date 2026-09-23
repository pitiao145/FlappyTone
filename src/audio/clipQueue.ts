/**
 * The one place clip-fetch RATE policy lives.
 *
 * Every request to the clips Worker goes through here. The Worker sits behind
 * a Cloudflare WAF rate-limit rule on `/clip/*` (free plan: one rule, see
 * CLAUDE.md), and the client used to be able to trip it on its own — a run
 * start fired ~32 clip requests at once (`prefetch.ts`'s speculative tier) and
 * a visualiser tone tab fired one per word of that tone, with nothing
 * cancelling the previous tab's queue when the player moved on. The game needs
 * roughly ONE clip every few seconds; the burst bought nothing and cost a 429.
 *
 * Four rules, none of which belong in `reference.ts` (which decodes audio) or
 * `prefetch.ts` (which is pure planning):
 *
 * 1. **Bounded concurrency.** At most `MAX_CONCURRENT` in flight, so the clip
 *    the bird is about to reach never shares a connection four ways.
 * 2. **Paced speculation.** A `"soon"` (speculative) request also has to take a
 *    token from a slow bucket. A `"now"` request — the next gate's clip, the
 *    word the player just tapped — skips the bucket entirely and jumps the
 *    queue. Depth is then cheap: warming 30 words costs nothing if they
 *    trickle.
 * 3. **Cancellable.** Work is submitted with an `AbortSignal`. Leaving a tone
 *    tab or ending a run drops that lane's pending speculation instead of
 *    draining it behind the player's back.
 * 4. **Backs off on a 429 instead of hammering.** One shared gate pauses every
 *    lane until `Retry-After`, so a limit hit becomes a delay, never the
 *    permanent per-word failure it used to be (see `reference.ts`'s
 *    `RetryableError`).
 *
 * Pure `fetch`-scheduling only — no Web Audio, no `src/data/` (hard rules 4/5
 * keep both out of the path a prefetch can reach).
 */

/**
 * `"now"`: needed within seconds — the queued gates' clips, a tapped word.
 * `"soon"`: a bet that a later gate or a later tap wants this.
 */
export type ClipPriority = "now" | "soon";

/** Parallel clip fetches. Enough to use the connection, few enough to leave
 * room for the gate the bird is about to reach. */
const MAX_CONCURRENT = 2;

/**
 * Pacing for the `"soon"` lane: one token per `TOKEN_INTERVAL_MS`, at most
 * `BUCKET_BURST` saved up.
 *
 * 400ms is ~2.5 req/s sustained, comfortably under the Worker's rule even with
 * a second tab open, and still far faster than a run consumes clips (one per
 * 3-5s), so the warmer stays ahead of the bird without ever looking like a
 * scrape. The small burst lets a freshly-opened screen start moving instantly.
 */
const TOKEN_INTERVAL_MS = 400;
const BUCKET_BURST = 3;

/** How long to hold everything when a 429 arrives without a usable `Retry-After`. */
const DEFAULT_BACKOFF_MS = 2000;
/** A hostile or absurd `Retry-After` must not wedge the queue for the session. */
const MAX_BACKOFF_MS = 30_000;

/** Rejection used when a submitted job's signal aborts before it runs. */
export class ClipAborted extends Error {
  constructor() {
    super("clip fetch aborted");
  }
}

interface Job {
  /** The clip's cache key, so a waiting job can be found and promoted. */
  key: string;
  priority: ClipPriority;
  signal?: AbortSignal;
  run: () => void;
  abort: () => void;
}

const nowQueue: Job[] = [];
const soonQueue: Job[] = [];
let active = 0;

/** Available `"soon"` tokens, refilled by elapsed time in `takeToken()`. */
let tokens = BUCKET_BURST;
let lastRefillMs = Date.now();
/** `Date.now()` before which nothing may be sent. Set by `noteRateLimited`. */
let pausedUntilMs = 0;
/** The pending `setTimeout` that will re-pump, so we never stack timers. */
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - lastRefillMs;
  if (elapsed < TOKEN_INTERVAL_MS) return;
  const gained = Math.floor(elapsed / TOKEN_INTERVAL_MS);
  tokens = Math.min(BUCKET_BURST, tokens + gained);
  lastRefillMs += gained * TOKEN_INTERVAL_MS;
}

/** ms until the next `"soon"` token, or 0 if one is available now. */
function msUntilToken(): number {
  refillTokens();
  if (tokens > 0) return 0;
  return Math.max(1, TOKEN_INTERVAL_MS - (Date.now() - lastRefillMs));
}

function wakeIn(ms: number): void {
  if (wakeTimer !== null) return;
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    pump();
  }, Math.max(1, ms));
}

/** Drops jobs whose signal aborted while they sat in the queue. */
function dropAborted(queue: Job[]): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].signal?.aborted) {
      const [job] = queue.splice(i, 1);
      job.abort();
    }
  }
}

function pump(): void {
  dropAborted(nowQueue);
  dropAborted(soonQueue);

  const backoff = pausedUntilMs - Date.now();
  if (backoff > 0) {
    if (nowQueue.length > 0 || soonQueue.length > 0) wakeIn(backoff);
    return;
  }

  while (active < MAX_CONCURRENT) {
    const next = nowQueue.shift();
    if (next) {
      active++;
      next.run();
      continue;
    }
    if (soonQueue.length === 0) return;
    const wait = msUntilToken();
    if (wait > 0) {
      wakeIn(wait);
      return;
    }
    const spec = soonQueue.shift();
    if (!spec) return;
    tokens--;
    active++;
    spec.run();
  }
}

/**
 * Runs `fn` under the queue's concurrency, pacing and backoff rules.
 *
 * Rejects with `ClipAborted` if `signal` fires before the job starts. Once a
 * job HAS started it is left alone — the fetch is already on the wire and the
 * caller (`loadClip`) wants the result cached either way.
 */
export function submitClipFetch<T>(
  fn: () => Promise<T>,
  opts: { key: string; priority: ClipPriority; signal?: AbortSignal },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new ClipAborted());
      return;
    }
    const job: Job = {
      key: opts.key,
      priority: opts.priority,
      signal: opts.signal,
      abort: () => reject(new ClipAborted()),
      run: () => {
        void (async () => {
          try {
            resolve(await fn());
          } catch (err) {
            reject(err as Error);
          } finally {
            active--;
            pump();
          }
        })();
      },
    };
    (opts.priority === "now" ? nowQueue : soonQueue).push(job);
    pump();
  });
}

/**
 * Moves an already-queued `"soon"` job into the `"now"` lane.
 *
 * Without this, the priorities would be decided once, at submit time, and
 * would be wrong in the case that matters most: the visualiser warms a whole
 * tone's words at `"soon"`, and the player then taps the 25th chip. That word
 * is already in `loads`, so `loadClip` hands back the existing promise rather
 * than submitting a fresh high-priority one — and the tap would wait out the
 * trickle ahead of it. Promotion re-files it instead.
 *
 * A no-op for a job that has already started, or one that was never queued.
 */
export function promoteClipFetch(key: string): void {
  const i = soonQueue.findIndex((job) => job.key === key);
  if (i === -1) return;
  const [job] = soonQueue.splice(i, 1);
  job.priority = "now";
  // The speculative caller's signal no longer speaks for this job: a "now"
  // caller is waiting on it, so a later abort of the warmer must not drop it.
  job.signal = undefined;
  nowQueue.push(job);
  pump();
}

/**
 * Called when the Worker (or Cloudflare in front of it) answers 429.
 *
 * Holds every lane — a rate limit is per IP, so letting the `"now"` lane keep
 * going would just spend the next window's budget on more 429s.
 */
export function noteRateLimited(retryAfterHeader?: string | null): void {
  let ms = DEFAULT_BACKOFF_MS;
  const seconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) ms = seconds * 1000;
  pausedUntilMs = Math.max(pausedUntilMs, Date.now() + Math.min(ms, MAX_BACKOFF_MS));
  wakeIn(pausedUntilMs - Date.now());
}

/** True while a 429 backoff is in force. Exposed for tests and diagnostics. */
export function isBackingOff(): boolean {
  return Date.now() < pausedUntilMs;
}

/** Test-only: drop every queued job and reset the pacing state. */
export function resetClipQueue(): void {
  nowQueue.length = 0;
  soonQueue.length = 0;
  active = 0;
  tokens = BUCKET_BURST;
  lastRefillMs = Date.now();
  pausedUntilMs = 0;
  if (wakeTimer !== null) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
}
