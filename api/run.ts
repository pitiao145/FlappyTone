/**
 * Server-authoritative daily run counter, for accounts only.
 *
 * A guest's cap stays on-device (`src/game/dailyLimit.ts`) — clearing storage
 * mints a new anonymous identity, so a server count would be theatre. An
 * account is durable, so its cap can be real: this is the only writer of
 * `daily_runs`, same shape as `api/score.ts` — service-role key, JWT-verified
 * `user_id`, no client write policy on the table at all.
 *
 * Anonymous users are rejected outright: they have no `daily_runs` row (RLS
 * and 0011's policy both restrict it to permanent accounts) and are capped
 * on-device instead.
 *
 * `day` comes from the client (its own local date) because the cap should
 * reset on the player's day, not UTC's — but a device clock is something a
 * player can set, so it's bounded to within a day of the server's own UTC
 * date rather than trusted outright.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_passcode.js";

// Mirrors `TIER_LIMITS` in `src/game/tiers.ts`. Importing that module here
// would pull the game's build graph into a Vercel function; duplicating two
// numbers is cheaper than that. `src/game/tiers.ts` is the source of truth —
// if it moves, update this too.
const FREE_RUNS_PER_DAY = 10;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[run] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars");
    return json(503, { error: "Run tracking is temporarily unavailable." });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    return json(401, { error: "Missing or malformed Authorization header." });
  }
  const token = match[1];

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const day = (body as Record<string, unknown>)?.day;
  if (typeof day !== "string" || !DATE_RE.test(day)) {
    return json(400, { error: "day must be YYYY-MM-DD." });
  }

  const now = new Date();
  const requested = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(requested.getTime()) || Math.abs(requested.getTime() - now.getTime()) > DAY_MS) {
    return json(400, { error: "day is outside the allowed range." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return json(401, { error: "Invalid or expired session." });
  }
  if (user.is_anonymous) {
    return json(403, { error: "Guests are capped on-device." });
  }
  const userId = user.id;

  // Pro is uncapped. The flag is read here, server-side, from the table only a
  // webhook can write — never from the request, which the client controls.
  const { data: ent } = await supabase
    .from("entitlements")
    .select("has_access")
    .eq("user_id", userId)
    .maybeSingle();
  const limit = ent?.has_access ? Infinity : FREE_RUNS_PER_DAY;

  const { data: existing, error: readError } = await supabase
    .from("daily_runs")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  if (readError) {
    console.error("[run] Failed to read existing count", readError);
    return json(502, { error: "Could not record run. Please try again." });
  }

  let count: number;
  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("daily_runs")
      .insert({ user_id: userId, day, count: 1 })
      .select("count")
      .single();
    if (insertError) {
      console.error("[run] Failed to insert count", insertError);
      return json(502, { error: "Could not record run. Please try again." });
    }
    count = inserted.count;
  } else {
    const { data: updated, error: updateError } = await supabase
      .from("daily_runs")
      .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("day", day)
      .select("count")
      .single();
    if (updateError) {
      console.error("[run] Failed to update count", updateError);
      return json(502, { error: "Could not record run. Please try again." });
    }
    count = updated.count;
  }

  // JSON has no Infinity — it would serialise to null and read as 0 on the
  // client. `null` says "no limit" explicitly instead.
  return json(200, {
    count,
    limit: Number.isFinite(limit) ? limit : null,
    allowed: count <= limit,
  });
}
