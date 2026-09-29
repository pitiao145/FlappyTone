/**
 * Sole writer of `run_log` (spec C): a Pro player's all-time run history.
 *
 * Same shape as `api/shapes.ts` — service-role key, JWT-verified `user_id`,
 * no client write policy. The client may not decide: whether the player is
 * Pro (`entitlements`, webhook-written), when the run happened (`played_at`
 * is the column default, server time), or that the numbers are sane (bounded
 * here; score like `api/score.ts`).
 *
 * `day` is the client's local date, bounded to within a day of server UTC,
 * exactly as `api/run.ts` bounds it.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_json.js";

/** Mirrors `api/score.ts`. */
const MAX_SCORE = 1_000_000;
/** Far above any real run's scored gates. */
const MAX_GATES = 500;
/** Four tones + 16 combos is every key there is. */
const MAX_KEYS = 20;

const MODES = ["game", "tutorial", "single", "drill", "learn", "pairs"];
const OUTCOMES = ["finished", "out_of_hearts", "quit", "restart"];
const KEY_RE = /^[1-4](-[1-4])?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunLogEntry {
  mode: string;
  score: number;
  gates: number;
  outcome: string;
  tone_acc: number | null;
  per_key: Record<string, { gates: number; accSum: number }>;
}

/** The validated run, or null when any part of the body is wrong. */
export function parseRun(raw: unknown): RunLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.mode !== "string" || !MODES.includes(r.mode)) return null;
  if (typeof r.outcome !== "string" || !OUTCOMES.includes(r.outcome)) return null;
  const { score, gates } = r;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  if (typeof gates !== "number" || !Number.isInteger(gates) || gates < 0 || gates > MAX_GATES) return null;
  const acc = r.tone_acc;
  if (acc !== null && (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0 || acc > 1)) return null;
  const pk = r.per_key;
  if (!pk || typeof pk !== "object" || Array.isArray(pk)) return null;
  const keys = Object.keys(pk);
  if (keys.length > MAX_KEYS) return null;
  const per_key: RunLogEntry["per_key"] = {};
  for (const k of keys) {
    if (!KEY_RE.test(k)) return null;
    const e = (pk as Record<string, unknown>)[k];
    if (!e || typeof e !== "object") return null;
    const { gates: g, accSum } = e as Record<string, unknown>;
    if (typeof g !== "number" || !Number.isInteger(g) || g < 1 || g > MAX_GATES) return null;
    if (typeof accSum !== "number" || !Number.isFinite(accSum) || accSum < 0 || accSum > g) return null;
    per_key[k] = { gates: g, accSum };
  }
  return { mode: r.mode, score, gates, outcome: r.outcome, tone_acc: acc as number | null, per_key };
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[runlog] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars");
    return json(503, { error: "Run history is temporarily unavailable." });
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

  const run = parseRun((body as Record<string, unknown>)?.run);
  if (!run) return json(400, { error: "run is invalid." });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "Invalid or expired session." });
  if (user.is_anonymous) return json(403, { error: "Guests have no run history." });

  const { data: ent } = await supabase
    .from("entitlements")
    .select("has_access")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ent?.has_access) return json(403, { error: "Run history is a Pro feature." });

  const { error } = await supabase.from("run_log").insert({ user_id: user.id, day, ...run });
  if (error) {
    console.error("[runlog] insert failed", error);
    return json(502, { error: "Could not record run." });
  }
  return json(200, { ok: true });
}
