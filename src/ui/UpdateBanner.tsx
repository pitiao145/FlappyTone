import { useState } from "react";

interface Props {
  /** Stable id of this update; a dismissal is remembered per id, so the next update shows again. */
  id: string;
  /** Short tag on the left, e.g. "New". */
  label: string;
  title: string;
  body: string;
  /** Omit to render the banner without a link. */
  actionLabel?: string;
  onAction?: () => void;
  /** "bar" is a thin full-width strip (landing page); "card" the Play-home sticker. */
  variant?: "card" | "bar";
  /** A permanent banner has no × and ignores any saved dismissal. Default true. */
  dismissible?: boolean;
}

const KEY = "flappytone.dismissedUpdates";

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** A "what's new" card for the Play home: one feature, one line, one link. */
export function UpdateBanner({
  id,
  label,
  title,
  body,
  actionLabel,
  onAction,
  variant = "card",
  dismissible = true,
}: Props) {
  const [hidden, setHidden] = useState(() => dismissible && readDismissed().includes(id));
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, JSON.stringify([...readDismissed(), id]));
    } catch {
      // Private mode: it just comes back next visit.
    }
  };

  return (
    <aside className={`update-banner update-banner--${variant}`}>
      <span className="badge badge-new">{label}</span>
      <div className="update-banner-text">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      {dismissible && (
        <button type="button" className="close-x" onClick={dismiss} aria-label="Dismiss update">
          ×
        </button>
      )}
      {actionLabel && onAction && (
        <button type="button" className="update-banner-link" onClick={onAction}>
          {actionLabel} →
        </button>
      )}
    </aside>
  );
}
