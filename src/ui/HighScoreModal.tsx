import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "./Confetti.tsx";
import { ShareIcon } from "./icons.tsx";

interface Props {
  score: number;
  rank: number | null;
  total: number | null;
  onClose: () => void;
  onViewLeaderboard: () => void;
  onShare: () => void;
  shareBusy: boolean;
  canJoin: boolean;
  joined: boolean;
  onJoin: () => void;
}

export function HighScoreModal({
  score,
  rank,
  total,
  onClose,
  onViewLeaderboard,
  onShare,
  shareBusy,
  canJoin,
  joined,
  onJoin,
}: Props) {
  const titleId = useId();
  const [confettiDone, setConfettiDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rankLine =
    rank == null || total == null
      ? null
      : joined
        ? `You're #${rank} of ${total} this week`
        : `You'd rank #${rank} of ${total} this week`;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      {!confettiDone && <Confetti onDone={() => setConfettiDone(true)} />}
      <div
        className="modal-card modal-card--sheet hsm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-modal-handle" aria-hidden="true" />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <p className="hsm-trophy" aria-hidden="true">🏆</p>
        <p className="hsm-eyebrow">New personal best</p>
        <p id={titleId} className="hsm-score">{score.toLocaleString()}</p>
        {rankLine && <p className="hsm-rank">{rankLine}</p>}

        {!joined && (
          <button type="button" className="go-btn-gold hsm-join-btn" onClick={onJoin}>
            {canJoin ? "Add to leaderboard" : "Create free account"}
          </button>
        )}

        <div className="hsm-actions">
          <button type="button" className="go-btn-ghost hsm-action-btn" onClick={onViewLeaderboard}>
            See leaderboard
          </button>
          <button
            type="button"
            className="hsm-share-btn hsm-action-btn"
            disabled={shareBusy}
            onClick={onShare}
          >
            <ShareIcon />
            {shareBusy ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
