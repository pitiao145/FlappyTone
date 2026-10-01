import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { cleanShareName, SHARE_NAME_MAX } from "../share/shareName.ts";

interface Props {
  /** Pre-filled from the last share on this device. */
  initialName: string;
  /** Cleaned name ("" when left blank) — the caller renders the card and opens the share sheet. */
  onConfirm: (name: string) => void;
  onDismiss: () => void;
}

/** The step between tapping Share and the share sheet: put your name on the card and the link. */
export function ShareNameModal({ initialName, onConfirm, onDismiss }: Props) {
  const titleId = useId();
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const name = cleanShareName(value);

  // Portal to <body> for the same reason JoinBoardModal does (`.frame` is a
  // container-type element, so `position: fixed` would anchor to it).
  return createPortal(
    <div className="modal-backdrop" onClick={onDismiss}>
      <form
        className="modal-card modal-card--sheet join-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(name);
        }}
      >
        <div className="join-modal-handle" aria-hidden="true" />
        <button type="button" className="modal-close" onClick={onDismiss} aria-label="Close">×</button>
        <h2 id={titleId} className="join-modal-title">Put your name on it</h2>
        <p className="join-modal-projection">
          Your friends will see it on the card and when they open your link — it's
          more fun to beat a name than "someone".
        </p>
        <input
          className="share-name-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={SHARE_NAME_MAX}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="send"
          autoFocus
        />
        <button type="submit" className="join-modal-post-btn">
          {name ? "Share" : "Share without a name"}
        </button>
        <button type="button" className="join-modal-dismiss-btn" onClick={onDismiss}>Cancel</button>
      </form>
    </div>,
    document.body,
  );
}
