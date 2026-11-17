/**
 * A new account's demo rounds (brief 50): the Try it now rounds parked in
 * this browser (`src/lib/demoRuns.ts`) become the account's first runs.
 *
 * Only an account created after the first parked round imports them (same
 * rule and 10 s slack as `authMode`): a returning player who tried the demo
 * signed out keeps their own history untouched. The key is cleared after
 * every call, whatever the account, so a round is offered once.
 *
 * The rounds go into the run outbox (`runOutbox.ts`) with the day they were
 * played, so they reach the server only through `api/runlog.ts` (hard rule
 * 11), never the leaderboard or the daily run count. Each keeps its parked
 * `runId`, the server's idempotency key: a reload or a second tab cannot add
 * a round twice. The caller's `syncAccount()` flushes the outbox right after.
 *
 * Never throws (hard rule 10).
 */
import { buildRunLogEntry } from "../game/runTrend.ts";
import { newRunStats, type RunStats } from "../game/scoring.ts";
import type { Tone } from "../game/gates.ts";
import { clearDemoRuns, readDemoRuns, type DemoRun } from "../lib/demoRuns.ts";
import { enqueueRun } from "./runOutbox.ts";

/** Same slack as `authMode` (`src/app/authGate.ts`). */
const NEW_ACCOUNT_SLACK_MS = 10_000;

const NOTICE_KEY = "toneflap.demoImportNotice.v1";

/** Whether an account created at `createdAt` is newer than the first parked round. */
export function isNewSince(createdAt: string | null | undefined, firstAt: number): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && t >= firstAt - NEW_ACCOUNT_SLACK_MS;
}

function statsOf(run: DemoRun): RunStats {
  const stats = newRunStats();
  stats.score = run.score;
  for (const t of [1, 2, 3, 4] as Tone[]) {
    const s = run.perTone[String(t)];
    if (s) stats.perTone[t] = { ...stats.perTone[t], gates: s.gates, accSum: s.accSum, unheard: s.unheard, best: s.best };
  }
  stats.perCombo = Object.fromEntries(
    Object.entries(run.perCombo).map(([k, s]) => [k, { gates: s.gates, accSum: s.accSum, unheard: s.unheard, best: s.best }]),
  ) as RunStats["perCombo"];
  return stats;
}

/**
 * Imports the parked demo rounds into `account` when it is new since the
 * first of them. Returns how many were queued (0 for an existing account or
 * nothing parked). Clears the parked rounds in every case.
 */
export function importDemoRuns(account: { userId: string | null; createdAt?: string | null }, now = Date.now()): number {
  try {
    const runs = readDemoRuns(now);
    if (runs.length === 0 || !account.userId) return 0;
    if (!isNewSince(account.createdAt, runs[0].at)) return 0;
    for (const r of runs) {
      enqueueRun({
        userId: account.userId,
        day: r.day,
        run: buildRunLogEntry(statsOf(r), r.mode, "finished", r.runId, r.wordIds),
      });
    }
    saveNotice(account.userId, runs.length);
    return runs.length;
  } catch {
    return 0;
  } finally {
    // Only a signed-in account clears them: a signed-out /app load must not
    // throw away rounds a signup a minute later would import.
    if (account.userId) clearDemoRuns();
  }
}

function saveNotice(userId: string, count: number): void {
  try {
    localStorage.setItem(NOTICE_KEY, JSON.stringify({ userId, count }));
  } catch {
    // No notice: the rounds are still saved.
  }
}

/** The "N demo rounds saved" count waiting for this account's Play home, or 0. */
export function pendingDemoNotice(userId: string | null): number {
  try {
    const raw = localStorage.getItem(NOTICE_KEY);
    if (!raw || !userId) return 0;
    const n = JSON.parse(raw) as { userId?: unknown; count?: unknown };
    return n.userId === userId && typeof n.count === "number" && n.count > 0 ? n.count : 0;
  } catch {
    return 0;
  }
}

/** The notice was shown: never again. */
export function dismissDemoNotice(): void {
  try {
    localStorage.removeItem(NOTICE_KEY);
  } catch {
    // Shown again next time at worst.
  }
}
