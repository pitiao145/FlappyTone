import { useEffect, useId, useState } from "react";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

export type EarlyBirdSurface = "progress" | "profile";

interface Props {
  surface: EarlyBirdSurface;
  /** Which locked section opened the modal — carried through to Kit/PostHog analytics only, not shown in copy. */
  feature: string;
  onClose: () => void;
}

/**
 * The EarlyBird signup modal — every locked "Soon" section across Progress
 * and Profile opens this same component. No payment processor is wired up
 * yet, so "Pay" is disabled; only the email capture is live, sharing the
 * Kit integration `ComingSoon`/Landing already use (`useNewsletterSubscribe`,
 * `api/newsletter.ts`), tagged with the dedicated "earlybird" source.
 */
export function EarlyBirdModal({ onClose }: Props) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const { status, error, submit } = useNewsletterSubscribe("earlybird");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <p className="modal-eyebrow">★ EarlyBird access</p>
        <h2 id={`${inputId}-title`}>Lock in the lowest price, forever</h2>
        <p className="modal-price">
          €19 <span className="modal-price-note">once · lifetime</span>
        </p>
        <p className="modal-body">
          FlappyTone is still early — unlimited play and saved progress are live
          now, deeper features ship over the coming weeks. EarlyBirds get
          everything as it lands, and never pay again. Full refund anytime.
        </p>

        <button type="button" className="primary modal-pay" disabled title="Checkout is coming soon">
          🔒 Pay €19 — get EarlyBird access
        </button>
        <p className="modal-pay-note">Checkout is coming soon.</p>

        <div className="modal-divider">
          <span>or</span>
        </div>

        {status === "success" ? (
          <p className="newsletter-success">You&rsquo;re on the list — we&rsquo;ll email you at the EarlyBird price.</p>
        ) : (
          <form
            className="coming-soon-form modal-notify-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit(email);
            }}
          >
            <label htmlFor={inputId} className="visually-hidden">
              Email address
            </label>
            <input
              id={inputId}
              type="email"
              name="email"
              placeholder="you@email.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "loading"}
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Joining…" : "Notify me"}
            </button>
          </form>
        )}
        {error && (
          <p className="newsletter-error" role="alert">
            {error}
          </p>
        )}
        <p className="modal-notify-note">
          Not ready to pay? Join the list and get the EarlyBird price when it&rsquo;s ready.
        </p>
      </div>
    </div>
  );
}
