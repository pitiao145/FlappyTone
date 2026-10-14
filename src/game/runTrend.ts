/**
 * A Pro player's run log (spec C): building one row from a finished run, and
 * turning many rows into the per-day accuracy trend. Pure logic — no React,
 * no Supabase.
 *
 * Keys match `tone_accuracy_stats`' targets: "1".."4" for a single tone, a
 * `toneComboKey` ("3-2") for a pair. A day's accuracy for a key is
 * Σ accSum ÷ Σ gates over that day's runs, so a long run weighs more than a
 * short one, the same way the lifetime stats do.
 */

import type { Tone } from "./gates.ts";
import type { RunMode } from "./run.ts";
import type { RunStats } from "./scoring.ts";
import { isSpokenKey } from "./words.ts";

export type LogOutcome = "finished" | "out_of_hearts" | "quit" | "restart";

export interface PerKeyStat {
  /** Heard (measured) gates. */
  gates: number;
  accSum: number;
  /** Unheard gates — no accuracy, tallied apart (hard rule 8). Absent on rows from before brief 05. */
  unheard?: number;
  /** Highest single-gate tone accuracy, 0..1. Absent on rows from before brief 05. */
  best?: number;
}

/** The body of one `api/runlog.ts` POST (minus `day`). */
export interface RunLogEntry {
  /** Client-minted uuid: the server adds a run once, however often it is posted. */
  runId: string;
  mode: RunMode;
  score: number;
  gates: number;
  outcome: LogOutcome;
  /** The run's average tone accuracy, 0..1; null when no gate was scored. */
  tone_acc: number | null;
  per_key: Record<string, PerKeyStat>;
  /** Word ids flown this run, for the account's "words" count. */
  wordIds: string[];
}

/** A stored row, as the Progress screen reads it. */
export interface RunLogRow extends Omit<RunLogEntry, "runId" | "wordIds"> {
  id: number;
  played_at: string;
  day: string;
}

export interface TrendPoint {
  day: string;
  /** 0..1 */
  accuracy: number;
  /** Scored gates behind the point. */
  gates: number;
}

/**
 * One run's log row. `gates`/`accSum` are measured gates only (unheard gates
 * have no accuracy), matching the local `recordRun`'s `totalGates`; `unheard`
 * and `best` ride along so the server's lifetime stats keep the same columns
 * the local ones do. A key with only unheard gates is kept for that tally.
 */
export function buildRunLogEntry(
  stats: RunStats,
  mode: RunMode,
  outcome: LogOutcome,
  runId: string,
  wordIds: readonly string[],
): RunLogEntry {
  const per_key: Record<string, PerKeyStat> = {};
  const add = (key: string, s: { gates: number; accSum: number; unheard: number; best: number }) => {
    if (s.gates < 1 && s.unheard < 1) return;
    per_key[key] = {
      gates: s.gates,
      accSum: Math.min(Math.max(s.accSum, 0), s.gates),
      unheard: s.unheard,
      best: Math.min(Math.max(s.best, 0), 1),
    };
  };
  for (const t of [1, 2, 3, 4] as Tone[]) add(String(t), stats.perTone[t]);
  for (const [key, c] of Object.entries(stats.perCombo ?? {})) add(key, c);
  const all = Object.values(per_key);
  const gates = all.reduce((s, e) => s + e.gates, 0);
  const accSum = all.reduce((s, e) => s + e.accSum, 0);
  return {
    runId,
    mode,
    score: Math.round(stats.score),
    gates,
    outcome,
    tone_acc: gates > 0 ? accSum / gates : null,
    per_key,
    // Same bound as `api/runlog.ts`: one odd id must not cost the whole run.
    wordIds: [...new Set(wordIds)].filter((w) => /^[a-z0-9_]{1,40}$/.test(w)).slice(0, 200),
  };
}

/** Per key, one point per day with data, oldest first. */
export function dailyTrend(rows: Pick<RunLogRow, "day" | "per_key">[]): Map<string, TrendPoint[]> {
  const sums = new Map<string, Map<string, PerKeyStat>>();
  for (const row of rows) {
    for (const [key, e] of Object.entries(row.per_key)) {
      if (!(e.gates > 0)) continue;
      let days = sums.get(key);
      if (!days) sums.set(key, (days = new Map()));
      const d = days.get(row.day) ?? { gates: 0, accSum: 0 };
      d.gates += e.gates;
      d.accSum += e.accSum;
      days.set(row.day, d);
    }
  }
  const out = new Map<string, TrendPoint[]>();
  for (const [key, days] of sums) {
    out.set(
      key,
      [...days.entries()]
        .map(([day, d]) => ({ day, accuracy: d.accSum / d.gates, gates: d.gates }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    );
  }
  return out;
}

/** Keys the player has data for: tones 1–4 first, then combos, each in order. */
export function trendKeys(trend: Map<string, TrendPoint[]>): string[] {
  return [...trend.keys()].filter(isSpokenKey).sort((a, b) => {
    const ca = a.includes("-");
    const cb = b.includes("-");
    return ca === cb ? a.localeCompare(b) : ca ? 1 : -1;
  });
}
