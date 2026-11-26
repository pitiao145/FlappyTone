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

/** Three looks for the card, picked by Pierre (brief 55 feedback). Dev only: `ft.dev.streakVariant`. */
export type StreakVariant = "plate" | "week" | "ribbon";
const DEFAULT_VARIANT: StreakVariant = "plate";

function variantFor(): StreakVariant {
  if (import.meta.env.DEV) {
    try {
      const v = localStorage.getItem("ft.dev.streakVariant");
      if (v === "plate" || v === "week" || v === "ribbon") return v;
    } catch {
      // ignore
    }
  }
  return DEFAULT_VARIANT;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The last 7 local days, oldest first, each marked played when it falls in
 * the live streak (the `current` days ending on the last played day).
 */
export function streakWeek(s: Pick<StreakStatus, "state" | "current">, lastPlayed: string, now = new Date()) {
  const days: { label: string; played: boolean; today: boolean }[] = [];
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
    });
  }
  return days;
}

/**
 * Play home's streak (brief 55): part of the title screen, never a button.
 * Reads `streakStatus()` (the server's `streak_last_day`, cached), re-read
 * when the account's stats land.
 */
export function StreakCard({ variant = variantFor() }: { variant?: StreakVariant }) {
  const version = useSessionVersion();
  const status = useMemo(() => streakStatus(), [version]);
  const lastPlayed = useMemo(() => loadStreakState().lastPlayedDate, [version]);
  useEffect(() => {
    track({ type: "streak_card_shown", state: status.state, streak: status.current });
    // Once per Play home mount, with the state it first showed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = status.state === "done_today" || status.state === "at_risk";
  const sub =
    status.state === "done_today" ? "done for today ✓" : status.state === "at_risk" ? "1 run keeps it" : "play a run to start";

  if (variant === "week") {
    return (
      <div className={`streak-week streak-${status.state}`} role="status" aria-label={streakCardText(status)}>
        <span className="streak-week-count">
          <span aria-hidden>🔥</span> {live ? status.current : 0}
        </span>
        <span className="streak-week-days" aria-hidden>
          {streakWeek(status, lastPlayed).map((d, i) => (
            <span key={i} className={`streak-day${d.played ? " is-played" : ""}${d.today ? " is-today" : ""}`}>
              <i>{d.played ? "🔥" : ""}</i>
              <b>{d.label}</b>
            </span>
          ))}
        </span>
      </div>
    );
  }

  if (variant === "ribbon") {
    return (
      <div className={`streak-ribbon streak-${status.state}`} role="status" aria-label={streakCardText(status)}>
        <span className="streak-ribbon-band">
          {live ? `🔥 ${status.current}-day streak` : "🔥 Start a streak"}
        </span>
        <span className="streak-ribbon-sub">{live ? sub : "1 run today starts it"}</span>
      </div>
    );
  }

  // "plate": the Flappy-style scoreboard plate.
  return (
    <div className={`streak-plate streak-${status.state}`} role="status" aria-label={streakCardText(status)}>
      <span className="streak-plate-flame" aria-hidden>
        🔥
      </span>
      <span className="streak-plate-num">{live ? status.current : 0}</span>
      <span className="streak-plate-text">
        <b>day streak</b>
        <span>{live ? sub : "1 run today starts it"}</span>
      </span>
    </div>
  );
}
