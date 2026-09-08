/**
 * Local, player-facing run history — lifetime counts plus the last 5 runs'
 * per-tone stats, for the Progress tab. Same localStorage conventions as
 * `settings.ts` (versioned key, try/catch/validate on load).
 *
 * This is a deliberate, scoped exception to CLAUDE.md's "no persistence
 * except calibration" rule, carved out for the Progress/Profile teaser: it
 * is the player's own device-local stats, never sent anywhere, and capped
 * to the last 5 runs to match the free tier the UI advertises.
 */

import type { RunSnapshot } from "./run.ts";
import type { RunStats } from "./scoring.ts";
import type { Tone } from "./gates.ts";

const KEY = "toneflap.history.v1";
const MAX_RUNS = 5;

export type RunOutcome = "finished" | "out_of_hearts" | "quit";

export interface RunHistoryEntry {
  atISO: string;
  score: number;
  gates: number;
  outcome: RunOutcome;
  perTone: Record<Tone, { gates: number; accSum: number; unheard: number }>;
}

export type LifetimeToneStats = { attempts: number; unheard: number; accSum: number; best: number };

export interface RunHistoryStore {
  totalRuns: number;
  bestScore: number;
  totalGates: number;
  /** Unique word ids ever played, for the "words" stat. */
  wordIds: string[];
  /** Most recent first, capped at MAX_RUNS. */
  lastRuns: RunHistoryEntry[];
  /**
   * Lifetime per-tone stats, shaped to mirror the DB columns this will sync
   * into (`public.tone_stats`, see docs/flappytone-SPEC-supabase-phase1.md).
   * Added 6 Sep 2026 without bumping `KEY`: unlike the v2->v3 settings bump
   * (see settings.ts), an old record here isn't wrong data that needs
   * discarding — `lastRuns` already carries the same per-tone shape for up
   * to 5 runs, so a record from before this field existed can be *seeded*
   * from it rather than reset to zero. Bumping the key would need every
   * existing player to lose `bestScore`/`totalRuns` just to backfill a field
   * that's recoverable from data already on disk. `isValid` below tolerates
   * its absence, and `loadRunHistory` seeds it in that case.
   */
  lifetimePerTone: Record<Tone, LifetimeToneStats>;
}

function emptyPerTone(): Record<Tone, LifetimeToneStats> {
  const perTone = {} as Record<Tone, LifetimeToneStats>;
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    perTone[tone] = { attempts: 0, unheard: 0, accSum: 0, best: 0 };
  }
  return perTone;
}

function emptyStore(): RunHistoryStore {
  return {
    totalRuns: 0,
    bestScore: 0,
    totalGates: 0,
    wordIds: [],
    lastRuns: [],
    lifetimePerTone: emptyPerTone(),
  };
}

/** Shape-only check; `lifetimePerTone` is allowed to be missing (see field doc comment). */
function isValid(s: unknown): s is Omit<RunHistoryStore, "lifetimePerTone"> {
  if (typeof s !== "object" || s === null) return false;
  const r = s as Partial<RunHistoryStore>;
  return (
    typeof r.totalRuns === "number" &&
    typeof r.bestScore === "number" &&
    typeof r.totalGates === "number" &&
    Array.isArray(r.wordIds) &&
    Array.isArray(r.lastRuns)
  );
}

/**
 * Seeds lifetime per-tone stats from whatever's in `lastRuns`, for a store
 * saved before `lifetimePerTone` existed. `best` is left at 0 — per-gate
 * best accuracy was never measured before this change, so there's nothing
 * to recover it from; it starts accumulating from here on.
 */
function seedLifetimePerTone(lastRuns: RunHistoryEntry[]): Record<Tone, LifetimeToneStats> {
  const perTone = emptyPerTone();
  for (const run of lastRuns) {
    for (const tone of [1, 2, 3, 4] as Tone[]) {
      const t = run.perTone[tone];
      perTone[tone].attempts += t.gates;
      perTone[tone].unheard += t.unheard;
      perTone[tone].accSum += t.accSum;
    }
  }
  return perTone;
}

export function loadRunHistory(): RunHistoryStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyStore();
    const withLifetime = parsed as Partial<RunHistoryStore> & Omit<RunHistoryStore, "lifetimePerTone">;
    return {
      ...withLifetime,
      lifetimePerTone: withLifetime.lifetimePerTone ?? seedLifetimePerTone(withLifetime.lastRuns),
    };
  } catch {
    return emptyStore();
  }
}

function saveRunHistory(store: RunHistoryStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Blocked/full storage — the stats just don't persist this session.
  }
}

export function clearRunHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Gate count across a run's per-tone stats — scored (voiced) gates only, matching `toneBreakdown`. */
function scoredGateCount(stats: RunStats): number {
  return ([1, 2, 3, 4] as Tone[]).reduce((sum, t) => sum + stats.perTone[t].gates, 0);
}

