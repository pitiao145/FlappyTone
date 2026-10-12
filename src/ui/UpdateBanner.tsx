import { useEffect, useState } from "react";

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
  /**
   * Told when the banner is shown (once per mount), clicked or dismissed. A
   * callback, not a `track()` import: the landing page shares this component
   * and must not pull in the game's analytics client.
   */
  onEvent?: (action: "shown" | "clicked" | "dismissed") => void;
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
  onEvent,
}: Props) {
  const [hidden, setHidden] = useState(() => dismissible && readDismissed().includes(id));
  useEffect(() => {
    if (!hidden) onEvent?.("shown");
    // Once per mount: a dismissal hides it, it does not re-show it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (hidden) return null;

  const dismiss = () => {
    onEvent?.("dismissed");
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
        <button type="button" className="update-banner-link" onClick={() => {
            onEvent?.("clicked");
            onAction();
          }}
        >
          {actionLabel} →
        </button>
      )}
    </aside>
  );
}
