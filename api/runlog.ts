/**
 * Sole writer of an account's progress (brief 05): every finished run of
 * every non-anonymous account, plus the one-time guest -> account adoption.
 *
 * Same shape as `api/shapes.ts` — service-role key, JWT-verified `user_id`,
 * no client write policy. The client may not decide: who the player is, when
 * the run happened (`played_at` is the column default), whether the run
 * counts for stats or streak (derived here from mode + outcome, mirroring the
 * local `recordRun`/`recordPlay`), how many rows the player keeps (Pro all,
 * free 5), or that the numbers are sane (bounded here; score like
 * `api/score.ts`).
 *
 * The SQL functions `record_run()` / `adopt_guest()` (migration 0030) do the
 * adding, idempotent by a client-minted `runId` / `adoptId`, so a retry from
 * the client's outbox never counts a run twice.
 *
 * `day` is the client's local date: at most a day ahead of server UTC, and up
 * to `MAX_BACK_DAYS` behind, so an outbox run played offline still lands. The
 * streak only ever moves forward from a day the server already holds, so an
 * old day cannot extend it.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_json.js";

/** Mirrors `api/score.ts`. */
const MAX_SCORE = 1_000_000;
/** Far above any real run's scored gates. */
const MAX_GATES = 500;
/** Four tones + 16 combos is every key there is. */
const MAX_KEYS = 20;
const MAX_WORDS = 200;
const MAX_BACK_DAYS = 7;
/** A free account keeps its latest 5 runs; Pro keeps every row. */
export const FREE_RING = 5;
/** Adoption bounds: far above any real guest's local totals. */
const MAX_ADOPT_RUNS = 10_000;
const MAX_ADOPT_ATTEMPTS = 100_000;

const MODES = ["game", "tutorial", "single", "drill", "learn", "pairs"];
const OUTCOMES = ["finished", "out_of_hearts", "quit", "restart"];
/** The modes whose runs count toward stats and streak (`GameApp`'s `onRunOver`/`onRunQuit`). */
const COUNTED_MODES = ["game", "drill", "pairs"];
const KEY_RE = /^[1-4](-[1-4])?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORD_RE = /^[a-z0-9_]{1,40}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface KeyStat {
  gates: number;
  accSum: number;
  unheard: number;
  best: number;
}

export interface RunLogEntry {
  runId: string | null;
  mode: string;
  score: number;
  gates: number;
  outcome: string;
  tone_acc: number | null;
  per_key: Record<string, KeyStat>;
  wordIds: string[];
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * Validates a per-key map. `gates` counts heard gates (attempts), `unheard`
 * the rest; a key needs at least one of either. `unheard`/`best` default to 0
 * so a pre-brief-05 client's body still parses.
 */
function parsePerKey(pk: unknown, maxGates: number): Record<string, KeyStat> | null {
  if (!pk || typeof pk !== "object" || Array.isArray(pk)) return null;
  const keys = Object.keys(pk);
  if (keys.length > MAX_KEYS) return null;
  const out: Record<string, KeyStat> = {};
  for (const k of keys) {
    if (!KEY_RE.test(k)) return null;
    const e = (pk as Record<string, unknown>)[k];
    if (!e || typeof e !== "object") return null;
    const { gates: g, accSum, unheard = 0, best = 0 } = e as Record<string, unknown>;
    if (!isInt(g, 0, maxGates) || !isInt(unheard, 0, maxGates) || g + unheard < 1) return null;
    if (typeof accSum !== "number" || !Number.isFinite(accSum) || accSum < 0 || accSum > g) return null;
    if (typeof best !== "number" || !Number.isFinite(best) || best < 0 || best > 1) return null;
    out[k] = { gates: g, accSum, unheard, best };
  }
  return out;
}

function parseWords(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_WORDS) return null;
  if (!raw.every((w) => typeof w === "string" && WORD_RE.test(w))) return null;
  return [...new Set(raw as string[])];
}

/** The validated run, or null when any part of the body is wrong. */
export function parseRun(raw: unknown): RunLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.mode !== "string" || !MODES.includes(r.mode)) return null;
  if (typeof r.outcome !== "string" || !OUTCOMES.includes(r.outcome)) return null;
  const { score, gates } = r;
  if (!isInt(score, 0, MAX_SCORE) || !isInt(gates, 0, MAX_GATES)) return null;
  const acc = r.tone_acc;
  if (acc !== null && (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0 || acc > 1)) return null;
  // Absent on a pre-brief-05 client: logged without idempotency, as before.
  let runId: string | null = null;
  if (r.runId !== undefined) {
    if (typeof r.runId !== "string" || !UUID_RE.test(r.runId)) return null;
    runId = r.runId.toLowerCase();
  }
  const per_key = parsePerKey(r.per_key, MAX_GATES);
  if (!per_key) return null;
  const wordIds = parseWords(r.wordIds);
  if (!wordIds) return null;
  return { runId, mode: r.mode, score, gates, outcome: r.outcome, tone_acc: acc as number | null, per_key, wordIds };
}

