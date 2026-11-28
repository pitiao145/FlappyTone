import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const track = vi.fn();
vi.mock("../analytics/client.ts", () => ({ track: (e: unknown) => track(e) }));

import { StreakCard, streakCardText } from "./StreakCard.tsx";
import { cacheStreakFromServer } from "../game/streak.ts";

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

describe("Play home streak card (brief 55)", () => {
  it("played today", () => {
    cacheStreakFromServer({ current: 4, best: 4, lastDay: day(0) });
    expect(renderToStaticMarkup(<StreakCard />)).toContain("🔥 4-day streak · done for today");
  });
  it("played yesterday only", () => {
    cacheStreakFromServer({ current: 3, best: 3, lastDay: day(-1) });
    expect(renderToStaticMarkup(<StreakCard />)).toContain("🔥 3 days · 1 run keeps it");
  });
  it("a gap of 2+ days", () => {
    cacheStreakFromServer({ current: 5, best: 5, lastDay: day(-2) });
    expect(renderToStaticMarkup(<StreakCard />)).toContain("Start a streak today");
  });
  it("new account", () => {
    expect(renderToStaticMarkup(<StreakCard />)).toContain("Start a streak today");
    expect(streakCardText({ state: "at_risk", current: 1 })).toBe("🔥 1 day · 1 run keeps it");
  });
});
