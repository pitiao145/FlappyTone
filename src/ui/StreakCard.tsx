import { useEffect, useMemo } from "react";
import { track } from "../analytics/client.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { loadStreakState, streakStatus, type StreakStatus } from "../game/streak.ts";

/** The card's one line for a streak state (brief 55). */
export function streakCardText(s: Pick<StreakStatus, "state" | "current">): string {
  if (s.state === "done_today") return `🔥 ${s.current}-day streak · done for today`;
  if (s.state === "at_risk") return `🔥 ${s.current} ${s.current === 1 ? "day" : "days"} · 1 run keeps it`;
  return "Start a streak today";
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The last 7 local days, oldest first, each marked played when it falls in
 * the live streak (the `current` days ending on the last played day).
 */
export function streakWeek(s: Pick<StreakStatus, "state" | "current">, lastPlayed: string, now = new Date()) {
  const days: { label: string; played: boolean; today: boolean; missed: boolean }[] = [];
  const live = s.state === "done_today" || s.state === "at_risk";
  let first = "";
  if (live && lastPlayed) {
    const [y, m, d] = lastPlayed.split("-").map(Number);
    first = fmt(new Date(y, m - 1, d - (s.current - 1)));
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const day = fmt(d);
    days.push({
      label: d.toLocaleDateString("en", { weekday: "narrow" }),
      played: live && day >= first && day <= lastPlayed,
      today: i === 0,
      missed: false,
    });
  }
  // Habits Garden's grid tells a check-in from a miss: a past day without a
  // run reads as missed once the player has ever played.
  if (lastPlayed) for (const d of days) d.missed = !d.played && !d.today;
  return days;
}

/**
 * Play home's streak (brief 55): part of the title screen, never a button.
 * Reads `streakStatus()` (the server's `streak_last_day`, cached), re-read
 * when the account's stats land.
 */
export function StreakCard() {
  const version = useSessionVersion();
  const status = useMemo(() => streakStatus(), [version]);
  const lastPlayed = useMemo(() => loadStreakState().lastPlayedDate, [version]);
  useEffect(() => {
    track({ type: "streak_card_shown", state: status.state, streak: status.current });
    // Once per Play home mount, with the state it first showed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = status.state === "done_today" || status.state === "at_risk";
  const days = streakWeek(status, lastPlayed);
  const caption =
    status.state === "done_today"
      ? "Done for today ✓ · come back tomorrow"
      : status.state === "at_risk"
        ? "1 run today keeps it"
        : status.state === "broken"
          ? "1 run starts a new streak"
          : "1 run starts your streak";
  return (
    <div className={`streak-week streak-${status.state}`} role="status" aria-label={streakCardText(status)}>
      <div className="streak-week-row">
        <span className="streak-week-count">
          <span className="streak-week-flame" aria-hidden>🔥</span>
          <span className="streak-week-num">{live ? status.current : 0}</span>
        </span>
        <span className="streak-week-days" aria-hidden>
          {days.map((d, i) => (
            <span
              key={i}
              className={`streak-day${d.played ? " is-played" : ""}${d.today ? " is-today" : ""}${d.missed ? " is-missed" : ""}`}
            >
              <i>{d.played ? "🔥" : ""}</i>
              <b>{d.today ? "today" : d.label}</b>
            </span>
          ))}
        </span>
      </div>
      <span className="streak-week-caption">
        {caption}
        {status.best > (live ? status.current : 0) && <> · best {status.best}</>}
      </span>
    </div>
  );
}
