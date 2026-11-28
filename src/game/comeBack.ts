/**
 * The come-back loop (brief 55): the daily goal and the weekly headline.
 * Pure maths plus a small per-account render cache. No React, no Supabase.
 *
 * The server owns the numbers (migration 0037): `counted_runs` holds an
 * account's counted runs per local day (written by `api/runlog.ts`), and
 * `weekly_tone_accuracy` its heard gates + summed tone accuracy per local week
 * (Monday) per single tone. `src/data/stats.ts` reads both into this cache
 * (`cacheComeBackFromServer`); `recordCountedRun` is the optimistic local
 * write until the next refresh, the same pattern as `runHistory.ts`.
 *
 * Daily goal: `DAILY_GOAL_RUNS` counted runs in a local day earns
 * `DAILY_GOAL_XP` once that day. XP stays derived (`xp.ts`): the bonus is
 * `DAILY_GOAL_XP` × the number of days with ≥ 3 counted runs, and those days
 * come from the server's `counted_runs`, so nothing client-decided is stored.
 */

import { accountStorage } from "../lib/accountStorage.ts";
import type { Tone } from "./gates.ts";
import type { RunStats } from "./scoring.ts";

const KEY = "toneflap.comeback.v1";

/** Counted runs in one local day that complete the daily goal. */
export const DAILY_GOAL_RUNS = 3;
/**
 * The daily goal's bonus. The brief asked for "about ⅓ of a level at levels
 * 1–3": those levels span 250, 508 and 691 XP (`levelThreshold`), so ⅓ is
 * 83–230; 150 sits in the middle and is about one ordinary run's XP.
 */
export const DAILY_GOAL_XP = 150;
/** Runs needed in each of the two weeks before a weekly change is shown. */
export const WEEKLY_MIN_RUNS = 3;
/** Heard gates a tone needs in each week to be compared at all. */
export const WEEKLY_MIN_GATES = 3;
/** A rise below this (in percentage points) reads as "steady". */
export const WEEKLY_MIN_RISE = 1;

const TONES: Tone[] = [1, 2, 3, 4];

/** Player-facing tone names (BRAND.md copy rule): never "Tone 3" or "T3". */
export const TONE_NAME: Record<Tone, string> = {
  1: "first tone",
  2: "second tone",
  3: "third tone",
  4: "fourth tone",
};

/** A key's player-facing name: "2" → "second tone", "3-2" → "third + second tone". */
export function keyName(key: string): string {
  const parts = key.split("-").map(Number) as Tone[];
  if (parts.length === 1) return TONE_NAME[parts[0]] ?? key;
  return `${parts.map((t) => TONE_NAME[t]?.replace(" tone", "") ?? String(t)).join(" + ")} tone`;
}

export interface WeekToneStat {
  attempts: number;
  accSum: number;
}

export interface ComeBackStore {
  /** Counted runs per local day, YYYY-MM-DD. */
  days: Record<string, number>;
  /** Per local week (its Monday, YYYY-MM-DD), per single tone. */
  weeks: Record<string, Partial<Record<Tone, WeekToneStat>>>;
}

// ---------------------------------------------------------------- dates

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today as the player's local YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return fmtDay(now);
}

/** The Monday of `day`'s local week (Postgres `date_trunc('week')` agrees). */
export function weekStart(day: string): string {
  const d = parseDay(day);
  const dow = (d.getDay() + 6) % 7; // Mon 0 … Sun 6
  d.setDate(d.getDate() - dow);
  return fmtDay(d);
}

/** A week's Monday shifted by whole weeks (negative = earlier). Local calendar maths, DST-safe. */
export function addWeeks(week: string, n: number): string {
  const d = parseDay(week);
  d.setDate(d.getDate() + 7 * n);
  return fmtDay(d);
}

/** The Sunday that ends the week starting `week`. */
export function weekEnd(week: string): string {
  const d = parseDay(week);
  d.setDate(d.getDate() + 6);
  return fmtDay(d);
}