/** Persist one finished/failed run. */
export function recordRun(snap: RunSnapshot, outcome: RunOutcome): RunHistoryStore {
  const prev = loadRunHistory();
  const perTone = ([1, 2, 3, 4] as Tone[]).reduce(
    (acc, t) => {
      const s = snap.stats.perTone[t];
      acc[t] = { gates: s.gates, accSum: s.accSum, unheard: s.unheard };
      return acc;
    },
    {} as RunHistoryEntry["perTone"],
  );
  const entry: RunHistoryEntry = {
    atISO: new Date().toISOString(),
    score: snap.stats.score,
    gates: scoredGateCount(snap.stats),
    outcome,
    perTone,
  };
  const wordIds = new Set(prev.wordIds);
  for (const id of snap.wordIds) wordIds.add(id);

  const lifetimePerTone = { ...prev.lifetimePerTone };
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    const t = snap.stats.perTone[tone];
    const prevT = prev.lifetimePerTone[tone];
    lifetimePerTone[tone] = {
      attempts: prevT.attempts + t.gates,
      unheard: prevT.unheard + t.unheard,
      accSum: prevT.accSum + t.accSum,
      best: Math.max(prevT.best, t.best),
    };
  }

  const next: RunHistoryStore = {
    totalRuns: prev.totalRuns + 1,
    bestScore: Math.max(prev.bestScore, snap.stats.score),
    totalGates: prev.totalGates + entry.gates,
    wordIds: Array.from(wordIds),
    lastRuns: [entry, ...prev.lastRuns].slice(0, MAX_RUNS),
    lifetimePerTone,
  };
  saveRunHistory(next);
  return next;
}

/**
 * Folds account-held totals back into the local store, keeping the larger of
 * each. Used after a sync, so a device that was behind catches up without
 * losing anything it alone knew about.
 *
 * `lastRuns` is deliberately untouched: it is a display cache of *this*
 * device's recent runs, not an aggregate, and there is no meaningful way to
 * interleave two devices' run lists by anything other than a clock we don't
 * trust. Lifetime counts are the thing an account owns.
 */
export function mergeIntoRunHistory(incoming: {
  bestScore: number;
  totalRuns: number;
  totalGates: number;
  perTone: { tone: Tone; attempts: number; unheard: number; accSum: number; best: number }[];
}): RunHistoryStore {
  const prev = loadRunHistory();
  const lifetimePerTone = { ...prev.lifetimePerTone };
  for (const t of incoming.perTone) {
    const prevT = prev.lifetimePerTone[t.tone];
    if (!prevT) continue;
    lifetimePerTone[t.tone] = {
      attempts: Math.max(prevT.attempts, t.attempts),
      unheard: Math.max(prevT.unheard, t.unheard),
      accSum: Math.max(prevT.accSum, t.accSum),
      best: Math.max(prevT.best, t.best),
    };
  }
  const next: RunHistoryStore = {
    ...prev,
    bestScore: Math.max(prev.bestScore, incoming.bestScore),
    totalRuns: Math.max(prev.totalRuns, incoming.totalRuns),
    totalGates: Math.max(prev.totalGates, incoming.totalGates),
    lifetimePerTone,
  };
  saveRunHistory(next);
  return next;
}

/** Lifetime per-tone stats as a flat list, shaped for the leaderboard sync layer. */
export function lifetimeToneStats(
  store: RunHistoryStore,
): { tone: Tone; attempts: number; unheard: number; accSum: number; best: number }[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => ({ tone, ...store.lifetimePerTone[tone] }));
}

export interface ToneAccuracy {
  tone: Tone;
  pct: number | null;
  gates: number;
}

/** Accuracy per tone, aggregated across the stored last-5 runs. */
export function toneAccuracyFromHistory(store: RunHistoryStore): ToneAccuracy[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => {
    let gates = 0;
    let accSum = 0;
    for (const run of store.lastRuns) {
      gates += run.perTone[tone].gates;
      accSum += run.perTone[tone].accSum;
    }
    return { tone, pct: gates > 0 ? (accSum / gates) * 100 : null, gates };
  });
}

/**
 * Accuracy per tone from lifetime totals (`lifetimePerTone`), for a device
 * whose `lastRuns` is empty (e.g. a second device, before any local run has
 * happened yet). Same unheard-exclusion rule as `toneAccuracyFromHistory`:
 * `attempts` already counts only scored (voiced) gates, matching `gates`
 * there, so the definition is `accSum / attempts`, gates included for parity
 * with `ToneAccuracy`.
 */
export function lifetimeToneAccuracy(store: RunHistoryStore): ToneAccuracy[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => {
    const t = store.lifetimePerTone[tone];
    return { tone, pct: t.attempts > 0 ? (t.accSum / t.attempts) * 100 : null, gates: t.attempts };
  });
}
