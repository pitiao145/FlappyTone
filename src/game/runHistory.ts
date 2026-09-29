/**
 * Local, player-facing run history — lifetime counts plus the last 5 runs'
 * per-tone stats, for the Progress tab. Same localStorage conventions as
 * `settings.ts` (versioned key, try/catch/validate on load).
 *
 * This is a deliberate, scoped exception to CLAUDE.md's "no persistence
 * except calibration" rule, carved out for the Progress/Profile teaser: it
 * is the player's own device-local stats, capped to the last 5 runs; an
 * account syncs the lifetime totals (src/data/account.ts).
 *
 * The per-tone and per-combo numbers are TONE accuracy (spec A), not the
 * score — see `STATS_VERSION` for the reset that came with that change.
 */

import type { RunSnapshot } from "./run.ts";
import type { RunStats } from "./scoring.ts";
import type { Tone } from "./gates.ts";

const KEY = "toneflap.history.v1";
const MAX_RUNS = 5;

export type RunOutcome = "finished" | "out_of_hearts" | "quit" | "restart";

export interface RunHistoryEntry {
  atISO: string;
  score: number;
  gates: number;
  outcome: RunOutcome;
  /** Tone accuracy per tone (single-syllable gates), since `STATS_VERSION` 2. */
  perTone: Record<Tone, { gates: number; accSum: number; unheard: number }>;
  /** Tone accuracy per pair combo ("3-2"), for combos flown this run. Absent on entries saved before combos existed. */
  perCombo?: Record<string, { gates: number; accSum: number; unheard: number }>;
}

export type LifetimeToneStats = { attempts: number; unheard: number; accSum: number; best: number };

/**
 * What the per-tone numbers mean. 1 (implicit — the field is absent) was the
 * score's corridor accuracy; 2 is tone accuracy (spec A, 28 Sep 2026). The
 * two must never be summed together, so a store below this version has every
 * per-tone and per-combo number reset on load (Pierre's call: reset, not
 * migrate). Runs, best score, gates and word ids are counts, unchanged in
 * meaning, and are kept.
 */
export const STATS_VERSION = 2;

export interface RunHistoryStore {
  totalRuns: number;
  bestScore: number;
  totalGates: number;
  /** Unique word ids ever played, for the "words" stat. */
  wordIds: string[];
  /** Most recent first, capped at MAX_RUNS. */
  lastRuns: RunHistoryEntry[];
  /**
   * Lifetime tone accuracy per tone, shaped to mirror the DB columns it syncs
   * into (`public.tone_accuracy_stats`, targets "1".."4").
   */
  lifetimePerTone: Record<Tone, LifetimeToneStats>;
  /** Lifetime tone accuracy per pair combo ("3-2"), same shape; syncs as those targets. */
  lifetimePerCombo: Record<string, LifetimeToneStats>;
  /** See `STATS_VERSION`. */
  statsVersion: number;
}

function emptyPerTone(): Record<Tone, LifetimeToneStats> {
  const perTone = {} as Record<Tone, LifetimeToneStats>;
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    perTone[tone] = { attempts: 0, unheard: 0, accSum: 0, best: 0 };
  }
  return perTone;
}

function emptyRunPerTone(): RunHistoryEntry["perTone"] {
  const perTone = {} as RunHistoryEntry["perTone"];
  for (const tone of [1, 2, 3, 4] as Tone[]) perTone[tone] = { gates: 0, accSum: 0, unheard: 0 };
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
    lifetimePerCombo: {},
    statsVersion: STATS_VERSION,
  };
}

