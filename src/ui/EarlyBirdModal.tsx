import { useEffect, useId, useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { PRO_FEATURES, PRO_PRICE } from "./plan.ts";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

export type EarlyBirdSurface = "progress" | "profile" | "daily-limit";

interface Props {
  surface: EarlyBirdSurface;
  /** Which specific CTA opened the modal — tags the `earlybird_pay_click` event, not shown in copy. */
  feature: string;
  onClose: () => void;
}

/**
 * Copy that actually differs by surface. Price, payment button and the
 * email-capture fallback below are identical for all of them — only the
 * reason the modal opened changes.
 */
const COPY: Record<EarlyBirdSurface, { eyebrow: string; title: string; body: string }> = {
  progress: {
    eyebrow: "★ EarlyBird access",
    title: "Lock in the lowest price, forever",
    body: "FlappyTone is still early. Sign up now for unlimited play and access to all the future features. EarlyBirds get everything as it lands, and never pay again.",
  },
  profile: {
    eyebrow: "★ EarlyBird access",
    title: "Lock in the lowest price, forever",
    body: "FlappyTone is still early. Sign up now for unlimited play and access to all the future features. EarlyBirds get everything as it lands, and never pay again.",
  },
  "daily-limit": {
    eyebrow: "★ Daily limit reached",
    title: "You've flown all 5 free runs today",
    body: "Come back tomorrow for 5 more, or go EarlyBird now for unlimited play today and every day after — plus everything else as it lands. Full refund anytime.",
  },
};

/**
 * The EarlyBird signup modal — every locked "Soon" section across Progress
 * and Profile opens this same component, and so does hitting the free
 * tier's 5-runs-a-day cap (`dailyLimitReached` in GameApp.tsx). No payment
 * processor is wired up yet, so "Pay" is disabled; only the email capture is
 * live, sharing the Kit integration `ComingSoon`/Landing already use
 * (`useNewsletterSubscribe`, `api/newsletter.ts`), tagged with the dedicated
 * "earlybird" source.
 */
export function EarlyBirdModal({ surface, feature, onClose }: Props) {
  const inputId = useId();
  const payPromptInputId = useId();
  const [email, setEmail] = useState("");
  const { status, error, submit } = useNewsletterSubscribe("earlybird");
  const copy = COPY[surface];
  /**
   * "Pay" can't actually charge anyone yet, so a tap on it is a missed
   * conversion unless it's caught here — this opens a second, focused modal
   * with the same email capture the main card already has below the fold,
   * for whoever clicked Pay without noticing it (or without scrolling to it
   * at all on a short viewport).
   */
  const [payPromptOpen, setPayPromptOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape backs out one layer at a time — closing the whole EarlyBird
      // modal out from under someone mid-email-entry in the Pay prompt would
      // throw away what they were doing for no reason.
      if (payPromptOpen) setPayPromptOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, payPromptOpen]);

  /** The email-capture form, shared verbatim by the main card and the Pay prompt — same `useNewsletterSubscribe` state either way, just a distinct `id` so both can exist in the DOM at once without colliding. */
  const notifyForm = (id: string) => (
    <>
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
          <label htmlFor={id} className="visually-hidden">
            Email address
          </label>
          <input
            id={id}
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
    </>
  );

  return (
    // A fragment, not a single backdrop: the Pay prompt below is a second,
    // independent full-screen overlay, not a child of this one — nesting it
    // inside this backdrop would let a click on *its* background bubble up
    // and fire this backdrop's own onClose too, closing both layers at once
    // on a click meant for only the top one.
    <>
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

          <p className="modal-eyebrow">{copy.eyebrow}</p>
          <h2 id={`${inputId}-title`}>{copy.title}</h2>
          <p className="modal-price">
            {PRO_PRICE} <span className="modal-price-note">once · lifetime</span>
          </p>
          <p className="modal-body">{copy.body}</p>

          <ul className="modal-features">
            {PRO_FEATURES.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>

          {/*
            Not a native `disabled` button: disabled elements never dispatch a
            click event, which silently threw away the one signal we actually
            want right now (is anyone trying to pay before checkout exists?).
            `.modal-pay`'s own styling (App.css) is already unconditional —
            opacity/cursor don't key off `:disabled` — so dropping the
            attribute changes nothing visually. `aria-disabled` keeps the
            non-functional intent for assistive tech without blocking the click.
          */}
          <button
            type="button"
            className="primary modal-pay"
            aria-disabled="true"
            title="Checkout is coming soon"
            onClick={() => {
              capturePostHogEvent("earlybird_pay_click", { surface, feature });
              setPayPromptOpen(true);
            }}
          >
            🔒 Pay {PRO_PRICE} — get EarlyBird access
          </button>
          <p className="modal-pay-note">Checkout is coming soon.</p>

          <div className="modal-divider">
            <span>or</span>
          </div>

          {notifyForm(inputId)}
          <p className="modal-notify-note">
            Not ready to pay? Join the list and get the EarlyBird price when it&rsquo;s ready.
          </p>
        </div>
      </div>

      {payPromptOpen && (
        <div className="modal-backdrop" onClick={() => setPayPromptOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${payPromptInputId}-title`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setPayPromptOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="modal-eyebrow">★ Checkout isn&rsquo;t open yet</p>
            <h2 id={`${payPromptInputId}-title`}>Get the EarlyBird price the moment it is</h2>
            <p className="modal-body">
              Payments aren&rsquo;t live yet. Leave your email and we&rsquo;ll notify you the second
              checkout opens, still at the EarlyBird price.
            </p>
            {notifyForm(payPromptInputId)}
          </div>
        </div>
      )}
    </>
  );
}
