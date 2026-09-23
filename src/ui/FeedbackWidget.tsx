import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { FEEDBACK_MAX_CHARS, submitFeedback } from "../data/feedback.ts";
import { getTier } from "../data/tier.ts";

/**
 * 1 → 5, worst to best. Index + 1 is the stored `rating`. Each step is Pip
 * drawn a size bigger: a tiny bird is "awful", a big one is "love it".
 */
const RATINGS = [
  { size: 18, label: "Awful" },
  { size: 25, label: "Not great" },
  { size: 32, label: "Okay" },
  { size: 39, label: "Good" },
  { size: 46, label: "Love it" },
] as const;

type Status = "idle" | "sending" | "sent" | "failed";

/**
 * A vertical "Feedback" tab on the right edge, and the bottom sheet it opens.
 * Writes one row to `public.feedback` via `submitFeedback`.
 *
 * `GameApp.tsx` decides where this renders (an allow-list of screens) — it
 * must never appear over a live run or the visualiser, where a stray tap on
 * the tab would steal a player's attention mid-utterance.
 *
 * Both the tab and the sheet portal to `<body>`: `.frame` is a
 * `container-type` element, so `position: fixed` inside it would anchor to the
 * frame instead of the viewport (same reason as `JoinBoardModal`).
 */
export function FeedbackWidget({ screen }: { screen: string }) {
  const [open, setOpen] = useState(false);

  return createPortal(
    <>
      {!open && (
        <button type="button" className="feedback-tab" onClick={() => setOpen(true)}>
          Feedback
        </button>
      )}
      {open && <FeedbackSheet screen={screen} onClose={() => setOpen(false)} />}
    </>,
    document.body,
  );
}

function FeedbackSheet({ screen, onClose }: { screen: string; onClose: () => void }) {
  const titleId = useId();
  const textId = useId();
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on its own a moment after a successful send.
  useEffect(() => {
    if (status !== "sent") return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [status, onClose]);

  const canSend = message.trim().length > 0 && status !== "sending";

  const send = async () => {
    if (!canSend) return;
    setStatus("sending");
    const ok = await submitFeedback({ message, rating, screen, tier: getTier() });
    setStatus(ok ? "sent" : "failed");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--sheet feedback-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-modal-handle" aria-hidden="true" />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="feedback-header">
          <img src="/Bird-hor-no-halo.png" alt="" className="feedback-avatar" />
          <div>
            <h2 id={titleId} className="feedback-title">
              Your feedback is crucial 🐥
            </h2>
            <p className="feedback-byline">— Pierre from FlappyTone</p>
          </div>
        </div>

        {status === "sent" ? (
          <p className="feedback-thanks" role="status">
            Thank you! Keep flapping.
          </p>
        ) : (
          <>
            <label htmlFor={textId} className="feedback-label">
              Feedback
            </label>
            <textarea
              id={textId}
              className="feedback-textarea"
              rows={4}
              maxLength={FEEDBACK_MAX_CHARS}
              placeholder="My tones became so good I got mistaken for a native speaker.. "
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <p className="feedback-label">How do you enjoy FlappyTone so far?</p>
            <div className="feedback-ratings" role="radiogroup" aria-label="Rating">
              {RATINGS.map((r, i) => (
                <button
                  key={r.label}
                  type="button"
                  role="radio"
                  aria-checked={rating === i + 1}
                  aria-label={r.label}
                  className={`feedback-rating${rating === i + 1 ? " is-selected" : ""}`}
                  onClick={() => setRating(rating === i + 1 ? null : i + 1)}
                >
                  <img src="/Bird-hor-no-halo.png" alt="" width={r.size} height={r.size} />
                </button>
              ))}
            </div>

            {status === "failed" && (
              <p className="feedback-error" role="alert">
                Couldn't send that. Check your connection and try again.
              </p>
            )}

            <button type="button" className="feedback-send" onClick={() => void send()} disabled={!canSend}>
              {status === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
