import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

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
  /**
   * False for a guest: they can see the board and their projected rank, but
   * have no permanent account to hold a row. The modal becomes an upgrade
   * prompt — `onJoin` still fires, but the caller wires it to opening the
   * account/upgrade path instead of `joinBoard()`. Default true (the
   * existing free/Pro "post my score" flow).
   */
  canJoin?: boolean;
}

export function JoinBoardModal({
  name,
  onJoin,
  onDismiss,
  busy = false,
  projected = null,
  canJoin = true,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (!canJoin) {
    // Portal to <body>: `.frame` is a `container-type` element, which makes it
    // the containing block for `position: fixed`, so a modal rendered in the
    // frame anchors to the frame (above the nav) instead of the viewport.
    return createPortal(
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
          <h2 id={titleId} className="join-modal-title">Claim your place on the board</h2>
          <p className="join-modal-projection">
            {projected ? (
              <>
                <strong>{projected.points.toLocaleString()}</strong> would land you around{" "}
                <strong>#{projected.rank} of {projected.total}</strong> this week — a free account
                is what saves your spot.
              </>
            ) : (
              "A free account is what lets your score hold a spot on the public leaderboard."
            )}
          </p>
          <button type="button" className="join-modal-post-btn" onClick={onJoin} disabled={busy}>
            {busy ? "Opening…" : "Create a free account"}
          </button>
          <button type="button" className="join-modal-dismiss-btn" onClick={onDismiss} disabled={busy}>Not now</button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
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
    </div>,
    document.body,
  );
}
