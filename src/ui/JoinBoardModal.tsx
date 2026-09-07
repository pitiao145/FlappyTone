import { useEffect, useId } from "react";

interface Projected {
  points: number;
  rank: number;
  total: number;
}

interface Props {
  name: string;
  onJoin: () => void;
  onDismiss: () => void;
  busy?: boolean;
  projected?: Projected | null;
}

export function JoinBoardModal({ name, onJoin, onDismiss, busy = false, projected = null }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        className="modal-card modal-card--sheet join-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-modal-handle" aria-hidden="true" />
        <button type="button" className="modal-close" onClick={onDismiss} aria-label="Close">×</button>
        <p className="join-modal-trophy" aria-hidden="true">🏆</p>
        <h2 id={titleId} className="join-modal-title">Add to weekly board</h2>
        <p className="join-modal-projection">
          {projected ? (
            <>
              You'll post <strong>{projected.points.toLocaleString()}</strong> points and land around{" "}
              <strong>#{projected.rank} of {projected.total}</strong>.
            </>
          ) : (
            "Joining shares your best score this week on the public leaderboard."
          )}
        </p>
        <div className="join-modal-posting-row">
          <div className="join-modal-posting-info">
            <p className="join-modal-posting-label">Posting as</p>
            <p className="join-modal-posting-name">{name}</p>
          </div>
          <span className="join-modal-name-pill" aria-disabled="true">Your board name</span>
        </div>
        <button type="button" className="join-modal-post-btn" onClick={onJoin} disabled={busy}>
          {busy ? "Joining…" : "Post my score"}
        </button>
        <button type="button" className="join-modal-dismiss-btn" onClick={onDismiss} disabled={busy}>Not now</button>
      </div>
    </div>
  );
}
