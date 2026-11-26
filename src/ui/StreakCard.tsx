import { useEffect, useMemo } from "react";
import { track } from "../analytics/client.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { streakStatus, type StreakStatus } from "../game/streak.ts";

/** The card's one line for a streak state (brief 55). */
export function streakCardText(s: Pick<StreakStatus, "state" | "current">): string {
  if (s.state === "done_today") return `🔥 ${s.current}-day streak · done for today`;
  if (s.state === "at_risk") return `🔥 ${s.current} ${s.current === 1 ? "day" : "days"} · 1 run keeps it`;
  return "Start a streak today";
}

/**
 * Play home's streak card (brief 55): one small line between the prompts and
 * the menu. Reads `streakStatus()` (the server's `streak_last_day`, cached),
 * re-read when the account's stats land. Never a button: Play stays the one
 * action here.
 */
export function StreakCard() {
  const version = useSessionVersion();
  const status = useMemo(() => streakStatus(), [version]);
  useEffect(() => {
    track({ type: "streak_card_shown", state: status.state, streak: status.current });
    // Once per Play home mount, with the state it first showed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <p className={`streak-chip streak-chip-${status.state}`} role="status">
      {streakCardText(status)}
    </p>
  );
}
