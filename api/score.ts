/**
 * Server-authoritative write for the weekly leaderboard.
 *
 * A player's score is contestable — they must not be able to POST
 * "I scored 999999". So this is the only writer of `leaderboard_scores`:
 * it holds the Supabase service-role key (never bundled to the client) and
 * there is deliberately NO row-level-security write policy on that table,
 * so a client with a valid session still cannot write it directly.
 *
 * `user_id` always comes from a verified `auth.getUser(token)` call, never
 * from the request body, even if the client sends one. `week_id` always
 * comes from server time, never from the client.
 *
 * Full anti-cheat is out of scope. This stops casual devtools spoofing, not
 * a determined attacker.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_passcode.js";

const MAX_SCORE = 1_000_000;
const RATE_LIMIT_WINDOW_MS = 3000;

/**
 * Per-instance, best-effort rate limit: user_id -> last accepted write's
 * timestamp. Serverless instances don't share memory, so a determined
 * abuser can just hit a different instance — this only deters casual
 * double-submits. Pruned on every call so a long-lived instance's map
 * doesn't grow without bound.
 */
const lastAcceptedAt = new Map<string, number>();

function pruneRateLimit(now: number): void {
  for (const [userId, ts] of lastAcceptedAt) {
    if (now - ts >= RATE_LIMIT_WINDOW_MS) lastAcceptedAt.delete(userId);
  }
}

/**
 * ISO week id, e.g. "2026-W36". Uses the ISO 8601 week-year, which can
 * differ from the calendar year at the turn of the year (e.g. 2027-01-01
 * falls in week 53 of ISO year 2026).
 */
export function isoWeekId(d: Date): string {
  // Copy, then shift to the Thursday of this ISO week: ISO weeks are
  // defined by the year containing that week's Thursday.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const isoDayOfWeek = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - isoDayOfWeek);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[score] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars");
    return json(503, { error: "Leaderboard is temporarily unavailable." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    return json(401, { error: "Missing or malformed Authorization header." });
  }
  const token = match[1];

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return json(401, { error: "Invalid or expired session." });
  }
  const userId = user.id;

  const score = (body as Record<string, unknown>)?.score;
  if (typeof score !== "number" || !Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return json(400, { error: "Score must be an integer between 0 and 1000000." });
  }

  const now = Date.now();
  pruneRateLimit(now);
  const last = lastAcceptedAt.get(userId);
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return json(429, { error: "Too many submissions. Please slow down." });
  }

  const weekId = isoWeekId(new Date());

  const { data: existing, error: readError } = await supabase
    .from("leaderboard_scores")
    .select("best_score")
    .eq("user_id", userId)
    .eq("week_id", weekId)
    .maybeSingle();

  if (readError) {
    console.error("[score] Failed to read existing score", readError);
    return json(502, { error: "Could not save score. Please try again." });
  }

  let bestScore = existing?.best_score ?? null;

  if (bestScore === null) {
    const { data: inserted, error: insertError } = await supabase
      .from("leaderboard_scores")
      .insert({ user_id: userId, week_id: weekId, best_score: score })
      .select("best_score")
      .single();
    if (insertError) {
      // A foreign-key violation here means the player has no `profiles` row:
      // they submitted without joining the board first, which the client flow
      // is supposed to prevent.
      console.error("[score] Failed to insert score", insertError);
      return json(502, { error: "Could not save score. Please try again." });
    }
    bestScore = inserted.best_score;
  } else if (score > bestScore) {
    const { data: updated, error: updateError } = await supabase
      .from("leaderboard_scores")
      // `updated_at`'s default only fires on insert, so a raise has to set it
      // explicitly or the row keeps the timestamp of the player's first score.
      .update({ best_score: score, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("week_id", weekId)
      .select("best_score")
      .single();
    if (updateError) {
      console.error("[score] Failed to update score", updateError);
      return json(502, { error: "Could not save score. Please try again." });
    }
    bestScore = updated.best_score;
  }
  // else: new score is <= standing best, no-op — bestScore already holds it.

  lastAcceptedAt.set(userId, now);

  return json(200, { ok: true, weekId, bestScore });
}
