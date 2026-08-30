/**
 * The free tier's daily play streak — localStorage only.
 *
 * A streak day is any local calendar day in which the player completes at
 * least one real run (game over: finished or out of hearts). Play on
 * consecutive days and `current` climbs; miss a whole day and it falls back
 * to 0. `best` is the longest run ever reached on this device.
 *
 * Like `dailyLimit.ts`, this is explicitly NOT tamper-proof: there are no
 * accounts (CLAUDE.md's hard rule), so anyone can reset it by clearing site
 * data or editing localStorage in devtools. The `chk` field only deters a
 * casual "edit the number in devtools and reload" — a soft nudge, not
 * enforcement. Don't build product logic that assumes this can't be bypassed.
 *
 * PRO SEAM — cross-device streaks are a paid feature. There are no accounts
 * yet, so this module is device-local only. When accounts land, the shape to
 * add (without changing callers) is a small injectable adapter, e.g.:
 *
 *   interface StreakSyncAdapter {
 *     fetch(): Promise<StreakState | null>;   // server's view
 *     push(state: StreakState): Promise<void>;
 *   }
 *
 * `recordPlay` would then push after saving locally, and a signed-in load
 * would merge server + local by `max(current)` / `max(best)` with the
 * server's `lastPlayedDate` authoritative on conflict (its clock is
 * trustworthy; the device's is not). Keep the local path working offline as
 * the fallback — do not make the free/local streak depend on the network.
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

/** Parity with clearRunHistory/clearSettings, for a future "forget my data" flow. */
export function clearStreak(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
