/**
 * The daily run cap — tier-aware, counted on the server for accounts.
 *
 * The cap is soft: `api/run.ts` counts every run and never refuses one, and
 * the client decides from the larger of two numbers, its own local count and
 * the last count the server gave it. Neither is tamper-proof (the `chk` field
 * only deters a casual devtools edit), and that is fine. The limit itself is
 * `TIER_LIMITS[getTier()].runsPerDay`.
 *
 * Per account, like everything the game saves (brief 34): both numbers go
 * through `accountStorage`, so a second account on a used browser starts at
 * 0, and switching back and forth never resets a count. The pre-brief-34
 * keys had no owner and are dropped (`accountScope.ts`); the server count
 * comes back on the next refresh.
 */
import { getSupabase } from "../data/supabase.ts";
import { getTier, tierReady } from "../data/tier.ts";
import { bumpSessionVersion } from "../data/sessionVersion.ts";
import { accountKey, accountStorage, currentAccountId } from "../lib/accountStorage.ts";
import { tierLimits } from "./tiers.ts";

const KEY = "toneflap.daily.v2";
const SERVER_COUNT_KEY = "toneflap.daily.server.v2";

interface DailyState {
  date: string; // YYYY-MM-DD, local
  count: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Small non-cryptographic checksum — deters casual edits (and copying one
 * account's entry to another), nothing more. */
function checksum(date: string, count: number): string {
  let h = 0;
  const s = `${currentAccountId() ?? ""}:${date}:${count}:ft-daily`;
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
    const raw = accountStorage.getItem(KEY);
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
    accountStorage.setItem(KEY, JSON.stringify({ ...state, chk: checksum(state.date, state.count) }));
  } catch {
    // ignore
  }
}

/** Cached last-known server count for the current account. Read back so a
 * page reload still shows a number without waiting on a network call. */
function loadServerCount(): number | null {
  try {
    const raw = accountStorage.getItem(SERVER_COUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: unknown; count?: unknown };
    if (typeof parsed.date !== "string" || typeof parsed.count !== "number") return null;
    if (parsed.date !== today()) return null;
    return parsed.count;
  } catch {
    return null;
  }
}

/** Saves a server count under the account the server counted (`userId`). */
function saveServerCount(userId: string, count: number): void {
  try {
    localStorage.setItem(accountKey(SERVER_COUNT_KEY, userId), JSON.stringify({ date: today(), count }));
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
  return tierLimits()[getTier()].runsPerDay;
}

export function loadDailyRuns(): DailyRuns {
  const local = load().count;
  const server = loadServerCount();
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
    if (currentAccountId() === userId && loadServerCount() === count) return;
    saveServerCount(userId, count);
    // Profile reads the count once per session version: tell it to re-read.
    bumpSessionVersion();
  } catch {
    // ignore — see module doc comment
  }
}
