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
import { describe, expect, it } from "vitest";

import { currentWeekId } from "./leaderboard.ts";

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
