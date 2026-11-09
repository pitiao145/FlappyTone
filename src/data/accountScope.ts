/**
 * Which account this browser holds now (brief 34).
 *
 * Every value the game saves in the browser is per account
 * (`src/lib/accountStorage.ts`): a second account on a used browser starts
 * fresh, and the first account finds its own values when it returns. Only the
 * mic calibration stays per device.
 *
 * `noteAccount()` runs on every account resolve: AuthGate's check (before
 * GameApp mounts), GameApp's mount, `syncAccount()`, `signOut()`. Only a
 * permanent account counts; signed out or anonymous is `null`.
 *
 * The first account noted after this change also takes over the values the
 * browser saved before keys were per account (`migrateLegacy`), so an
 * existing player keeps their settings. Values that name another owner, or
 * that cannot be tied to one, are dropped instead.
 *
 * Same contract as the rest of `src/data/`: nothing throws.
 */
import { accountKey, setCurrentAccount } from "../lib/accountStorage.ts";

export { currentAccountId } from "../lib/accountStorage.ts";

/** Set once the legacy (unscoped) values have been handed to an account. */
const MIGRATED_KEY = "toneflap.scoped.v1";

/** Unscoped keys moved, as they are, to the first account. */
const MOVE_KEYS = [
  "toneflap.width.v1",
  "toneflap.translation.v1",
  "toneflap.pinyin.v1",
  "toneflap.tonemarks.v1",
  "toneflap.demo.v1",
  "toneflap.wordmix.v1",
  "toneflap.motion.v1",
  "toneflap.sharedata.v1",
  "toneflap.proficiency.v1",
  "toneflap.lastlevel.v1",
  "toneflap.speechstyle.v1",
  "toneflap.theme.v1",
  "toneflap.runFeedback.v1",
  "toneflap.shareName.v1",
  "flappytone.toneder.swipes.v1",
  "flappytone.tonetest.last.v1",
  "flappytone.dismissedUpdates",
];

/**
 * Moved keys that also stay as they are: the "Usage analytics" switch is
 * also this browser's signed-out value (brief 35), so an opt-out made before
 * keys were per account still holds after a sign-out.
 */
const KEEP_PLAIN = new Set(["toneflap.sharedata.v1"]);

/** Unscoped keys whose owner cannot be known: dropped. The server restores
 * the name and the daily count on the next sync. */
const DROP_KEYS = [
  "toneflap.identity.v1",
  "toneflap.daily.v1",
  "toneflap.daily.server.v1",
  "toneflap.joinIntent.v1",
  "toneflap.checkoutIntent.v1",
  "toneflap.adopt.v1",
];

const HISTORY_KEY = "toneflap.history.v1";
const STREAK_KEY = "toneflap.streak.v1";

/** Records the account the session resolved to (`null`: signed out or anonymous). */
export function noteAccount(userId: string | null): void {
  try {
    setCurrentAccount(userId);
    if (userId) migrateLegacy(userId);
  } catch {
    // Never throws: the account is already set in memory.
  }
}

function migrateLegacy(userId: string): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    for (const base of MOVE_KEYS) {
      const value = localStorage.getItem(base);
      if (value === null) continue;
      const target = accountKey(base, userId);
      if (localStorage.getItem(target) === null) localStorage.setItem(target, value);
      if (!KEEP_PLAIN.has(base)) localStorage.removeItem(base);
    }
    // The run-history cache names its owner; the streak cache goes with it.
    const history = localStorage.getItem(HISTORY_KEY);
    const streak = localStorage.getItem(STREAK_KEY);
    let owner: unknown = null;
    try {
      owner = history ? (JSON.parse(history) as { owner?: unknown }).owner : null;
    } catch {
      owner = null;
    }
    if (owner === userId) {
      if (history) localStorage.setItem(accountKey(HISTORY_KEY, userId), history);
      if (streak) localStorage.setItem(accountKey(STREAK_KEY, userId), streak);
    }
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(STREAK_KEY);
    for (const base of DROP_KEYS) localStorage.removeItem(base);
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Blocked storage: nothing to migrate, every account starts fresh.
  }
}
