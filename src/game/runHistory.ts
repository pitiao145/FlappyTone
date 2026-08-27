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

export interface RunHistoryStore {
  totalRuns: number;
  bestScore: number;
  totalGates: number;
  /** Unique word ids ever played, for the "words" stat. */
  wordIds: string[];
  /** Most recent first, capped at MAX_RUNS. */
  lastRuns: RunHistoryEntry[];
}

function emptyStore(): RunHistoryStore {
  return { totalRuns: 0, bestScore: 0, totalGates: 0, wordIds: [], lastRuns: [] };
}

function isValid(s: unknown): s is RunHistoryStore {
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

export function loadRunHistory(): RunHistoryStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : emptyStore();
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

  const next: RunHistoryStore = {
    totalRuns: prev.totalRuns + 1,
    bestScore: Math.max(prev.bestScore, snap.stats.score),
    totalGates: prev.totalGates + entry.gates,
    wordIds: Array.from(wordIds),
    lastRuns: [entry, ...prev.lastRuns].slice(0, MAX_RUNS),
  };
  saveRunHistory(next);
  return next;
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
