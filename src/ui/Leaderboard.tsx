import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { getBoard, myUserId, type Board } from "../data/leaderboard.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { useTier } from "../data/tier.ts";
import { TIER_LIMITS } from "../game/tiers.ts";

/**
 * Rows shown to a tier without `leaderboardFull` (guest/free), on top of
 * their own pinned row below the cut. 10 is enough to be a real teaser —
 * "who's actually winning this week" — without giving away the whole top 50
 * a Pro player gets.
 */
const TEASER_ROWS = 10;

interface Props {
  /** How many rows to fetch and show. Default 50. */
  limit?: number;
  /**
   * When provided, renders as a modal/bottom-sheet (backdrop + card, header,
   * close button, Escape to dismiss) and calls this to dismiss. When omitted
   * — the embedded `Progress.tsx` usage — renders the bare inline list with
   * no backdrop/header, unchanged from before.
   */
  onClose?: () => void;
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
export function Leaderboard({ limit = 50, onClose }: Props) {
  const tier = useTier();
  const full = TIER_LIMITS[tier].leaderboardFull;
  const [board, setBoard] = useState<Board | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const titleId = useId();
  // Ticks on sign-in/sign-out (see `sessionVersion.ts`) — a fresh sign-in can
  // change which id is "you" and, once synced, a joined player's row/name;
  // re-fetching keeps the "you" highlight and pinned row correct without a
  // reload.
  const version = useSessionVersion();

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
  }, [limit, version]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (!board) {
    body = <p className="note">Loading the board…</p>;
  } else if (board.rows.length === 0) {
    body = <p className="note">No scores yet this week — be the first.</p>;
  } else {
    // A guest/free tier only sees the top TEASER_ROWS — enough to show the
    // board is real and competitive — plus their own pinned row below the
    // cut, same as a below-cut Pro row. `board.rows` itself always holds up
    // to `limit` (fetched in full so `board.total`/`myRank` stay accurate).
    const visibleRows = full ? board.rows : board.rows.slice(0, TEASER_ROWS);
    const hiddenCount = board.rows.length - visibleRows.length;
    const visibleIds = new Set(visibleRows.map((r) => r.userId));
    const belowCut = board.myRank != null && userId != null && !visibleIds.has(userId);
    const myRow = userId != null ? board.rows.find((r) => r.userId === userId) : undefined;

    body = (
      <>
        {visibleRows.map((row, i) => {
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
        {!full && hiddenCount > 0 && (
          <div className="leaderboard-row leaderboard-locked-row">
            <span className="leaderboard-name">
              +{hiddenCount} more {hiddenCount === 1 ? "player" : "players"}
            </span>
            <span className="pro-badge">🔒 Pro</span>
          </div>
        )}
        {belowCut && (
          <>
            <div className="leaderboard-gap">···</div>
            <div className="leaderboard-row leaderboard-you leaderboard-pinned">
              <span className="leaderboard-rank">{board.myRank}</span>
              <span className="leaderboard-name">
                {myRow?.name ?? "You"} · you
              </span>
              {myRow != null && (
                <span className="leaderboard-score">{myRow.score.toLocaleString()}</span>
              )}
            </div>
          </>
        )}
      </>
    );

    if (onClose && board.myRank != null) {
      const fifth = board.rows[4];
      const gap =
        board.myRank > 5 && fifth != null && myRow != null ? fifth.score - myRow.score : null;

      const shareText = `I'm #${board.myRank} of ${board.total} on this week's FlappyTone leaderboard`;

      const onShareRank = async () => {
        try {
          if (navigator.share) {
            await navigator.share({ text: shareText });
            return;
          }
        } catch {
          // Fall through to the clipboard fallback below.
        }
        try {
          await navigator.clipboard.writeText(shareText);
          setShareCopied(true);
          window.setTimeout(() => setShareCopied(false), 2000);
        } catch {
          // Nothing more we can do — never throw into the caller.
        }
      };

      footer = (
        <div className="leaderboard-footer">
          <p className="note leaderboard-footer-note">
            You&rsquo;re #{board.myRank} of {board.total}
            {gap != null && gap > 0 ? ` — ${gap.toLocaleString()} to reach the top 5.` : ""}
          </p>
          <button type="button" className="leaderboard-share" onClick={() => void onShareRank()}>
            {shareCopied ? "Copied!" : "Share rank"}
          </button>
        </div>
      );
    } else if (!onClose && belowCut) {
      footer = (
        <p className="note">
          You&rsquo;re #{board.myRank} of {board.total}
        </p>
      );
    }
  }

  if (!onClose) {
    return (
      <div className="leaderboard-preview">
        {body}
        {footer}
      </div>
    );
  }

  // Portal to <body>: `.frame` uses `container-type`, which makes it the
  // containing block for `position: fixed`, so a modal rendered inside the
  // frame (this one opens from GameOver) would anchor to the frame — above the
  // nav — instead of the viewport, clipping the sheet's bottom.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--sheet leaderboard-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-modal-handle" aria-hidden="true" />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="modal-eyebrow">★ Weekly leaderboard</p>
        <h2 id={titleId}>This week</h2>
        <p className="note leaderboard-sheet-subtitle">
          Resets Monday{board ? ` · ${board.total} players` : ""}
        </p>
        <div className="leaderboard-preview leaderboard-sheet-body">{body}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
