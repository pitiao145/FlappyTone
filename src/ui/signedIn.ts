import { useSyncExternalStore } from "react";

/**
 * Whether this browser holds a signed-in (not anonymous) player's session,
 * read from the token supabase-js keeps in localStorage
 * (`sb-<project>-auth-token`, same origin as /app). No Supabase import, no
 * network: site pages use it to swap the nav's "Try it free" for "Play".
 *
 * A guess, not auth: an expired session still reads as signed in, and /app
 * shows its auth screen then. Never throws (private mode, bad JSON).
 */
export function hasSignedInSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const user = (JSON.parse(raw) as { user?: { is_anonymous?: boolean } | null }).user;
      if (user && !user.is_anonymous) return true;
    }
  } catch {
    // No storage: treat as a new visitor.
  }
  return false;
}

const noSubscribe = () => () => {};

/** False in the prerender and the first (hydrating) render, then the real value. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(noSubscribe, hasSignedInSession, () => false);
}
