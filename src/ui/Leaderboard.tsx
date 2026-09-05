import { useEffect, useState } from "react";
import { getBoard, myUserId, type Board } from "../data/leaderboard.ts";

interface Props {
  /** How many rows to fetch and show. Default 50. */
  limit?: number;
}

function rankLabel(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

/**
 * A self-contained weekly leaderboard: fetches its own data and renders
 * loading / empty / populated states. Drop it anywhere with no wiring —
 * `src/data/leaderboard.ts` never throws, so every failure just shows the
 * empty-board copy rather than an error.
 */
export function Leaderboard({ limit = 50 }: Props) {
  const [board, setBoard] = useState<Board | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `getBoard` is contracted never to reject, but a rejection here would
    // leave the card stuck on "Loading the board…" forever rather than
    // falling through to the empty state. Cheap to be certain.
    getBoard(limit)
      .catch(() => ({ weekId: "", rows: [], myRank: null, total: 0 }) satisfies Board)
      .then((b) => {
        if (!cancelled) setBoard(b);
      });
    myUserId()
      .catch(() => null)
      .then((id) => {
        if (!cancelled) setUserId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (!board) {
    return (
      <div className="leaderboard-preview">
        <p className="note">Loading the board…</p>
      </div>
    );
  }

  if (board.rows.length === 0) {
    return (
      <div className="leaderboard-preview">
        <p className="note">No scores yet this week — be the first.</p>
      </div>
    );
  }

  const visibleIds = new Set(board.rows.map((r) => r.userId));
  const belowCut = board.myRank != null && userId != null && !visibleIds.has(userId);

  return (
    <div className="leaderboard-preview">
      <p className="note">This week</p>
      {board.rows.map((row, i) => {
        const rank = i + 1;
        const isYou = userId != null && row.userId === userId;
        return (
          <div key={row.userId} className={isYou ? "leaderboard-row leaderboard-you" : "leaderboard-row"}>
            <span className="leaderboard-rank">{rankLabel(rank)}</span>
            <span className="leaderboard-name">{row.name}</span>
            <span className="leaderboard-score">{row.score.toLocaleString()}</span>
          </div>
        );
      })}
      {belowCut && (
        <p className="note">
          You&rsquo;re #{board.myRank} of {board.total}
        </p>
      )}
    </div>
  );
}
