import { useEffect, useId, useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { getAccount } from "../data/account.ts";
import { buildCheckoutUrl, redirectToCheckoutForCurrentAccount } from "../data/checkout.ts";
import { setPendingCheckout } from "../data/checkoutIntent.ts";
import { useTier } from "../data/tier.ts";
import { TIER_LIMITS } from "../game/tiers.ts";
import { PRO_FEATURES, PRO_PRICE } from "./plan.ts";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

export type EarlyBirdSurface = "progress" | "profile" | "daily-limit" | "visualiser" | "leaderboard";

interface Props {
  surface: EarlyBirdSurface;
  /** Which specific CTA opened the modal — tags the `earlybird_pay_click` event, not shown in copy. */
  feature: string;
  onClose: () => void;
  /**
   * Routes to the account UI (`AccountCard.tsx`, on the Profile screen) — the
   * "create a free account" door. Only shown to a guest, and only when the
   * caller wires this in; omit it to keep the door hidden (e.g. a spot that
   * can't navigate to Profile). `GameApp.tsx` should pass something that
   * switches to the Profile tab and closes this modal. Passing `"checkout"`
   * (the guest Pay button below) tells the caller to open the dedicated
   * checkout-signup screen instead, so the account form isn't buried under
   * the Profile tab's other cards on the way to paying.
   */
  onCreateAccount?: (intent?: "checkout") => void;
}

/**
 * Copy that actually differs by surface, and by whether the player is a
 * guest (no account) or already free (account, no Pro). A guest's copy names
 * the free account as the immediate next step; a free player's copy is
 * Pro-only, since they already took that step.
 */
const COPY: Record<
  EarlyBirdSurface,
  { eyebrow: string; title: string; body: string; guestBody?: string }
> = {
  progress: {
    eyebrow: "★ EarlyBird access",
    title: "Lock in the lowest price, forever",
    body: "FlappyTone is still early. Sign up now for unlimited play and access to all the future features. EarlyBirds get everything as it lands, and never pay again.",
    guestBody:
      "Create a free account to save your progress and get a real row on the leaderboard. Ready to go further? EarlyBird unlocks unlimited play and every future feature, for good.",
  },
  profile: {
    eyebrow: "★ EarlyBird access",
    title: "Lock in the lowest price, forever",
    body: "FlappyTone is still early. Sign up now for unlimited play and access to all the future features. EarlyBirds get everything as it lands, and never pay again.",
    guestBody:
      "Create a free account to save your progress and get a real row on the leaderboard. Ready to go further? EarlyBird unlocks unlimited play and every future feature, for good.",
  },
  "daily-limit": {
    eyebrow: "★ Daily limit reached",
    title: "You've flown all your free runs today",
    body: "Come back tomorrow, or go EarlyBird now for unlimited play today and every day after — plus everything else as it lands. Full refund anytime.",
    guestBody: `Come back tomorrow, or create a free account for ${TIER_LIMITS.free.runsPerDay} runs a day instead of ${TIER_LIMITS.guest.runsPerDay}. Want no limit at all? EarlyBird gives unlimited play today and every day after.`,
  },
  leaderboard: {
    eyebrow: "★ Claim your place",
    title: "Your score is good enough to be on the board",
    body: "A free account puts you on the weekly leaderboard and saves your progress across devices. EarlyBird adds your own name, every word, and unlimited runs.",
  },
  visualiser: {
    eyebrow: "★ EarlyBird access",
    title: "Practise every word, every tone",
    body: "The visualiser's per-tone practice and the full word list come with EarlyBird — along with everything else as it lands. Full refund anytime.",
    guestBody:
      "Create a free account to unlock per-tone practice. EarlyBird goes further, with every word for every tone and everything else as it lands.",
  },
};

/**
 * The EarlyBird signup modal — every locked "Soon" section across Progress
 * and Profile opens this same component, and so does hitting the daily
 * runs cap (`dailyLimitReached` in GameApp.tsx). A guest also sees a second
 * door here: creating a free account, a smaller step than paying. Pay is a
 * live Lemon Squeezy checkout for a signed-in free account; a guest's Pay
 * routes through the create-account-first screen and on to checkout. The
 * email capture below stays as a "not ready to pay" fallback, sharing the Kit
 * integration `ComingSoon`/Landing already use (`useNewsletterSubscribe`,
 * `api/newsletter.ts`), tagged with the dedicated "earlybird" source.
 */
export function EarlyBirdModal({ surface, feature, onClose, onCreateAccount }: Props) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const { status, error, submit } = useNewsletterSubscribe("earlybird");
  const tier = useTier();
  const isGuest = tier === "guest";
  const copy = COPY[surface];
  const body = (isGuest && copy.guestBody) || copy.body;
  const showAccountDoor = isGuest && !!onCreateAccount;

  // The store doesn't exist yet, so an unset checkout URL keeps today's
  // behaviour exactly: the "disabled-look" button opens the email-capture
  // fallback below rather than ever rendering a broken link.
  const checkoutBase = import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL as string | undefined;
  const [account, setAccount] = useState<{ userId: string | null; email: string | null } | null>(null);
  useEffect(() => {
    if (!checkoutBase) return;
    let cancelled = false;
    void getAccount().then((a) => {
      if (!cancelled) setAccount({ userId: a.userId, email: a.email });
    });
    return () => {
      cancelled = true;
    };
  }, [checkoutBase]);

  // Real checkout only when: the store exists, the player is signed in with
  // a permanent account (sign-in is required before paying — a purchase with
  // no user_id has nothing to attach to), and that account id has loaded.
  // `free` is "permanent account, not Pro yet" — the state this button
  // exists for; a guest gets the account door instead, and a `pro` player
  // has no reason to see Pay at all.
  const checkoutUrl =
    checkoutBase && tier === "free" && account?.userId
      ? buildCheckoutUrl(checkoutBase, account.userId, account.email)
      : null;

  // Fired once per open, from the modal itself, so no call site can forget
  // it — the daily-limit surface used to be the only one tracking a "shown"
  // event, tagged separately at each call site.
  useEffect(() => {
    capturePostHogEvent("earlybird_modal_shown", { surface, feature, tier });
    // Only on mount/surface change, not on every tier refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, feature]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <p className="modal-body">{body}</p>

          {showAccountDoor && (
            <button
              type="button"
              className="primary modal-create-account"
              onClick={() => {
                capturePostHogEvent("earlybird_create_account_click", { surface, feature });
                onCreateAccount?.();
              }}
            >
              Create a free account
            </button>
          )}

          {showAccountDoor && (
            <div className="modal-divider">
              <span>or go further</span>
            </div>
          )}

          <ul className="modal-features">
            {PRO_FEATURES.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>

          {checkoutUrl ? (
            <a
              className="primary modal-pay"
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                capturePostHogEvent("earlybird_pay_click", { surface, feature });
                capturePostHogEvent("earlybird_checkout_opened", { surface, feature });
              }}
            >
              Pay {PRO_PRICE} — get EarlyBird access
            </a>
          ) : (
            <button
              type="button"
              className="primary modal-pay"
              onClick={() => {
                void (async () => {
                  capturePostHogEvent("earlybird_pay_click", { surface, feature });
                  // A signed-in player whose account id hadn't loaded when the
                  // page rendered can still go straight to checkout. A guest
                  // (or anyone we can't check out) detours through account
                  // creation, which picks the intent back up post-signup.
                  if (!isGuest && (await redirectToCheckoutForCurrentAccount())) return;
                  setPendingCheckout();
                  onCreateAccount?.("checkout");
                })();
              }}
            >
              Pay {PRO_PRICE} — get EarlyBird access
            </button>
          )}

          <div className="modal-divider">
            <span>or</span>
          </div>

          {notifyForm(inputId)}
          <p className="modal-notify-note">
            Not ready to pay? Join the list and get the EarlyBird price when it&rsquo;s ready.
          </p>
        </div>
      </div>
    </>
  );
}
