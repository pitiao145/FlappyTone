/**
 * A one-shot flag: "this guest declined to join the board and went to create
 * an account instead — post this run's score once the account exists."
 *
 * Mirrors `checkoutIntent.ts` exactly. Without this, a guest who signs up
 * from the board CTA lands back in the game with nothing posted — the whole
 * reason they tapped through in the first place. A TTL guards against a
 * stale flag firing on some unrelated signup days later. Same contract as
 * the rest of `src/data/`: never throws.
 */
const KEY = "toneflap.joinIntent.v1";
const TTL_MS = 15 * 60 * 1000;

export function setPendingJoin(score: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ score, ts: Date.now() }));
  } catch {
    // ignore — worst case the post-signup join just doesn't fire
  }
}

export function consumePendingJoin(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { score?: unknown; ts?: unknown };
    if (typeof parsed.score !== "number" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts >= TTL_MS) return null;
    return parsed.score;
  } catch {
    return null;
  }
}
