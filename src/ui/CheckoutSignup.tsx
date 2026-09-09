/**
 * The guest→checkout signup gate: opened from the EarlyBird modal's Pay
 * button when the player has no account yet. Nothing here talks to Lemon
 * Squeezy directly — `AccountCard.tsx` already redirects to checkout on a
 * successful signup via `src/data/checkoutIntent.ts`'s pending-checkout flag.
 */
import { useEffect } from "react";
import { consumePendingCheckout } from "../data/checkoutIntent.ts";
import { AccountCard } from "./AccountCard.tsx";

interface Props {
  onBack: () => void;
}

export function CheckoutSignup({ onBack }: Props) {
  // Tie the pending-checkout intent's lifetime to this screen: on a successful
  // signup AccountCard already consumed it and navigated away, so this cleanup
  // only fires when the player leaves without checking out — clearing the flag
  // so it can't bounce an unrelated later signup straight into checkout.
  useEffect(() => () => void consumePendingCheckout(), []);

  return (
    <div className="screen checkout-signup-screen">
      <h2>Create an account first</h2>
      <p className="note">You&rsquo;ll go straight to checkout once your account is ready.</p>
      <AccountCard hideGuestHeader />
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}
