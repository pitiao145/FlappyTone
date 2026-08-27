/**
 * The free tier's "N of 5 runs today" counter — localStorage only.
 *
 * This is explicitly NOT tamper-proof: there are no accounts (CLAUDE.md's
 * hard rule), so anyone can reset it by clearing site data or editing
 * localStorage in devtools. The `chk` field only deters a casual "edit the
 * number in devtools and reload" — it is a soft nudge for the free tier,
 * not enforcement. Don't build product logic that assumes this can't be
 * bypassed.
 */

const KEY = "toneflap.daily.v1";
export const DAILY_RUN_LIMIT = 5;

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

export interface DailyRuns {
  count: number;
  limit: number;
}

export function loadDailyRuns(): DailyRuns {
  return { count: load().count, limit: DAILY_RUN_LIMIT };
}

/** Call once per run start (behind the same mic gesture every run start already requires). */
export function incrementDailyRuns(): DailyRuns {
  const state = load();
  const next = { date: state.date, count: state.count + 1 };
  save(next);
  return { count: next.count, limit: DAILY_RUN_LIMIT };
}
