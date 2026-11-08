/**
 * The daily run cap — tier-aware, counted on the server for accounts.
 *
 * The cap is soft: `api/run.ts` counts every run and never refuses one, and
 * the client decides from the larger of two numbers, its own local count and
 * the last count the server gave it. Neither is tamper-proof (the `chk` field
 * only deters a casual devtools edit), and that is fine. The limit itself is
 * `TIER_LIMITS[getTier()].runsPerDay`.
 *
 * Per account, not per device (brief 34). Both numbers are saved under the
 * account's user id, so a second account on a used browser starts at 0, and
 * switching back and forth never resets a count. Format: one key per number,
 * each a map `{ [userId]: { date, count } }` (the local one also has `chk`).
 * Each save keeps only today's entries, so the map never grows past the
 * accounts that played today. The pre-brief-34 keys had no owner: they are
 * dropped (`accountScope.ts`), and the server count comes back on the next
 * refresh.
 *
 * The account is `currentAccountId()`: the one AuthGate noted on this page,
 * or else the one this browser held last. With no account at all (no
 * session read yet on a fresh browser) the count lives in a slot of its own
 * that no account ever reads, and no server count applies — the same safe
 * behaviour as before: local count only, a run is never blocked by an
 * unknown number.
 */
import { getSupabase } from "../data/supabase.ts";
import { getTier, tierReady } from "../data/tier.ts";
import { bumpSessionVersion } from "../data/sessionVersion.ts";
import { currentAccountId } from "../data/accountScope.ts";
import { tierLimits } from "./tiers.ts";

const KEY = "toneflap.daily.v2";
const SERVER_COUNT_KEY = "toneflap.daily.server.v2";
/** The slot used while no account is known. Never a Supabase user id. */
const NO_ACCOUNT = "-";

interface DailyState {
  date: string; // YYYY-MM-DD, local
  count: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Small non-cryptographic checksum — deters casual edits, nothing more. */
function checksum(owner: string, date: string, count: number): string {
  let h = 0;
  const s = `${owner}:${date}:${count}:ft-daily`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function fresh(): DailyState {
  return { date: today(), count: 0 };
}

function owner(): string {
  return currentAccountId() ?? NO_ACCOUNT;
}

/** The whole per-account map under `key`; `{}` on anything unreadable. */
function loadMap(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Writes `entry` for `who`, keeping only the other accounts' entries for today. */
function saveEntry(key: string, who: string, entry: Record<string, unknown>): void {
  try {
    const day = today();
    const map: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(loadMap(key))) {
      if (k !== who && (v as { date?: unknown } | null)?.date === day) map[k] = v;
    }
    map[who] = entry;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function load(who: string): DailyState {
  const parsed = loadMap(KEY)[who] as { date?: unknown; count?: unknown; chk?: unknown } | undefined;
  if (
    !parsed ||
    typeof parsed.date !== "string" ||
    typeof parsed.count !== "number" ||
    typeof parsed.chk !== "string" ||
    parsed.chk !== checksum(who, parsed.date, parsed.count) ||
    parsed.date !== today()
  ) {
    return fresh();
  }
  return { date: parsed.date, count: parsed.count };
}

function save(who: string, state: DailyState): void {
  saveEntry(KEY, who, { ...state, chk: checksum(who, state.date, state.count) });
}

/** Cached last-known server count for one account. Read back so a page
 * reload still shows a number without waiting on a network call. */
function loadServerCount(userId: string): number | null {
  const parsed = loadMap(SERVER_COUNT_KEY)[userId] as { date?: unknown; count?: unknown } | undefined;
  if (!parsed || typeof parsed.date !== "string" || typeof parsed.count !== "number") return null;
  if (parsed.date !== today()) return null;
  return parsed.count;
}

function saveServerCount(userId: string, count: number): void {
  saveEntry(SERVER_COUNT_KEY, userId, { date: today(), count });
}

export interface DailyRuns {
  count: number;
  /** `Infinity` for pro — callers must check `Number.isFinite(limit)` before
   * rendering it, rather than assume every limit prints as a number. */
  limit: number;
}

function currentLimit(): number {
  return tierLimits()[getTier()].runsPerDay;
}

export function loadDailyRuns(): DailyRuns {
  const who = owner();
  const local = load(who).count;
  // A server count is saved only under a real user id, so it can only ever
  // be this account's own.
  const server = who !== NO_ACCOUNT ? loadServerCount(who) : null;
  // The larger of the two: an offline session that only updated local
  // should not show a number that goes backwards once the server is known.
  const count = server != null ? Math.max(local, server) : local;
  return { count, limit: currentLimit() };
}

/**
 * Call once per run start (behind the same mic gesture every run start
 * already requires).
 *
 * Increments this account's local count. Once the tier is known it also
 * POSTs to `api/run.ts` and caches the returned count — but local is
 * incremented either way, so an offline session still shows an honest number, and a failed request never
 * blocks the run that's already starting. This is a deliberate bypass: a
 * network blip must not make the game unplayable (CLAUDE.md's "never scores
 * the player wrong" spirit applies here too).
 */
export function incrementDailyRuns(): DailyRuns {
  const who = owner();
  const state = load(who);
  const next = { date: state.date, count: state.count + 1 };
  save(who, next);
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
    const userId = data.session?.user.id;
    if (!token || !userId) return;
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ day: today() }),
    });
    if (!res.ok) return;
    const payload = (await res.json()) as { count: number };
    // Saved under the account the server counted, never under another one.
    if (typeof payload.count === "number") saveServerCount(userId, payload.count);
  } catch {
    // Never blocks a run — see this function's doc comment above. The local
    // count above has already been saved, so the player still sees a
    // number; the server just doesn't hear about this run until it can.
  }
}

/** Refreshes the cached server count for a signed-in player, e.g. on app
 * load. Never throws, never blocks — same contract as `src/data/`. */
export async function refreshServerDailyRuns(): Promise<void> {
  try {
    // Called on app load, often before the tier is known: `getTier()` still
    // answers its "guest" default then, which skipped this read and left a
    // new device at 0 runs today. Wait for the real tier first.
    await tierReady();
    if (getTier() === "guest") return;
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
    if (error) return;
    // No row: this account has not played today. Save 0 for it (brief 34) —
    // returning early here once kept another account's number on screen.
    const count = row?.count ?? 0;
    if (loadServerCount(userId) === count) return;
    saveServerCount(userId, count);
    // Profile reads the count once per session version: tell it to re-read.
    bumpSessionVersion();
  } catch {
    // ignore — see module doc comment
  }
}
