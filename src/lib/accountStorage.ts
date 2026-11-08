/**
 * Per-account browser storage (brief 34, follow-up).
 *
 * Everything the game saves in the browser belongs to the account that is
 * signed in, except the mic calibration, which belongs to the device (see
 * `src/game/settings.ts`). This module is the one mechanism for that: a key
 * saved through `accountStorage` is stored as `<key>@<userId>`, so two
 * accounts on one browser never see each other's values, and an account that
 * comes back finds its own values again.
 *
 * The account is the one `src/data/accountScope.ts` noted on this page, or
 * else the one this browser held last (`toneflap.account.v1`), so a page that
 * has not read the session yet (a site page, the first frame of `/app`) still
 * reads the right account. With no account at all the plain key is used.
 *
 * A leaf: no imports, so site pages can use it without pulling in Supabase.
 * Same API and same failure mode as `localStorage` (a blocked storage
 * throws), so a caller swaps `localStorage` for `accountStorage` and keeps
 * its own try/catch.
 */

export const ACCOUNT_KEY = "toneflap.account.v1";

/** The account noted on this page; `undefined` until the first note. */
let current: string | null | undefined;

function loadSaved(): string | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  } catch {
    return null;
  }
}

/** The account this browser holds, or `null` when none is known. Never throws. */
export function currentAccountId(): string | null {
  return current !== undefined ? current : loadSaved();
}

/** Records the account on this page and saves it for the next load. Never throws. */
export function setCurrentAccount(id: string | null): void {
  current = id || null;
  try {
    if (current) localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: current }));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Blocked storage: the in-memory account still scopes this page.
  }
}

/** The storage key for `base` under one account (default: the current one). */
export function accountKey(base: string, id: string | null = currentAccountId()): string {
  return id ? `${base}@${id}` : base;
}

export const accountStorage = {
  getItem(base: string): string | null {
    return localStorage.getItem(accountKey(base));
  },
  setItem(base: string, value: string): void {
    localStorage.setItem(accountKey(base), value);
  },
  removeItem(base: string): void {
    localStorage.removeItem(accountKey(base));
  },
};

/** Test seam: forget the account noted on this page. */
export function resetAccountStorageForTests(): void {
  current = undefined;
}
