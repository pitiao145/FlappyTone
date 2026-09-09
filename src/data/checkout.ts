/**
 * The one place that turns "current signed-in account" into a Lemon Squeezy
 * checkout redirect. Both the EarlyBird modal and the post-signup redirect in
 * `AccountCard` go through here so the "store configured + permanent account +
 * user_id" rule lives once. Same `src/data/` contract: never throws.
 */
import { getAccount } from "./account.ts";

/**
 * `checkout[custom][user_id]` is the whole mechanism: it's how the Lemon
 * Squeezy webhook (see `api/`) knows which account to grant access to once the
 * payment clears. `checkout[email]` only prefills the field.
 */
export function buildCheckoutUrl(baseUrl: string, userId: string, email: string | null): string {
  const url = new URL(baseUrl);
  url.searchParams.set("checkout[custom][user_id]", userId);
  if (email) url.searchParams.set("checkout[email]", email);
  return url.toString();
}

/**
 * Redirect the current tab to checkout when the store is configured and the
 * signed-in account can attach a purchase. Returns false (redirecting nothing)
 * when either is missing, so callers can fall back to the create-account flow.
 */
export async function redirectToCheckoutForCurrentAccount(): Promise<boolean> {
  try {
    const base = import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL as string | undefined;
    if (!base) return false;
    const a = await getAccount();
    if (a.status !== "permanent" || !a.userId) return false;
    window.location.assign(buildCheckoutUrl(base, a.userId, a.email));
    return true;
  } catch {
    return false;
  }
}
