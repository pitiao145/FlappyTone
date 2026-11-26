/**
 * Which runs Progress's tone-accuracy bars read (brief 05, weeks since brief
 * 55). Pure — no React, no Supabase.
 *
 * Free: always the last 5 runs. Pro: one local week at a time (‹ week ›,
 * Monday to Sunday), from that week's counted `run_log` rows. Weeks only:
 * there is no month, "last 50" or "all time" period any more. An empty
 * period shows an empty state — it never falls back to another period.
 */
import type { Tier } from "./tiers.ts";
import {
  comboAccuracyFromHistory,
  toneAccuracyFromHistory,
  type ComboAccuracy,
  type RunHistoryEntry,
  type RunHistoryStore,
  type ToneAccuracy,
} from "./runHistory.ts";

export type AccuracyPeriod = "last5" | "week";

/** Free reads the last 5; Pro reads a week. */
export function periodFor(tier: Tier): AccuracyPeriod {
  return tier === "pro" ? "week" : "last5";
}

export interface PeriodAccuracy {
  tones: ToneAccuracy[];
  combos: ComboAccuracy[];
  /** No measured gate in the period: show "Play a run to see it here." */
  empty: boolean;
}

/**
 * The bars for one period. `weekRuns` is the selected week's fetched runs
 * (null while loading — reads as empty).
 */
export function periodAccuracy(
  period: AccuracyPeriod,
  store: RunHistoryStore,
  weekRuns: RunHistoryEntry[] | null,
): PeriodAccuracy {
  const runs = period === "week" ? (weekRuns ?? []) : store.lastRuns.slice(0, 5);
  const tones = toneAccuracyFromHistory({ lastRuns: runs });
  const combos = comboAccuracyFromHistory({ lastRuns: runs });
  return { tones, combos, empty: tones.every((t) => t.gates === 0) && combos.length === 0 };
}
