/**
 * `currentWeekId` here and `isoWeekId` in `api/score.ts` are two
 * implementations of one rule, in two TypeScript projects that cannot import
 * each other. If they ever disagree, the client asks the board for a week the
 * server never filed the player's score under, and the score simply doesn't
 * appear — with no error anywhere to explain it.
 *
 * These cases are deliberately the same four as `api/_score.test.ts`, so a
 * change to one implementation fails the other's suite. Same trick
 * `session.test.ts` uses to pin `MicFailureReason` to `MicErrorKind`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { currentWeekId, hasJoined } from "./leaderboard.ts";
import * as supabaseModule from "./supabase.ts";

vi.mock("./supabase.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase.ts")>();
  return {
    ...actual,
    getSupabase: vi.fn(),
    currentSession: vi.fn(),
    warn: vi.fn(),
  };
});

function session() {
  return { user: { id: "u1" } } as unknown as Awaited<ReturnType<typeof supabaseModule.currentSession>>;
}

describe("currentWeekId", () => {
  it("matches api/score.ts's isoWeekId on the shared cases", () => {
    expect(currentWeekId(new Date(Date.UTC(2026, 8, 5)))).toBe("2026-W36");
    expect(currentWeekId(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-W02");
    // The ISO week-year trails the calendar year here: 1 Jan 2027 is a Friday,
    // so it belongs to the week whose Thursday fell in 2026.
    expect(currentWeekId(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    expect(currentWeekId(new Date(Date.UTC(2024, 0, 1)))).toBe("2024-W01");
  });

  it("reads the clock in UTC, not the machine's timezone", () => {
    // 16:00 UTC on Sunday is already Monday in Taipei. Both sides must still
    // call this the older week, or a UTC+8 player loses their score to a week
    // the board isn't showing.
    const sundayLateUtc = new Date(Date.UTC(2026, 8, 6, 16, 0, 0));
    const mondayEarlyUtc = new Date(Date.UTC(2026, 8, 7, 0, 0, 0));
    expect(currentWeekId(sundayLateUtc)).toBe("2026-W36");
    expect(currentWeekId(mondayEarlyUtc)).toBe("2026-W37");
  });
});

describe("hasJoined", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
  });

  function clientWithScoreRow(row: { user_id: string } | null, error: { message: string } | null = null) {
    const eq = vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
      })),
    }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn((table: string) => {
      expect(table).toBe("leaderboard_scores");
      return { select };
    });
    return { client: { from } as never, from, select };
  }

  it("regression: a profiles row with no leaderboard_scores row is NOT joined", async () => {
    // This is the exact bug: hasJoined() used to check for a `profiles` row,
    // which signup now also creates, so a brand-new account read as already
    // joined and auto-posted its first score with no opt-in.
    const { client } = clientWithScoreRow(null);
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session());

    expect(await hasJoined()).toBe(false);
  });

  it("a user with a leaderboard_scores row reads as joined", async () => {
    const { client } = clientWithScoreRow({ user_id: "u1" });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session());

    expect(await hasJoined()).toBe(true);
  });

  it("no session -> false", async () => {
    vi.mocked(supabaseModule.getSupabase).mockReturnValue({} as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(null);

    expect(await hasJoined()).toBe(false);
  });

  it("a query error -> false, never throws", async () => {
    const { client } = clientWithScoreRow(null, { message: "boom" });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session());

    await expect(hasJoined()).resolves.toBe(false);
  });

  it("queries leaderboard_scores, not profiles", async () => {
    const { client, from } = clientWithScoreRow({ user_id: "u1" });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session());

    await hasJoined();
    expect(from).toHaveBeenCalledWith("leaderboard_scores");
  });
});
