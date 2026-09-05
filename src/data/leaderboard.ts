/**
 * Reading and writing the weekly board.
 *
 * All of it obeys the rule in `supabase.ts`: every function here resolves, none
 * of them throw. A failure returns an empty board or `false`, and the caller
 * shows nothing rather than an error the player can't act on.
 *
 * The write split matters and is not an accident:
 *
 * - **The profile is written by the client.** A player owns their own row and
 *   row-level security says so (`auth.uid() = id`), so there is no server code
 *   in that path.
 * - **The score is written by `api/score.ts`.** A score is contestable — left
 *   to the client, "I scored 999,999" is one devtools call away — so the table
 *   has no client write policy at all. The browser physically cannot insert
 *   into it, even holding a valid session.
 *
 * The week is computed here too, but only for *display*. `api/score.ts`
 * recomputes it from server time when it writes, because a device clock is
 * something a player can set.
 */
import { currentSession, ensureAnonSession, getSupabase } from "./supabase.ts";

const IDENTITY_KEY = "toneflap.identity.v1";

export interface BoardRow {
  userId: string;
  name: string;
  score: number;
}

export interface Board {
  weekId: string;
  rows: BoardRow[];
  /** 1-based position of the player, or null if they haven't joined. */
  myRank: number | null;
  /** How many players are on the board this week. */
  total: number;
}

/**
 * ISO-8601 week, e.g. "2026-W36". Display only — see the module comment.
 *
 * ISO weeks start on Monday and belong to the year containing their Thursday,
 * so the week-year can differ from the calendar year around New Year: 1 Jan
 * 2027 falls in week 53 of ISO year 2026. Shifting to that Thursday first is
 * what makes both numbers come out right.
 */
export function currentWeekId(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayFromMonday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayFromMonday + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const ADJECTIVES = [
  "Brave", "Swift", "Sunny", "Lucky", "Clever", "Jade", "Bold", "Merry",
  "Quiet", "Wild", "Golden", "Nimble", "Bright", "Calm", "Keen", "Rosy",
];
const BIRDS = [
  "Sparrow", "Finch", "Swallow", "Magpie", "Robin", "Crane", "Heron", "Wren",
  "Lark", "Falcon", "Egret", "Oriole", "Swift", "Plover", "Kite", "Bulbul",
];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = BIRDS[Math.floor(Math.random() * BIRDS.length)];
  return `${a}${b}${Math.floor(Math.random() * 90) + 10}`;
}

/**
 * The player's board name, minted on first ask and stable thereafter.
 *
 * Held locally as well as in the `profiles` row so the join modal can show the
 * name *before* the row exists — the player sees what they are agreeing to.
 * Names are not unique and are not meant to be; two BraveSparrow42s are
 * distinguished by their user id, and picking your own name is a Pro feature.
 */
export function displayName(): string {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.length >= 1 && parsed.name.length <= 24) {
        return parsed.name;
      }
    }
  } catch {
    // Fall through and mint a new one.
  }
  const name = randomName();
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name }));
  } catch {
    // Storage blocked — the name just won't survive a reload.
  }
  return name;
}

/** Whether this player already has a board profile. Never signs them in. */
export async function hasJoined(): Promise<boolean> {
  const supabase = getSupabase();
  const session = await currentSession();
  if (!supabase || !session) return false;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    return !error && data != null;
  } catch {
    return false;
  }
}

/**
 * Signs the player in anonymously if needed and creates their profile row.
 * Idempotent: joining twice keeps the first name rather than failing.
 */
export async function joinBoard(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const userId = await ensureAnonSession();
  if (!userId) return false;
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: displayName() }, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      console.error("[leaderboard] could not create profile", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a finished run's score to `api/score.ts`, which decides whether it
 * beats the player's standing best for the week.
 *
 * Fire-and-forget by contract: the game-over screen calls this and moves on.
 * It resolves `false` on any failure and never rejects.
 */
export async function submitScore(score: number): Promise<boolean> {
  const session = await currentSession();
  if (!session) return false;
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ score }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const EMPTY: Board = { weekId: "", rows: [], myRank: null, total: 0 };

/**
 * The week's board: the top `limit` players, plus where this player sits in
 * the full field. Rank is counted server-side rather than looked up in `rows`,
 * so a player below the cut still learns their position.
 */
export async function getBoard(limit = 50): Promise<Board> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY;
  const weekId = currentWeekId();
  try {
    const { data, error } = await supabase
      .from("leaderboard_scores")
      .select("user_id, best_score, profiles(display_name)")
      .eq("week_id", weekId)
      .order("best_score", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[leaderboard] could not read board", error.message);
      return { ...EMPTY, weekId };
    }
    const rows: BoardRow[] = (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.profiles?.display_name ?? "player",
      score: r.best_score,
    }));

    const { count } = await supabase
      .from("leaderboard_scores")
      .select("user_id", { count: "exact", head: true })
      .eq("week_id", weekId);

    return { weekId, rows, myRank: await myRank(weekId), total: count ?? rows.length };
  } catch {
    return { ...EMPTY, weekId };
  }
}

/** 1-based rank as "how many players beat me, plus one". Null if unranked. */
async function myRank(weekId: string): Promise<number | null> {
  const supabase = getSupabase();
  const session = await currentSession();
  if (!supabase || !session) return null;
  try {
    const mine = await supabase
      .from("leaderboard_scores")
      .select("best_score")
      .eq("week_id", weekId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    const best = mine.data?.best_score;
    if (best == null) return null;
    const { count, error } = await supabase
      .from("leaderboard_scores")
      .select("user_id", { count: "exact", head: true })
      .eq("week_id", weekId)
      .gt("best_score", best);
    if (error) return null;
    return (count ?? 0) + 1;
  } catch {
    return null;
  }
}

/** The signed-in player's id, without creating a session. For row highlighting. */
export async function myUserId(): Promise<string | null> {
  const session = await currentSession();
  return session?.user.id ?? null;
}
