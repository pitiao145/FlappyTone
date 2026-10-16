/**
 * XP and levels. Derived, never stored: XP is a formula over the lifetime
 * tone-accuracy totals the player already has — the server's
 * `tone_accuracy_stats` for an account (cached in `runHistory.ts`), the
 * device's own for a guest. So there is no XP table and no new writer, a run
 * is never counted twice (`record_run` is idempotent by runId), guest progress
 * carries over on sign-up through the existing adoption, and retuning the
 * formula re-scores everyone consistently.
 *
 * Accuracy-weighted on purpose (Pierre): the point is to practise and get
 * better, so a heard gate earns a little for showing up and most of its XP
 * from tone accuracy. An unheard gate earns nothing and costs nothing (hard
 * rule 8). Kept deliberately stingy — see `levelThreshold`.
 *
 * Counted runs only (game, drill, pairs; not restart, tutorial, learn), since
 * those are the runs that feed the lifetime totals. Totals since the tone
 * accuracy reset (`STATS_VERSION` 2, 28 Sep 2026).
 *
 * Cosmetic only: runs are client-reported, so XP must never gate anything
 * that matters more than a theme.
 */

import type { RunStats } from "./scoring.ts";
import { loadRunHistory, type RunHistoryStore } from "./runHistory.ts";

/** XP for showing up: per heard gate (wall hits included). */
export const XP_PER_GATE = 2;
/** XP for a gate at 100% tone accuracy, on top of `XP_PER_GATE`. */
export const XP_PER_ACCURACY = 8;

/** XP from a heard-gate count and its summed tone accuracy. */
export function xpFrom(gates: number, accSum: number): number {
  return Math.round(XP_PER_GATE * Math.max(0, gates) + XP_PER_ACCURACY * Math.max(0, accSum));
}

/** A player's total XP, from their lifetime totals. */
export function totalXp(store: Pick<RunHistoryStore, "lifetimePerTone" | "lifetimePerCombo">): number {
  let gates = 0;
  let acc = 0;
  for (const s of [...Object.values(store.lifetimePerTone), ...Object.values(store.lifetimePerCombo)]) {
    gates += s.attempts;
    acc += s.accSum;
  }
  return xpFrom(gates, acc);
}

/** The XP one run earned, from its own stats. Same formula as `totalXp`. */
export function runXp(stats: Pick<RunStats, "perTone" | "perCombo">): number {
  let gates = 0;
  let acc = 0;
  for (const s of [...Object.values(stats.perTone), ...Object.values(stats.perCombo ?? {})]) {
    gates += s.gates;
    acc += s.accSum;
  }
  return xpFrom(gates, acc);
}

/**
 * Total XP needed to reach `level` (level 1 is 0). 250 × (L−1)^1.6: a ~20-gate
 * run at 70% earns ~150 XP, so level 2 is about 2 runs, level 3 about 5,
 * level 5 about 15, level 10 about 55.
 */
export function levelThreshold(level: number): number {
  return level <= 1 ? 0 : Math.round(250 * (level - 1) ** 1.6);
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP into the current level, and the size of the current level's span. */
  intoLevel: number;
  levelSpan: number;
  /** XP still needed for the next level. */
  toNext: number;
}

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  while (xp >= levelThreshold(level + 1)) level++;
  const lo = levelThreshold(level);
  const hi = levelThreshold(level + 1);
  return { level, xp, intoLevel: xp - lo, levelSpan: hi - lo, toNext: hi - xp };
}

/** This device's view of the player's XP: the account's server cache, or a guest's own. */
export function playerXp(): number {
  return totalXp(loadRunHistory());
}
