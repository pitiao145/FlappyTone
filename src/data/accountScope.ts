/**
 * Which account this browser holds now (brief 34).
 *
 * Some browser-side values belong to one account: the board name, the daily
 * run counts, the run-history and streak cache, the pending intents. Each of
 * them carries its owner's user id, and reads this module to know who the
 * owner should be. A second account on a used browser therefore starts fresh,
 * and the first account gets its own values back when it returns.
 *
 * `noteAccount()` runs on every account resolve (AuthGate's check, GameApp's
 * mount, `syncAccount()`, `signOut()`). When the account differs from the one
 * saved last, it runs the account-change steps once, then saves the new id.
 * Device settings (`toneflap.settings*`, calibration, theme) are not here:
 * they stay with the device.
 *
 * Only a permanent account counts. A signed-out or anonymous visitor is
 * `null`: `/app` has no guests since brief 24, and an anonymous session
 * keeps its id when it upgrades in place, so nothing is lost by it.
 *
 * Same contract as the rest of `src/data/`: nothing throws. A storage
 * failure means "fresh values", never a broken screen or a blocked run.
 */
import { clearRunHistory, loadRunHistory } from "../game/runHistory.ts";
import { clearStreak } from "../game/streak.ts";
import { clearPendingCheckout } from "./checkoutIntent.ts";
import { clearPendingJoin } from "./joinIntent.ts";

const KEY = "toneflap.account.v1";

/** Keys from before brief 34 that held per-account values with no owner. */
const LEGACY_KEYS = ["toneflap.daily.v1", "toneflap.daily.server.v1"];

/** The account noted on this page; `undefined` until the first note. */
let current: string | null | undefined;

function loadSaved(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  } catch {
    return null;
  }
}

function save(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify({ id }));
    else localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: the owner checks on each value still keep accounts apart.
  }
}

/**
 * The account this browser holds: the one noted on this page, or else the
 * one saved last (the best guess before the session is read). `null` when
 * no account is known.
 */
export function currentAccountId(): string | null {
  return current !== undefined ? current : loadSaved();
}

/** What `noteAccount` found, for callers and tests. */
export type AccountChange = "same" | "switch" | "first" | "signed-out";

/**
 * Records the account the session resolved to (`null` for signed out or
 * anonymous). On a change of account it runs the account-change steps once:
 *
 * - account A -> account B: clear the run-history and streak cache and the
 *   pending intents. Names and daily counts carry their owner, so they need
 *   no clearing, and A gets its own back on return.
 * - no account -> account B: clear the history and streak cache only if it
 *   belongs to another account (a signed-out state left it there). An
 *   unowned store is guest progress and stays for `adoptGuestProgress`.
 * - account A -> no account: nothing to clear here (`signOut()` clears the
 *   cache itself).
 *
 * The first resolve after the brief-34 deploy also drops the old ownerless
 * daily-count keys: their owner is unknown, and the server count comes back
 * on the next refresh.
 */
export function noteAccount(userId: string | null): AccountChange {
  try {
    const next = userId || null;
    current = next;
    dropLegacyKeys();
    const prev = loadSaved();
    if (prev === next) return "same";
    let change: AccountChange;
    if (next === null) {
      change = "signed-out";
    } else if (prev !== null) {
      change = "switch";
      clearRunHistory();
      clearStreak();
      clearPendingJoin();
      clearPendingCheckout();
    } else {
      change = "first";
      const owner = loadRunHistory().owner;
      if (owner && owner !== next) {
        clearRunHistory();
        clearStreak();
      }
    }
    save(next);
    return change;
  } catch {
    return "same";
  }
}

function dropLegacyKeys(): void {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/** Test seam: forget the account noted on this page. */
export function resetAccountScopeForTests(): void {
  current = undefined;
}
