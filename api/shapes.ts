/**
 * Sole writer of `player_tone_shapes` (spec B): a Pro player's own tone
 * lines, ADDED into per-day buckets.
 *
 * Same shape as `api/run.ts` — service-role key, JWT-verified `user_id`, no
 * client write policy on the table. Three things the client may not decide:
 * whether the player is Pro (read from `entitlements`, which only the Lemon
 * Squeezy webhook writes), that the numbers add rather than replace (a sum
 * cannot merge by max), and that the values are sane (bounded here).
 *
 * `day` is the client's local date, bounded to within a day of server UTC,
 * exactly as `api/run.ts` bounds it.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_json.js";

/** Points per line — `averagePolyline`'s grid (`SAMPLES + 1` in `src/game/toneAverage.ts`). */
export const SHAPE_POINTS = 61;
/** Chao bounds for one line's value; a bucket's sum is bounded by count × these. */
const CHAO_MIN = 0.5;
const CHAO_MAX = 5.5;
/** Four tones + 16 combos is every key there is. */
const MAX_ENTRIES = 20;
/** Far above any real run or visualiser session; stops one request inflating a bucket. */
const MAX_COUNT = 1000;

const KEY_RE = /^[1-4](-[1-4])?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShapeEntry {
  key: string;
  sum: number[];
  count: number;
}

/** The validated entries, or null when any part of the body is wrong. */
export function parseEntries(raw: unknown): ShapeEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ENTRIES) return null;
  const seen = new Set<string>();
  const out: ShapeEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") return null;
    const { key, sum, count } = e as Record<string, unknown>;
    if (typeof key !== "string" || !KEY_RE.test(key) || seen.has(key)) return null;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;
    if (!Array.isArray(sum) || sum.length !== SHAPE_POINTS) return null;
    for (const v of sum) {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      if (v < CHAO_MIN * count || v > CHAO_MAX * count) return null;
    }
    seen.add(key);
    out.push({ key, sum: sum as number[], count });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[shapes] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars");
    return json(503, { error: "Shape tracking is temporarily unavailable." });
  }

  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return json(401, { error: "Missing or malformed Authorization header." });
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
  const requested = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(requested.getTime()) || Math.abs(requested.getTime() - Date.now()) > DAY_MS) {
    return json(400, { error: "day is outside the allowed range." });
  }

  const entries = parseEntries((body as Record<string, unknown>)?.entries);
  if (!entries) return json(400, { error: "entries are invalid." });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "Invalid or expired session." });
  if (user.is_anonymous) return json(403, { error: "Guests have no shape history." });

  const { data: ent } = await supabase
    .from("entitlements")
    .select("has_access")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ent?.has_access) return json(403, { error: "Shape history is a Pro feature." });

  const { error } = await supabase.rpc("add_tone_shapes", {
    p_user_id: user.id,
    p_day: day,
    p_rows: entries,
  });
  if (error) {
    console.error("[shapes] add_tone_shapes failed", error);
    return json(502, { error: "Could not record shapes." });
  }
  return json(200, { ok: true });
}
