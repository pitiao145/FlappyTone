/**
 * The player's stored tone shapes (spec B) — Pro only. Writes go through
 * `api/shapes.ts` (the table has no client write policy); reads are the
 * owner-only RLS select.
 *
 * Never throws (the `src/data/` contract): a failed POST loses that run's
 * shape data only, a failed read shows the empty state.
 */
import { getSupabase, warn } from "./supabase.ts";
import { getTier } from "./tier.ts";
import { localDay, type ShapeBucket, type ShapeRow } from "../game/playerShape.ts";

/** Adds a run's (or a visualiser session's) buckets to today's rows. Fire-and-forget. */
export async function postShapes(buckets: ShapeBucket[], opts: { keepalive?: boolean } = {}): Promise<void> {
  if (buckets.length === 0 || getTier() !== "pro") return;
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/shapes", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ day: localDay(), entries: buckets }),
      keepalive: opts.keepalive,
    });
    if (!res.ok) warn("shapes", `POST failed: ${res.status}`);
  } catch (err) {
    warn("shapes", "POST failed", err);
  }
}

/** Every stored row for the signed-in player; empty on any failure. */
export async function fetchShapes(): Promise<ShapeRow[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from("player_tone_shapes")
      .select("key, day, sum, count")
      .eq("user_id", userId);
    if (error || !data) return [];
    return data;
  } catch (err) {
    warn("shapes", "read failed", err);
    return [];
  }
}
