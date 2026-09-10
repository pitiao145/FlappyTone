/**
 * The guest signup gate: a focused "create an account" screen the guest lands
 * on directly (no intermediate modal) when an action needs an account first —
 * either buying EarlyBird (`reason="checkout"`) or joining the leaderboard
 * (`reason="join"`). Nothing here does the follow-up itself: `AccountCard`
 * redirects to checkout on the pending-checkout flag, and `GameApp` posts the
 * board score on the pending-join flag, both after a successful signup.
 */
import { useEffect } from "react";
import { consumePendingCheckout } from "../data/checkoutIntent.ts";
import { consumePendingJoin } from "../data/joinIntent.ts";
import { AccountCard } from "./AccountCard.tsx";

interface Props {
  onBack: () => void;
  reason?: "checkout" | "join";
}

const COPY = {
  checkout: {
    title: "Create an account first",
    note: "You’ll go straight to checkout once your account is ready.",
  },
  join: {
    title: "Create an account to join",
    note: "Your score posts to the weekly leaderboard once you’re signed up.",
  },
} as const;

export function CheckoutSignup({ onBack, reason = "checkout" }: Props) {
  // Tie the pending intents' lifetime to this screen: on a successful signup
  // the follow-up (checkout redirect / board post) already fired, so this
  // cleanup only runs when the player leaves without finishing — clearing the
  // flags so a stray one can't fire on an unrelated later signup.
  useEffect(
    () => () => {
      void consumePendingCheckout();
      void consumePendingJoin();
    },
    [],
  );

  const copy = COPY[reason];

  return (
    <div className="screen checkout-signup-screen">
      <h2>{copy.title}</h2>
      <p className="note">{copy.note}</p>
      <AccountCard hideGuestHeader />
      <button type="button" className="link" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}
