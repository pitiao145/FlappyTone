/**
 * Posting an account's runs and reading its run log back (brief 05; spec C).
 * Writes go through `api/runlog.ts` (the table has no client write policy),
 * via the outbox so a run played offline still lands; reads are the
 * owner-only RLS select.
 *
 * Never throws (the `src/data/` contract): a failed POST stays in the outbox
 * for the next load, a failed read shows the empty state.
 */
import { getSupabase, warn } from "./supabase.ts";
import { localDay } from "../game/playerShape.ts";
import type { PerKeyStat, RunLogEntry } from "../game/runTrend.ts";
import { drainOutbox, enqueueRun, type OutboxItem, type PostResult } from "./runOutbox.ts";
import { accountUserId, ensureProfile, refreshServerStats } from "./stats.ts";

async function bearer(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** A 4xx other than 401 will never succeed: drop it rather than retry forever. */
export function resultForStatus(status: number): PostResult {
  if (status >= 200 && status < 300) return "done";
  if (status >= 400 && status < 500 && status !== 401 && status !== 429) return "done";
  return "retry";
}

async function postItem(item: OutboxItem): Promise<PostResult> {
  const token = await bearer();
  if (!token) return "retry";
  const res = await fetch("/api/runlog", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ day: item.day, run: item.run }),
    keepalive: true,
  });
  if (!res.ok) warn("runlog", `POST failed: ${res.status}`);
  return resultForStatus(res.status);
}

let draining: Promise<number> | null = null;

/** Posts every waiting run of the signed-in account. Returns how many were sent. */
export function flushRunOutbox(): Promise<number> {
  if (draining) return draining;
  draining = (async () => {
    try {
      const userId = await accountUserId();
      if (!userId) return 0;
      await ensureProfile(userId);
      return await drainOutbox(userId, postItem);
    } catch (err) {
      warn("runlog", "outbox drain failed", err);
      return 0;
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/**
 * Logs one run for an account (every tier; the server decides what it keeps
 * and counts). Fire-and-forget; a no-op for a guest, whose progress stays on
 * the device. Refreshes the local cache from the server once it landed.
 */
export async function postRunLog(run: RunLogEntry): Promise<void> {
  try {
    const userId = await accountUserId();
    if (!userId) return;
    enqueueRun({ userId, day: localDay(), run });
    if ((await flushRunOutbox()) > 0) await refreshServerStats();
  } catch (err) {
    warn("runlog", "POST failed", err);
  }
}

/** Every run's day and per-key numbers, for the daily trend; empty on any failure. */
export async function fetchTrendRows(): Promise<{ day: string; per_key: Record<string, PerKeyStat> }[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from("run_log")
      .select("day, per_key")
      .eq("user_id", userId)
      .order("played_at", { ascending: true });
    if (error || !data) return [];
    return data as unknown as { day: string; per_key: Record<string, PerKeyStat> }[];
  } catch (err) {
    warn("runlog", "trend read failed", err);
    return [];
  }
}
