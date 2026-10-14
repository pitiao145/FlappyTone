/**
 * The daily play streak.
 *
 * A streak day is any local calendar day in which the player completes at
 * least one real run (game over: finished or out of hearts). Play on
 * consecutive days and `current` climbs; miss a whole day and it falls back
 * to 0.
 *
 * For a guest this localStorage store is the streak, and it is NOT
 * tamper-proof (the `chk` field only deters a casual devtools edit). For an
 * account the server owns it (brief 05: `record_run()` advances
 * `profiles.streak_current/streak_last_day`), and this store is only a cache
 * of that (`cacheStreakFromServer`) — `recordPlay` is the optimistic local
 * write until the next refresh. The state (done today / at risk / broken) is
 * always read against the local calendar day.
 */

const KEY = "toneflap.streak.v1";

export interface StreakState {
  lastPlayedDate: string; // YYYY-MM-DD, local; "" means never played
  current: number;
  best: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole local-calendar-days between two YYYY-MM-DD strings (b - a). Rounds so DST's
 *  23/25-hour days don't skew the difference. Returns +Infinity if `a` is empty. */
function dayDiff(a: string, b: string): number {
  if (!a) return Infinity;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = new Date(ay, am - 1, ad).getTime();
  const tb = new Date(by, bm - 1, bd).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

/** Small non-cryptographic checksum — deters casual edits, nothing more. */
function checksum(state: StreakState): string {
  let h = 0;
  const s = `${state.lastPlayedDate}:${state.current}:${state.best}:ft-streak`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function fresh(): StreakState {
  return { lastPlayedDate: "", current: 0, best: 0 };
}

function load(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as {
      lastPlayedDate?: unknown;
      current?: unknown;
      best?: unknown;
      chk?: unknown;
    };
    if (
      typeof parsed.lastPlayedDate !== "string" ||
      typeof parsed.current !== "number" ||
      typeof parsed.best !== "number" ||
      typeof parsed.chk !== "string"
    ) {
      return fresh();
    }
    const state: StreakState = {
      lastPlayedDate: parsed.lastPlayedDate,
      current: parsed.current,
      best: parsed.best,
    };
    if (parsed.chk !== checksum(state)) return fresh();
    return state;
  } catch {
    return fresh();
  }
}

function save(state: StreakState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, chk: checksum(state) }));
  } catch {
    // Blocked/full storage — the streak just doesn't persist this session.
  }
}

export interface Streak {
  current: number;
  best: number;
}

/**
 * Effective streak for display. `current` is 0 when a full calendar day has
 * been missed since the last play (the streak is broken but not yet rewritten
 * — the next `recordPlay` resets it to 1). `best` always reflects the stored
 * record.
 */
export function loadStreak(): Streak {
  const state = load();
  const gap = dayDiff(state.lastPlayedDate, today());
  return { current: gap <= 1 ? state.current : 0, best: state.best };
}

export type StreakPhase = "done_today" | "at_risk" | "broken" | "none";

export interface StreakStatus extends Streak {
  state: StreakPhase;
}

/**
 * The streak as a state, by local calendar day, so the number never looks
 * stuck: "done_today" (played today), "at_risk" (played yesterday — play
 * today to keep it), "broken" (a whole day missed), "none" (never played on
 * this device). `current` is 0 for broken/none. For an account the play date
 * is the server's `streak_last_day`, so every device shows the same state.
 */
export function streakStatus(): StreakStatus {
  const state = load();
  if (!state.lastPlayedDate) return { state: "none", current: 0, best: state.best };
  const gap = dayDiff(state.lastPlayedDate, today());
  if (gap <= 0) return { state: "done_today", current: state.current, best: state.best };
  if (gap === 1) return { state: "at_risk", current: state.current, best: state.best };
  return { state: "broken", current: 0, best: state.best };
}

/** Call once when a qualifying run completes (finished / out_of_hearts). */
export function recordPlay(): Streak {
  const state = load();
  const gap = dayDiff(state.lastPlayedDate, today());
  let current: number;
  if (gap === 0) {
    current = state.current; // already counted today
  } else if (gap === 1) {
    current = state.current + 1; // consecutive day
  } else {
    current = 1; // first play, or a day was missed
  }
  const next: StreakState = {
    lastPlayedDate: today(),
    current,
    best: Math.max(state.best, current),
  };
  save(next);
  return { current: next.current, best: next.best };
}

/** The raw stored state — the guest streak that an account adopts. */
export function loadStreakState(): StreakState {
  return load();
}

/** Replaces the local streak with the account's server streak (brief 05). */
export function cacheStreakFromServer(server: { current: number; best: number; lastDay: string | null }): void {
  save({ lastPlayedDate: server.lastDay ?? "", current: server.current, best: server.best });
}

/** Parity with clearRunHistory/clearSettings, for a future "forget my data" flow. */
export function clearStreak(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
