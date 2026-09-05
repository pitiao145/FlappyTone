import { useEffect, useId } from "react";

interface Props {
  /** The player's already-minted board name — shown, never editable here. */
  name: string;
  onJoin: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

/**
 * Opt-in prompt for the weekly leaderboard, shown on the game-over screen.
 * Presentational only: it does not call `joinBoard()` itself, the caller
 * owns that and passes `busy` while it's in flight.
 */
export function JoinBoardModal({ name, onJoin, onDismiss, busy = false }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onDismiss} aria-label="Close">
          ×
        </button>

        <p className="modal-eyebrow">★ Weekly leaderboard</p>
        <h2 id={titleId}>Put your best score on the board</h2>
        <p className="modal-body">
          Joining shares your best score this week on the public leaderboard, under the name
          below.
        </p>

        <p className="leaderboard-name">{name}</p>
        <p className="note">Picking your own name is coming with Pro.</p>

        <button type="button" className="primary" onClick={onJoin} disabled={busy}>
          {busy ? "Joining…" : "Join the board"}
        </button>
        <button type="button" className="link" onClick={onDismiss} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
