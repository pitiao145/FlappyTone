/**
 * A one-shot flag: "this player went to make an account from the board CTA —
 * post this run's score once the account exists."
 *
 * Mirrors `checkoutIntent.ts` exactly. `/app` has no guests since brief 24,
 * so today it is set only in the short window before the tier has loaded
 * (`GameOver`'s `acceptUpgrade`). A TTL guards against a stale flag firing
 * on some unrelated signup days later.
 *
 * Brief 34: the flag keeps the account that set it (`null` when set while
 * signed out). Only that account, or the first account after a signed-out
 * flag, may consume it; a switch to another account clears it
 * (`accountScope.ts`). Same contract as the rest of `src/data/`: never throws.
 */
const KEY = "toneflap.joinIntent.v1";
const TTL_MS = 15 * 60 * 1000;

export function setPendingJoin(score: number, owner: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ score, ts: Date.now(), owner }));
  } catch {
    // ignore — worst case the post-signup join just doesn't fire
  }
}

/** Reads and removes the flag. Returns the score only for `owner`'s own flag or a signed-out one. */
export function consumePendingJoin(owner: string | null): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { score?: unknown; ts?: unknown; owner?: unknown };
    if (typeof parsed.score !== "number" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts >= TTL_MS) return null;
    // A flag from before brief 34 has no owner: it was set signed out.
    const setter = typeof parsed.owner === "string" ? parsed.owner : null;
    if (setter !== null && setter !== owner) return null;
    return parsed.score;
  } catch {
    return null;
  }
}

export function clearPendingJoin(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
