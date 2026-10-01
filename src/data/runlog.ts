/**
 * A Pro player's all-time run log (spec C). Writes go through `api/runlog.ts`
 * (the table has no client write policy); reads are the owner-only RLS select.
 *
 * Never throws (the `src/data/` contract): a failed POST loses that one run's
 * row, a failed read shows the empty state.
 */
import { getSupabase, warn } from "./supabase.ts";
import { getTier } from "./tier.ts";
import { localDay } from "../game/playerShape.ts";
import type { PerKeyStat, RunLogEntry, RunLogRow } from "../game/runTrend.ts";

/** Logs one finished run. Fire-and-forget; a no-op unless the player is Pro. */
export async function postRunLog(run: RunLogEntry): Promise<void> {
  if (getTier() !== "pro") return;
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/runlog", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ day: localDay(), run }),
      keepalive: true,
    });
    if (!res.ok) warn("runlog", `POST failed: ${res.status}`);
  } catch (err) {
    warn("runlog", "POST failed", err);
  }
}

const RUN_COLUMNS = "id, played_at, day, mode, score, gates, outcome, tone_acc, per_key";

/** One page of the player's runs, newest first, plus the all-time count. */
export async function fetchRunLogPage(
  page: number,
  pageSize: number,
): Promise<{ rows: RunLogRow[]; total: number }> {
  try {
    const supabase = getSupabase();
    if (!supabase) return { rows: [], total: 0 };
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { rows: [], total: 0 };
    const { data, error, count } = await supabase
      .from("run_log")
      .select(RUN_COLUMNS, { count: "exact" })
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error || !data) return { rows: [], total: 0 };
    return { rows: data as unknown as RunLogRow[], total: count ?? data.length };
  } catch (err) {
    warn("runlog", "page read failed", err);
    return { rows: [], total: 0 };
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
