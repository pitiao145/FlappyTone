import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRun,
  addWeeks,
  DAILY_GOAL_XP,
  dailyGoalXp,
  goalDays,
  keyName,
  loadComeBack,
  recordCountedRun,
  runsInWeek,
  storeFromServer,
  weekEnd,
  weeklyHeadline,
  weekStart,
  type ComeBackStore,
} from "./comeBack.ts";
import { levelThreshold, playerXpFrom, totalXp } from "./xp.ts";
import { loadRunHistory } from "./runHistory.ts";
import type { Tone } from "./gates.ts";

beforeEach(() => {
  const m: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m[k] ?? null,
    setItem: (k: string, v: string) => {
      m[k] = v;
    },
    removeItem: (k: string) => {
      delete m[k];
    },
  } as Storage);
});

const tones = (acc: Partial<Record<Tone, number>>, gates = 4) => {
  const out = {} as Record<Tone, { gates: number; accSum: number }>;
  for (const t of [1, 2, 3, 4] as Tone[]) {
    out[t] = acc[t] === undefined ? { gates: 0, accSum: 0 } : { gates, accSum: gates * acc[t]! };
  }
  return out;
};

/** n runs on `day` with the given per-tone accuracy. */
function play(store: ComeBackStore, day: string, n: number, acc: Partial<Record<Tone, number>>): ComeBackStore {
  for (let i = 0; i < n; i++) store = addRun(store, tones(acc), day);
  return store;
}

const empty = (): ComeBackStore => ({ days: {}, weeks: {} });

describe("local weeks (brief 55)", () => {
  it("a week starts on Monday, local time", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // Thu
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // Mon
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sun ends the week
    expect(weekStart("2026-11-30")).toBe("2026-11-30"); // next Mon
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // across a year
    expect(weekEnd("2026-11-23")).toBe("2026-11-29");
  });

  it("week shifts stay on Mondays across DST changes", () => {
    expect(addWeeks("2026-10-19", 2)).toBe("2026-11-02"); // EU DST end in between
    expect(addWeeks("2026-03-23", 1)).toBe("2026-03-30");
    expect(addWeeks("2026-11-23", -1)).toBe("2026-11-16");
  });

  it("runs count into the week of their local day", () => {
    let s = play(empty(), "2026-11-22", 2, { 1: 1 }); // Sun: last week
    s = play(s, "2026-11-23", 1, { 1: 1 }); // Mon: this week
    expect(runsInWeek(s, "2026-11-16")).toBe(2);
    expect(runsInWeek(s, "2026-11-23")).toBe(1);
  });
});

describe("weekly headline (brief 55)", () => {
  const today = "2026-11-26";

  it("picks the most improved tone, in points", () => {
    let s = play(empty(), "2026-11-17", 3, { 1: 0.8, 3: 0.5, 4: 0.6 });
    s = play(s, "2026-11-25", 3, { 1: 0.82, 3: 0.59, 4: 0.6 });
    expect(weeklyHeadline(s, today)).toEqual({
      kind: "improved",
      tone: 3,
      delta: 9,
      text: "third tone ↑ 9 pts this week",
    });
  });

  it("no rise reads as steady, never negative", () => {
    let s = play(empty(), "2026-11-17", 3, { 4: 0.8 });
    s = play(s, "2026-11-25", 3, { 4: 0.6 });
    expect(weeklyHeadline(s, today)).toMatchObject({ kind: "steady", tone: 4, delta: 0, text: "fourth tone steady this week" });
  });

  it("needs 3 runs in both weeks; counts the runs actually left", () => {
    let s = play(empty(), "2026-11-17", 3, { 2: 0.5 });
    s = play(s, "2026-11-25", 1, { 2: 0.9 });
    expect(weeklyHeadline(s, today)).toMatchObject({ kind: "threshold", runsLeft: 2, text: "Play 2 more runs to see your weekly change" });
    s = play(s, "2026-11-25", 1, { 2: 0.9 });
    expect(weeklyHeadline(s, today)).toMatchObject({ runsLeft: 1, text: "Play 1 more run to see your weekly change" });
    s = play(s, "2026-11-26", 1, { 2: 0.9 });
    expect(weeklyHeadline(s, today)?.kind).toBe("improved");
  });

  it("a short last week: the first change shows next week", () => {
    let s = play(empty(), "2026-11-17", 2, { 2: 0.5 });
    expect(weeklyHeadline(s, today)).toMatchObject({ kind: "threshold", runsLeft: 3, text: "Play 3 more runs this week to see your first weekly change" });
    s = play(s, "2026-11-25", 3, { 2: 0.9 });
    expect(weeklyHeadline(s, today)).toMatchObject({ kind: "threshold", runsLeft: 0, text: "Your first weekly change shows next Monday" });
  });

  it("a tone heard in only one week is not compared", () => {
    let s = play(empty(), "2026-11-17", 3, { 1: 0.5 });
    s = play(s, "2026-11-25", 3, { 2: 0.9 });
    expect(weeklyHeadline(s, today)).toMatchObject({ kind: "steady", tone: 2 });
  });

  it("builds the same store from the server's rows", () => {
    const s = storeFromServer(
      [{ day: "2026-11-25", count: 3 }],
      [{ week: "2026-11-23", tone: "3", attempts: 10, sum_accuracy: 6 }, { week: "2026-11-23", tone: "3-2", attempts: 1, sum_accuracy: 1 }],
    );
    expect(s.days).toEqual({ "2026-11-25": 3 });
    expect(s.weeks["2026-11-23"]).toEqual({ 3: { attempts: 10, accSum: 6 } });
  });
});

describe("daily goal XP (brief 55)", () => {
  it("the 3rd counted run of a day completes it exactly once", () => {
    const day = "2026-11-26";
    const r = [1, 2, 3, 4].map(() => recordCountedRun({ perTone: tones({ 1: 1 }) as never }, day));
    expect(r.map((x) => x.goalJustCompleted)).toEqual([false, false, true, false]);
    expect(r[3].runsToday).toBe(4);
    expect(goalDays(loadComeBack())).toBe(1);
    expect(dailyGoalXp(loadComeBack())).toBe(DAILY_GOAL_XP);
  });

  it("each goal day adds DAILY_GOAL_XP to the player's XP", () => {
    for (const day of ["2026-11-24", "2026-11-25"]) {
      for (let i = 0; i < 3; i++) recordCountedRun({ perTone: tones({}) as never }, day);
    }
    recordCountedRun({ perTone: tones({}) as never }, "2026-11-26");
    const h = loadRunHistory();
    expect(playerXpFrom(h) - totalXp(h)).toBe(2 * DAILY_GOAL_XP);
  });

  it("the bonus is about a third of a level at levels 1–3", () => {
    const spans = [2, 3, 4].map((l) => levelThreshold(l) - levelThreshold(l - 1));
    const third = spans.reduce((a, b) => a + b, 0) / spans.length / 3;
    expect(DAILY_GOAL_XP).toBeGreaterThan(third * 0.8);
    expect(DAILY_GOAL_XP).toBeLessThan(third * 1.2);
  });
});

describe("tone names (brief 55 copy rule)", () => {
  it("ordinal names, never a bare number", () => {
    expect(keyName("1")).toBe("first tone");
    expect(keyName("3-2")).toBe("third + second tone");
  });
});