/** "Nov 24 – 30" style label for a week picker. */
export function weekLabel(week: string, thisWeek: string): string {
  if (week === thisWeek) return "This week";
  if (week === addWeeks(thisWeek, -1)) return "Last week";
  const a = parseDay(week);
  const b = parseDay(weekEnd(week));
  const fa = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fb =
    a.getMonth() === b.getMonth()
      ? String(b.getDate())
      : b.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fa} – ${fb}`;
}

// ---------------------------------------------------------------- store

function emptyStore(): ComeBackStore {
  return { days: {}, weeks: {} };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Keeps only well-formed entries: a damaged store must not make XP NaN. */
function clean(raw: unknown): ComeBackStore {
  const out = emptyStore();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { days?: unknown; weeks?: unknown };
  if (r.days && typeof r.days === "object") {
    for (const [d, c] of Object.entries(r.days as Record<string, unknown>)) {
      if (DAY_RE.test(d) && num(c) > 0) out.days[d] = Math.floor(num(c));
    }
  }
  if (r.weeks && typeof r.weeks === "object") {
    for (const [w, tones] of Object.entries(r.weeks as Record<string, unknown>)) {
      if (!DAY_RE.test(w) || !tones || typeof tones !== "object") continue;
      const wk: Partial<Record<Tone, WeekToneStat>> = {};
      for (const t of TONES) {
        const s = (tones as Record<string, unknown>)[t];
        if (!s || typeof s !== "object") continue;
        const attempts = num((s as WeekToneStat).attempts);
        if (attempts <= 0) continue;
        wk[t] = { attempts, accSum: Math.min(num((s as WeekToneStat).accSum), attempts) };
      }
      out.weeks[w] = wk;
    }
  }
  return out;
}

export function loadComeBack(): ComeBackStore {
  try {
    const raw = accountStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function save(store: ComeBackStore): void {
  try {
    accountStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Blocked/full storage: the cache just doesn't persist.
  }
}

export interface ServerDayRow {
  day: string;
  count: number;
}
export interface ServerWeekRow {
  week: string;
  tone: string;
  attempts: number;
  sum_accuracy: number;
}

/** Builds the store from the server's rows (pure; `cacheComeBackFromServer` saves it). */
export function storeFromServer(days: ServerDayRow[], weeks: ServerWeekRow[]): ComeBackStore {
  const raw: ComeBackStore = { days: {}, weeks: {} };
  for (const d of days) raw.days[d.day] = Number(d.count);
  for (const w of weeks) {
    const tone = Number(w.tone) as Tone;
    if (!TONES.includes(tone)) continue;
    (raw.weeks[w.week] ??= {})[tone] = { attempts: Number(w.attempts), accSum: Number(w.sum_accuracy) };
  }
  return clean(raw);
}

/** Replaces the cache with the server's numbers. Null weeks = that read failed: keep the cached weeks. */
export function cacheComeBackFromServer(days: ServerDayRow[], weeks: ServerWeekRow[] | null): void {
  const next = storeFromServer(days, weeks ?? []);
  if (weeks === null) next.weeks = loadComeBack().weeks;
  save(next);
}

/** Adds one counted run to a store (pure). */
export function addRun(
  store: ComeBackStore,
  perTone: RunStats["perTone"] | Record<Tone, { gates: number; accSum: number }>,
  day: string,
): ComeBackStore {
  const days = { ...store.days, [day]: (store.days[day] ?? 0) + 1 };
  const wk = weekStart(day);
  const week: Partial<Record<Tone, WeekToneStat>> = { ...(store.weeks[wk] ?? {}) };
  for (const t of TONES) {
    const s = perTone[t];
    if (!s || !(s.gates > 0)) continue;
    const prev = week[t] ?? { attempts: 0, accSum: 0 };
    week[t] = { attempts: prev.attempts + s.gates, accSum: prev.accSum + Math.min(s.accSum, s.gates) };
  }
  return { days, weeks: { ...store.weeks, [wk]: week } };
}

export interface CountedRunResult {
  runsToday: number;
  /** True on exactly the run that reached `DAILY_GOAL_RUNS` today. */
  goalJustCompleted: boolean;
}

/** The optimistic local write for one counted run (game/drill/pairs, not restart). */
export function recordCountedRun(stats: Pick<RunStats, "perTone">, day: string = todayLocal()): CountedRunResult {
  const next = addRun(loadComeBack(), stats.perTone, day);
  save(next);
  const runsToday = next.days[day];
  return { runsToday, goalJustCompleted: runsToday === DAILY_GOAL_RUNS };
}

export function clearComeBack(): void {
  try {
    accountStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- daily goal

export function runsOnDay(store: ComeBackStore, day: string): number {
  return store.days[day] ?? 0;
}

/** Days that reached the daily goal: each earns `DAILY_GOAL_XP` once. */
export function goalDays(store: ComeBackStore): number {
  return Object.values(store.days).filter((c) => c >= DAILY_GOAL_RUNS).length;
}

export function dailyGoalXp(store: ComeBackStore): number {
  return goalDays(store) * DAILY_GOAL_XP;
}

// ---------------------------------------------------------------- weekly headline

export function runsInWeek(store: ComeBackStore, week: string): number {
  const end = weekEnd(week);
  let n = 0;
  for (const [d, c] of Object.entries(store.days)) if (d >= week && d <= end) n += c;
  return n;
}

function weekAcc(store: ComeBackStore, week: string, tone: Tone): number | null {
  const s = store.weeks[week]?.[tone];
  return s && s.attempts >= WEEKLY_MIN_GATES ? s.accSum / s.attempts : null;
}

export type WeeklyHeadline =
  | { kind: "improved"; tone: Tone; delta: number; text: string }
  | { kind: "steady"; tone: Tone; delta: 0; text: string }
  | { kind: "threshold"; runsLeft: number; text: string };

/**
 * This local week vs last, per tone (average tone accuracy). The most
 * improved tone wins; no rise → a neutral "steady" line, never a negative
 * one. Before both weeks have `WEEKLY_MIN_RUNS` runs: how many runs are left.
 * Null when there is nothing honest to say (no tone heard this week).
 */
export function weeklyHeadline(store: ComeBackStore, today: string = todayLocal()): WeeklyHeadline | null {
  const thisWeek = weekStart(today);
  const lastWeek = addWeeks(thisWeek, -1);
  const runsThis = runsInWeek(store, thisWeek);
  const runsLast = runsInWeek(store, lastWeek);
  const left = Math.max(0, WEEKLY_MIN_RUNS - runsThis);
  if (runsLast < WEEKLY_MIN_RUNS) {
    // Last week is closed: the first change can only show next week.
    const text =
      left > 0
        ? `Play ${left} more ${left === 1 ? "run" : "runs"} this week to see your first weekly change`
        : "Your first weekly change shows next Monday";
    return { kind: "threshold", runsLeft: left, text };
  }
  if (left > 0) {
    return {
      kind: "threshold",
      runsLeft: left,
      text: `Play ${left} more ${left === 1 ? "run" : "runs"} to see your weekly change`,
    };
  }
  let best: { tone: Tone; delta: number } | null = null;
  for (const t of TONES) {
    const now = weekAcc(store, thisWeek, t);
    const then = weekAcc(store, lastWeek, t);
    if (now === null || then === null) continue;
    const delta = Math.round((now - then) * 100);
    if (!best || delta > best.delta) best = { tone: t, delta };
  }
  if (best && best.delta >= WEEKLY_MIN_RISE) {
    return { kind: "improved", tone: best.tone, delta: best.delta, text: `${TONE_NAME[best.tone]} ↑ ${best.delta} pts this week` };
  }
  // Neutral: the tone played most this week (or the compared one).
  let steady: Tone | null = best?.tone ?? null;
  if (steady === null) {
    let most = 0;
    for (const t of TONES) {
      const a = store.weeks[thisWeek]?.[t]?.attempts ?? 0;
      if (a > most) {
        most = a;
        steady = t;
      }
    }
  }
  if (steady === null) return null;
  return { kind: "steady", tone: steady, delta: 0, text: `${TONE_NAME[steady]} steady this week` };
}

/** "third tone ↑ 9 pts" → "Third tone ↑ 9 pts": for a line that starts with it. */
export function capFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
