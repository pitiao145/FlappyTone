/**
 * A tick counter for "the signed-in session's local data may have changed."
 *
 * `useTier()` (`tier.ts`) already re-resolves on every Supabase auth event,
 * but a lot of on-screen data isn't the tier — it's plain localStorage read
 * once at mount (daily run count, the cached board name, run history,
 * streak) and never revisited. Those reads need to happen again both when an
 * auth event fires *and*, separately, once `syncAccount()`/`signOut()`
 * finish rewriting that localStorage — the two are not the same moment.
 * `bumpSessionVersion()` is called at both points; a component reading local
 * data subscribes with `useSessionVersion()` and adds the version to its
 * `useMemo` deps.
 */
import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

export function bumpSessionVersion(): void {
  version++;
  for (const listener of listeners) listener();
}

export function subscribeSessionVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionVersion(): number {
  return version;
}

export function useSessionVersion(): number {
  return useSyncExternalStore(subscribeSessionVersion, getSessionVersion);
}