/** Whether a run counts toward counters/accuracy, and toward the streak. Mirrors `GameApp`. */
export function runFlags(mode: string, outcome: string): { stats: boolean; streak: boolean } {
  const counted = COUNTED_MODES.includes(mode);
  return {
    stats: counted && outcome !== "restart",
    streak: counted && (outcome === "finished" || outcome === "out_of_hearts"),
  };
}

export interface Adoption {
  adoptId: string;
  runs: number;
  gates: number;
  best: number;
  streakCurrent: number;
  streakBest: number;
  streakLastDay: string | null;
  per_key: Record<string, KeyStat>;
  wordIds: string[];
}

export function parseAdoption(raw: unknown): Adoption | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.adoptId !== "string" || !UUID_RE.test(a.adoptId)) return null;
  if (!isInt(a.runs, 0, MAX_ADOPT_RUNS) || !isInt(a.gates, 0, MAX_ADOPT_ATTEMPTS)) return null;
  if (!isInt(a.best, 0, MAX_SCORE)) return null;
  if (!isInt(a.streakCurrent, 0, 10_000) || !isInt(a.streakBest, 0, 10_000)) return null;
  const last = a.streakLastDay ?? null;
  if (last !== null && !(typeof last === "string" && DATE_RE.test(last) && validDay(last, 3650))) return null;
  const per_key = parsePerKey(a.per_key, MAX_ADOPT_ATTEMPTS);
  if (!per_key) return null;
  if (Array.isArray(a.wordIds) && a.wordIds.length > 5000) return null;
  const words = Array.isArray(a.wordIds) ? a.wordIds : [];
  if (!words.every((w) => typeof w === "string" && WORD_RE.test(w))) return null;
  return {
    adoptId: a.adoptId.toLowerCase(),
    runs: a.runs,
    gates: a.gates,
    best: a.best,
    streakCurrent: a.streakCurrent,
    streakBest: a.streakBest,
    streakLastDay: last as string | null,
    per_key,
    wordIds: [...new Set(words as string[])],
  };
}

/** A real date, no more than a day ahead of server UTC and `backDays` behind. */
function validDay(day: string, backDays: number): boolean {
  const t = new Date(`${day}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t - now <= DAY_MS && now - t <= (backDays + 1) * DAY_MS;
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid request body." });
  }
  if (!body || typeof body !== "object") return json(400, { error: "Invalid request body." });

  const isAdopt = body.kind === "adopt";
  let run: RunLogEntry | null = null;
  let adoption: Adoption | null = null;
  const day = body.day;
  if (isAdopt) {
    adoption = parseAdoption(body.adopt);
    if (!adoption) return json(400, { error: "adopt is invalid." });
  } else {
    if (typeof day !== "string" || !DATE_RE.test(day)) return json(400, { error: "day must be YYYY-MM-DD." });
    if (!validDay(day, MAX_BACK_DAYS)) return json(400, { error: "day is outside the allowed range." });
    run = parseRun(body.run);
    if (!run) return json(400, { error: "run is invalid." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "Invalid or expired session." });
  if (user.is_anonymous) return json(403, { error: "Guests keep their progress on their device." });

  if (adoption) {
    const { data, error } = await supabase.rpc("adopt_guest", {
      p_user: user.id,
      p_adopt: adoption.adoptId,
      p_runs: adoption.runs,
      p_gates: adoption.gates,
      p_best: adoption.best,
      p_streak_current: adoption.streakCurrent,
      p_streak_best: adoption.streakBest,
      p_streak_last_day: adoption.streakLastDay,
      p_per_key: adoption.per_key,
      p_words: adoption.wordIds,
    });
    if (error) {
      console.error("[runlog] adopt failed", error);
      return json(502, { error: "Could not save progress." });
    }
    return json(200, { applied: data === true });
  }

  const r = run!;
  const { data: ent } = await supabase
    .from("entitlements")
    .select("has_access")
    .eq("user_id", user.id)
    .maybeSingle();
  const pro = ent?.has_access === true;
  const flags = runFlags(r.mode, r.outcome);
  // A free account stores only the runs its stats count; Pro logs every mode (spec C).
  if (!pro && !flags.stats) return json(200, { applied: false });

  const { data, error } = await supabase.rpc("record_run", {
    p_user: user.id,
    p_run: r.runId ?? crypto.randomUUID(),
    p_day: day as string,
    p_mode: r.mode,
    p_score: r.score,
    p_gates: r.gates,
    p_outcome: r.outcome,
    p_tone_acc: r.tone_acc,
    p_per_key: r.per_key,
    p_words: r.wordIds,
    p_stats: flags.stats,
    p_streak: flags.streak,
    p_ring: pro ? null : FREE_RING,
  });
  if (error) {
    console.error("[runlog] record failed", error);
    return json(502, { error: "Could not record run." });
  }
  return json(200, { applied: data === true });
}
