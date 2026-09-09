/**
 * A one-shot flag: "this guest clicked Pay, then went to create an account —
 * send them to checkout the moment the account exists."
 *
 * `EarlyBirdModal`'s guest Pay button can't check out directly (no account,
 * no `user_id` to attach the purchase to), so it detours through account
 * creation first. Without this flag that detour is a dead end — the player
 * lands back on Profile with no idea Pay ever did anything. A TTL guards
 * against a stale flag firing on some unrelated signup days later (the tab
 * left open, a different door used in between). Same contract as the rest
 * of `src/data/`: never throws.
 */
const KEY = "toneflap.checkoutIntent.v1";
const TTL_MS = 15 * 60 * 1000;

export function setPendingCheckout(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore — worst case the post-signup redirect just doesn't fire
  }
}

export function consumePendingCheckout(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < TTL_MS;
  } catch {
    return false;
  }
}
