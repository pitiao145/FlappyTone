/**
 * A tiny pub-sub for "tell the shell to show an auth toast."
 *
 * `AccountCard` (mounted inside the Profile tab) is where sign-in/sign-out
 * happen; the toast itself renders fixed-position at the `GameApp` shell
 * level, same as the purchase-return banner. This is the whole channel
 * between the two — no queue, no library: at most one toast is showing at a
 * time, and a second `fireAuthToast` while one is up just replaces it.
 */
export type AuthToastKind = "signed-in" | "signed-out";

export const AUTH_TOAST_TEXT: Record<AuthToastKind, string> = {
  "signed-in": "Signed in.",
  "signed-out": "Signed out.",
};

type Listener = (kind: AuthToastKind) => void;

const listeners = new Set<Listener>();

export function fireAuthToast(kind: AuthToastKind): void {
  for (const listener of listeners) listener(kind);
}

export function subscribeAuthToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