/** Shape-only check on the counts every version has. */
function isValid(s: unknown): s is Pick<RunHistoryStore, "totalRuns" | "bestScore" | "totalGates" | "wordIds" | "lastRuns"> {
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
    if (!isValid(parsed)) return emptyStore();
    const stored = parsed as Partial<RunHistoryStore> &
      Pick<RunHistoryStore, "totalRuns" | "bestScore" | "totalGates" | "wordIds" | "lastRuns">;
    if (stored.statsVersion !== STATS_VERSION) {
      // Per-tone numbers from before tone accuracy meant something else —
      // drop them, keep the counts, and save so the reset happens once.
      const reset: RunHistoryStore = {
        totalRuns: stored.totalRuns,
        bestScore: stored.bestScore,
        totalGates: stored.totalGates,
        wordIds: stored.wordIds,
        lastRuns: stored.lastRuns.map((run) => ({ ...run, perTone: emptyRunPerTone(), perCombo: {} })),
        lifetimePerTone: emptyPerTone(),
        lifetimePerCombo: {},
        statsVersion: STATS_VERSION,
      };
      saveRunHistory(reset);
      return reset;
    }
    return {
      ...stored,
      lifetimePerTone: stored.lifetimePerTone ?? emptyPerTone(),
      lifetimePerCombo: stored.lifetimePerCombo ?? {},
      statsVersion: STATS_VERSION,
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

/** Gate count across a run's per-tone and per-combo stats — measured gates only, matching `toneBreakdown`. */
function scoredGateCount(stats: RunStats): number {
  const singles = ([1, 2, 3, 4] as Tone[]).reduce((sum, t) => sum + stats.perTone[t].gates, 0);
  const pairs = Object.values(stats.perCombo ?? {}).reduce((sum, c) => sum + c.gates, 0);
  return singles + pairs;
}

function addLifetime(prev: LifetimeToneStats | undefined, run: { gates: number; unheard: number; accSum: number; best: number }): LifetimeToneStats {
  const p = prev ?? { attempts: 0, unheard: 0, accSum: 0, best: 0 };
  return {
    attempts: p.attempts + run.gates,
    unheard: p.unheard + run.unheard,
    accSum: p.accSum + run.accSum,
    best: Math.max(p.best, run.best),
  };
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
  const runCombos = snap.stats.perCombo ?? {};
  const perCombo: NonNullable<RunHistoryEntry["perCombo"]> = {};
  for (const [key, c] of Object.entries(runCombos)) {
    perCombo[key] = { gates: c.gates, accSum: c.accSum, unheard: c.unheard };
  }
  const entry: RunHistoryEntry = {
    atISO: new Date().toISOString(),
    score: snap.stats.score,
    gates: scoredGateCount(snap.stats),
    outcome,
    perTone,
    perCombo,
  };
  const wordIds = new Set(prev.wordIds);
  for (const id of snap.wordIds) wordIds.add(id);

  const lifetimePerTone = { ...prev.lifetimePerTone };
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    lifetimePerTone[tone] = addLifetime(prev.lifetimePerTone[tone], snap.stats.perTone[tone]);
  }
  const lifetimePerCombo = { ...prev.lifetimePerCombo };
  for (const [key, c] of Object.entries(runCombos)) {
    lifetimePerCombo[key] = addLifetime(prev.lifetimePerCombo[key], c);
  }

  const next: RunHistoryStore = {
    totalRuns: prev.totalRuns + 1,
    bestScore: Math.max(prev.bestScore, snap.stats.score),
    totalGates: prev.totalGates + entry.gates,
    wordIds: Array.from(wordIds),
    lastRuns: [entry, ...prev.lastRuns].slice(0, MAX_RUNS),
    lifetimePerTone,
    lifetimePerCombo,
    statsVersion: STATS_VERSION,
  };
  saveRunHistory(next);
  return next;
}

/** One synced tone-accuracy row: a single tone ("1".."4") or a pair combo ("3-2"). */
export interface TargetStats {
  target: string;
  attempts: number;
  unheard: number;
  accSum: number;
  best: number;
}

const TONE_TARGET = /^[1-4]$/;
const COMBO_TARGET = /^[1-4]-[1-4]$/;

function maxMerge(prev: LifetimeToneStats | undefined, t: TargetStats): LifetimeToneStats {
  if (!prev) return { attempts: t.attempts, unheard: t.unheard, accSum: t.accSum, best: t.best };
  return {
    attempts: Math.max(prev.attempts, t.attempts),
    unheard: Math.max(prev.unheard, t.unheard),
    accSum: Math.max(prev.accSum, t.accSum),
    best: Math.max(prev.best, t.best),
  };
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
  perTarget: TargetStats[];
}): RunHistoryStore {
  const prev = loadRunHistory();
  const lifetimePerTone = { ...prev.lifetimePerTone };
  const lifetimePerCombo = { ...prev.lifetimePerCombo };
  for (const t of incoming.perTarget) {
    if (TONE_TARGET.test(t.target)) {
      const tone = Number(t.target) as Tone;
      lifetimePerTone[tone] = maxMerge(prev.lifetimePerTone[tone], t);
    } else if (COMBO_TARGET.test(t.target)) {
      lifetimePerCombo[t.target] = maxMerge(prev.lifetimePerCombo[t.target], t);
    }
  }
  const next: RunHistoryStore = {
    ...prev,
    bestScore: Math.max(prev.bestScore, incoming.bestScore),
    totalRuns: Math.max(prev.totalRuns, incoming.totalRuns),
    totalGates: Math.max(prev.totalGates, incoming.totalGates),
    lifetimePerTone,
    lifetimePerCombo,
  };
  saveRunHistory(next);
  return next;
}

