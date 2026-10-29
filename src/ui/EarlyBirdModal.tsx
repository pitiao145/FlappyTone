import { useEffect, useId, useState } from "react";
import { track } from "../analytics/client.ts";
import { getAccount } from "../data/account.ts";
import { buildCheckoutUrl, redirectToCheckoutForCurrentAccount } from "../data/checkout.ts";
import { setPendingCheckout } from "../data/checkoutIntent.ts";
import { useTier } from "../data/tier.ts";
import { tierLimits } from "../game/tiers.ts";
import { brand } from "../brand.ts";
import { PRO_HIGHLIGHTS, PRO_PRICE } from "./plan.ts";

export type EarlyBirdSurface = "progress" | "profile" | "daily-limit" | "visualiser" | "leaderboard" | "toneder";

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
const COPY: Record<EarlyBirdSurface, { title: string; body: string; guestBody?: string }> = {
  progress: {
    title: "See every run, not just the last five",
    body: "Pro keeps your full history and trends, so you can watch each tone improve.",
  },
  profile: {
    title: "Go further with Pro",
    body: "Every word, every tone pair, no daily limit. One payment, yours for good.",
  },
  "daily-limit": {
    title: "You've flown all your free runs today",
    body: "Come back tomorrow, or go Pro and keep flying right now.",
    guestBody: `Come back tomorrow, or create a free account for ${tierLimits().free.runsPerDay} runs a day instead of ${tierLimits().guest.runsPerDay}.`,
  },
  leaderboard: {
    title: "Fly under your own name",
    body: "Pro puts you on the leaderboard under a name you choose.",
  },
  toneder: {
    title: "Swipe without a limit",
    body: "Pro takes away TONEder's daily limit, along with everything below.",
  },
  visualiser: {
    title: "Practise every word, every tone",
    body: "Pro opens the full word list in the visualiser, for every tone.",
  },
};

/**
 * The EarlyBird signup modal — every locked "Soon" section across Progress
 * and Profile opens this same component, and so does hitting the daily
 * runs cap (`dailyLimitReached` in GameApp.tsx). A guest also sees a second
 * door here: creating a free account, a smaller step than paying. Pay is a
 * live Lemon Squeezy checkout for a signed-in free account; a guest's Pay
 * routes through the create-account-first screen and on to checkout. Its
 * offer (launch tag, price, value line, highlights) is the landing page's Pro
 * card word for word (`brand.pricing.pro`, `PRO_HIGHLIGHTS`).
 */
export function EarlyBirdModal({ surface, feature, onClose, onCreateAccount }: Props) {
  const inputId = useId();
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
    track({ type: "earlybird_modal_shown", surface, feature, tier });
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

  return (
    // A fragment, not a single backdrop: the Pay prompt below is a second,
    // independent full-screen overlay, not a child of this one — nesting it
    // inside this backdrop would let a click on *its* background bubble up
    // and fire this backdrop's own onClose too, closing both layers at once
    // on a click meant for only the top one.
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal-card upsell-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-title`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>

          <span className="upsell-launch">{brand.pricing.pro.launch}</span>
          <h2 id={`${inputId}-title`}>{copy.title}</h2>
          <p className="modal-body">{body}</p>

          {showAccountDoor && (
            <>
              <button
                type="button"
                className="primary modal-create-account"
                onClick={() => {
                  track({ type: "earlybird_create_account_click", surface, feature });
                  onCreateAccount?.();
                }}
              >
                Create a free account
              </button>
              <div className="modal-divider">
                <span>or go further</span>
              </div>
            </>
          )}

          <div className="upsell-offer">
            <p className="upsell-price">
              <span className="upsell-amount">{PRO_PRICE}</span>
              <span className="upsell-price-note">one-time, no subscription</span>
            </p>
            <p className="upsell-value">{brand.pricing.pro.value}</p>
            <ul className="upsell-features">
              {PRO_HIGHLIGHTS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>

          {checkoutUrl ? (
            <a
              className="primary modal-pay"
              href={checkoutUrl}
              onClick={(e) => {
                // Same-tab, deliberately: Lemon Squeezy's own redirect back to
                // `?purchased=1` (see purchaseReturn.ts) only reaches whoever
                // it sends the browser to. A `target="_blank"` here used to
                // strand the confirmation in a tab the player would close,
                // leaving this tab still reading "free" and asking to pay
                // again even though the webhook had already granted access.
                e.preventDefault();
                track({ type: "earlybird_pay_click", surface, feature });
                track({ type: "earlybird_checkout_opened", surface, feature });
                window.location.assign(checkoutUrl);
              }}
            >
              {brand.pricing.pro.cta}, {PRO_PRICE} one-time
            </a>
          ) : (
            <button
              type="button"
              className="primary modal-pay"
              onClick={() => {
                void (async () => {
                  track({ type: "earlybird_pay_click", surface, feature });
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
              {brand.pricing.pro.cta}, {PRO_PRICE} one-time
            </button>
          )}

          <figure className="upsell-quote">
            <blockquote>{brand.pricing.quote}</blockquote>
            <figcaption>{brand.pricing.quoteAttribution}</figcaption>
          </figure>
        </div>
      </div>
    </>
  );
}
