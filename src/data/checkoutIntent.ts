/**
 * A one-shot flag: "this player clicked Pay, then went to make an account —
 * send them to checkout the moment the account exists."
 *
 * `EarlyBirdModal`'s Pay button can't check out without an account (no
 * `user_id` to attach the purchase to), so it detours through account
 * creation first. `/app` has no guests since brief 24, so today that detour
 * happens only when the modal renders before the tier has loaded. A TTL
 * guards against a stale flag firing on some unrelated signup later.
 *
 * Brief 34: the flag keeps the account that set it (`null` when set while
 * signed out). Only that account, or the first account after a signed-out
 * flag, may consume it; a switch to another account clears it
 * (`accountScope.ts`). Same contract as the rest of `src/data/`: never throws.
 */
const KEY = "toneflap.checkoutIntent.v1";
const TTL_MS = 15 * 60 * 1000;

export function setPendingCheckout(owner: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), owner }));
  } catch {
    // ignore — worst case the post-signup redirect just doesn't fire
  }
}

/** Reads and removes the flag. True only for `owner`'s own flag or a signed-out one. */
export function consumePendingCheckout(owner: string | null): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    // Before brief 34 the flag was a bare timestamp, set signed out.
    const ts = typeof parsed === "number" ? parsed : (parsed as { ts?: unknown })?.ts;
    const setter =
      typeof parsed === "object" && parsed !== null && typeof (parsed as { owner?: unknown }).owner === "string"
        ? (parsed as { owner: string }).owner
        : null;
    if (typeof ts !== "number" || !Number.isFinite(ts) || Date.now() - ts >= TTL_MS) return false;
    return setter === null || setter === owner;
  } catch {
    return false;
  }
}

export function clearPendingCheckout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