/** Lifetime tone accuracy as a flat list of targets, shaped for the account sync layer. */
export function lifetimeTargetStats(store: RunHistoryStore): TargetStats[] {
  const tones = ([1, 2, 3, 4] as Tone[]).map((tone) => ({ target: String(tone), ...store.lifetimePerTone[tone] }));
  const combos = Object.keys(store.lifetimePerCombo)
    .sort()
    .map((key) => ({ target: key, ...store.lifetimePerCombo[key] }));
  return [...tones, ...combos];
}

export interface ToneAccuracy {
  tone: Tone;
  pct: number | null;
  gates: number;
}

/** Tone accuracy per tone, aggregated across the stored last-5 runs. */
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
 * Tone accuracy per tone from lifetime totals (`lifetimePerTone`), for a
 * device whose `lastRuns` is empty (e.g. a second device, before any local run
 * has happened yet). Same unheard-exclusion rule as `toneAccuracyFromHistory`:
 * `attempts` counts only measured gates, matching `gates` there.
 */
export function lifetimeToneAccuracy(store: RunHistoryStore): ToneAccuracy[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => {
    const t = store.lifetimePerTone[tone];
    return { tone, pct: t.attempts > 0 ? (t.accSum / t.attempts) * 100 : null, gates: t.attempts };
  });
}

export interface ComboAccuracy {
  /** `toneComboKey`, e.g. "3-2". */
  key: string;
  tones: Tone[];
  pct: number;
  gates: number;
}

/** Tone accuracy per pair combo across the stored last-5 runs, weakest first; played combos only. */
export function comboAccuracyFromHistory(store: RunHistoryStore): ComboAccuracy[] {
  const sums = new Map<string, { gates: number; accSum: number }>();
  for (const run of store.lastRuns) {
    for (const [key, c] of Object.entries(run.perCombo ?? {})) {
      const prev = sums.get(key) ?? { gates: 0, accSum: 0 };
      sums.set(key, { gates: prev.gates + c.gates, accSum: prev.accSum + c.accSum });
    }
  }
  return comboRows([...sums.entries()]);
}

/** Tone accuracy per pair combo from lifetime totals, weakest first; played combos only. */
export function lifetimeComboAccuracy(store: RunHistoryStore): ComboAccuracy[] {
  return comboRows(
    Object.entries(store.lifetimePerCombo).map(([key, c]) => [key, { gates: c.attempts, accSum: c.accSum }]),
  );
}

function comboRows(entries: [string, { gates: number; accSum: number }][]): ComboAccuracy[] {
  return entries
    .filter(([, c]) => c.gates > 0)
    .map(([key, c]) => ({
      key,
      tones: key.split("-").map(Number) as Tone[],
      pct: (c.accSum / c.gates) * 100,
      gates: c.gates,
    }))
    .sort((a, b) => a.pct - b.pct || a.key.localeCompare(b.key));
}
