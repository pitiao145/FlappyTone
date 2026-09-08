/**
 * The daily run cap — tier-aware, server-authoritative for accounts.
 *
 * The local day counter is unchanged from v1: still device-local, still not
 * tamper-proof (CLAUDE.md's hard rule — clearing storage or editing devtools
 * defeats it, and that's fine for a guest since a cleared guest mints a new
 * anonymous identity anyway). What changed is where the *limit* comes from
 * (`TIER_LIMITS[getTier()].runsPerDay`, not a flat constant) and that a
 * signed-in player's count is also recorded server-side (`api/run.ts`),
 * which a guest cannot be — no durable identity to count against.
 *
 * The local counter is deliberately never reset on a tier change: a guest at
 * 3/3 who signs up becomes 3/10, not a fresh 0/10. Product logic, not a bug.
 */
import { getSupabase } from "../data/supabase.ts";
import { getTier } from "../data/tier.ts";
import { TIER_LIMITS } from "./tiers.ts";

const KEY = "toneflap.daily.v1";
const SERVER_COUNT_KEY = "toneflap.daily.server.v1";

interface DailyState {
  date: string; // YYYY-MM-DD, local
  count: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Small non-cryptographic checksum — deters casual edits, nothing more. */
function checksum(date: string, count: number): string {
  let h = 0;
  const s = `${date}:${count}:ft-daily`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function fresh(): DailyState {
  return { date: today(), count: 0 };
}

function load(): DailyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as { date?: unknown; count?: unknown; chk?: unknown };
    if (
      typeof parsed.date !== "string" ||
      typeof parsed.count !== "number" ||
      typeof parsed.chk !== "string" ||
      parsed.chk !== checksum(parsed.date, parsed.count)
    ) {
      return fresh();
    }
    if (parsed.date !== today()) return fresh();
    return { date: parsed.date, count: parsed.count };
  } catch {
    return fresh();
  }
}

function save(state: DailyState): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, chk: checksum(state.date, state.count) }),
    );
  } catch {
    // ignore
  }
}

/** Cached last-known server count, for a signed-in player only. Read back
 * so a page reload still shows a number without waiting on a network call. */
function loadServerCount(): number | null {
  try {
    const raw = localStorage.getItem(SERVER_COUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: unknown; count?: unknown };
    if (typeof parsed.date !== "string" || typeof parsed.count !== "number") return null;
    if (parsed.date !== today()) return null;
    return parsed.count;
  } catch {
    return null;
  }
}

function saveServerCount(count: number): void {
  try {
    localStorage.setItem(SERVER_COUNT_KEY, JSON.stringify({ date: today(), count }));
  } catch {
    // ignore
  }
}

export interface DailyRuns {
  count: number;
  /** `Infinity` for pro — callers must check `Number.isFinite(limit)` before
   * rendering it, rather than assume every limit prints as a number. */
  limit: number;
}

function currentLimit(): number {
  return TIER_LIMITS[getTier()].runsPerDay;
}

export function loadDailyRuns(): DailyRuns {
  const local = load().count;
  const server = getTier() !== "guest" ? loadServerCount() : null;
  // The larger of the two: an offline session that only updated local
  // should not show a number that goes backwards once the server is known.
  const count = server != null ? Math.max(local, server) : local;
  return { count, limit: currentLimit() };
}

/**
 * Call once per run start (behind the same mic gesture every run start
 * already requires).
 *
 * Guest: local only, same as before. Signed-in: also POSTs to `api/run.ts`
 * and caches the returned count — but local is incremented either way, so an
 * offline session still shows an honest number, and a failed request never
 * blocks the run that's already starting. This is a deliberate bypass: a
 * network blip must not make the game unplayable (CLAUDE.md's "never scores
 * the player wrong" spirit applies here too).
 */
export function incrementDailyRuns(): DailyRuns {
  const state = load();
  const next = { date: state.date, count: state.count + 1 };
  save(next);
  const limit = currentLimit();

  if (getTier() !== "guest") {
    void recordServerRun();
  }

  return { count: next.count, limit };
}

async function recordServerRun(): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ day: today() }),
    });
    if (!res.ok) return;
    const payload = (await res.json()) as { count: number };
    if (typeof payload.count === "number") saveServerCount(payload.count);
  } catch {
    // Never blocks a run — see this function's doc comment above. The local
    // count above has already been saved, so the player still sees a
    // number; the server just doesn't hear about this run until it can.
  }
}

/** Refreshes the cached server count for a signed-in player, e.g. on app
 * load. Never throws, never blocks — same contract as `src/data/`. */
export async function refreshServerDailyRuns(): Promise<void> {
  if (getTier() === "guest") return;
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const { data: row, error } = await supabase
      .from("daily_runs")
      .select("count")
      .eq("user_id", userId)
      .eq("day", today())
      .maybeSingle();
    if (error || !row) return;
    saveServerCount(row.count);
  } catch {
    // ignore — see module doc comment
  }
}
