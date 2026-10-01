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

export type LogOutcome = "finished" | "out_of_hearts" | "quit" | "restart";

export interface PerKeyStat {
  gates: number;
  accSum: number;
}

/** The body of one `api/runlog.ts` POST (minus `day`). */
export interface RunLogEntry {
  mode: RunMode;
  score: number;
  gates: number;
  outcome: LogOutcome;
  /** The run's average tone accuracy, 0..1; null when no gate was scored. */
  tone_acc: number | null;
  per_key: Record<string, PerKeyStat>;
}

/** A stored row, as the Progress screen reads it. */
export interface RunLogRow extends RunLogEntry {
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

/** One run's log row. Measured gates only: unheard gates have no accuracy. */
export function buildRunLogEntry(stats: RunStats, mode: RunMode, outcome: LogOutcome): RunLogEntry {
  const per_key: Record<string, PerKeyStat> = {};
  const add = (key: string, gates: number, accSum: number) => {
    if (gates < 1) return;
    per_key[key] = { gates, accSum: Math.min(Math.max(accSum, 0), gates) };
  };
  for (const t of [1, 2, 3, 4] as Tone[]) add(String(t), stats.perTone[t].gates, stats.perTone[t].accSum);
  for (const [key, c] of Object.entries(stats.perCombo ?? {})) add(key, c.gates, c.accSum);
  const all = Object.values(per_key);
  const gates = all.reduce((s, e) => s + e.gates, 0);
  const accSum = all.reduce((s, e) => s + e.accSum, 0);
  return { mode, score: Math.round(stats.score), gates, outcome, tone_acc: gates > 0 ? accSum / gates : null, per_key };
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
  return [...trend.keys()].sort((a, b) => {
    const ca = a.includes("-");
    const cb = b.includes("-");
    return ca === cb ? a.localeCompare(b) : ca ? 1 : -1;
  });
}
