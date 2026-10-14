/**
 * Which runs Progress's tone-accuracy bars read (brief 05). Pure — no React,
 * no Supabase.
 *
 * Free and guest: always the last 5 runs. Pro picks: the last 5, the last 50
 * (the latest 50 `run_log` rows' `per_key` summed), or all time
 * (`tone_accuracy_stats`, cached in the store's lifetime totals). An empty
 * period shows an empty state — it never falls back to another period.
 */
import type { Tier } from "./tiers.ts";
import {
  comboAccuracyFromHistory,
  lifetimeComboAccuracy,
  lifetimeToneAccuracy,
  toneAccuracyFromHistory,
  type ComboAccuracy,
  type RunHistoryEntry,
  type RunHistoryStore,
  type ToneAccuracy,
} from "./runHistory.ts";

export type AccuracyPeriod = "last5" | "last50" | "all";

export const PERIODS: AccuracyPeriod[] = ["last5", "last50", "all"];

export const PERIOD_LABEL: Record<AccuracyPeriod, string> = {
  last5: "Last 5 runs",
  last50: "Last 50 runs",
  all: "All time",
};

export function periodAllowed(tier: Tier, period: AccuracyPeriod): boolean {
  return period === "last5" || tier === "pro";
}

/** The period actually shown: a locked choice falls back to the last 5. */
export function effectivePeriod(tier: Tier, chosen: AccuracyPeriod): AccuracyPeriod {
  return periodAllowed(tier, chosen) ? chosen : "last5";
}

export interface PeriodAccuracy {
  tones: ToneAccuracy[];
  combos: ComboAccuracy[];
  /** No measured gate in the period: show "Play a run to see it here." */
  empty: boolean;
}

/**
 * The bars for one period. `last50` is the fetched latest-50 runs (null while
 * loading — reads as empty).
 */
export function periodAccuracy(
  period: AccuracyPeriod,
  store: RunHistoryStore,
  last50: RunHistoryEntry[] | null,
): PeriodAccuracy {
  let tones: ToneAccuracy[];
  let combos: ComboAccuracy[];
  if (period === "all") {
    tones = lifetimeToneAccuracy(store);
    combos = lifetimeComboAccuracy(store);
  } else {
    const runs = period === "last50" ? (last50 ?? []) : store.lastRuns.slice(0, 5);
    tones = toneAccuracyFromHistory({ lastRuns: runs });
    combos = comboAccuracyFromHistory({ lastRuns: runs });
  }
  return { tones, combos, empty: tones.every((t) => t.gates === 0) && combos.length === 0 };
}
