/**
 * The "Usage analytics" switch follows the account (brief 35).
 *
 * The account's value (`profiles.usage_analytics`) is the truth; the browser
 * keeps a copy (`toneflap.sharedata.v1`, per account) so a page can decide
 * before any request, and an outbox (`OWED_KEY`) for a change the account
 * has not saved yet. `syncUsageAnalytics()` runs from `syncAccount()`: on
 * login and on every GameApp mount.
 *
 * The rule (`decideUsageAnalytics`):
 * 1. A choice this browser still owes the account wins if it is off, and is
 *    written. A browser "off" from before this change (never synced) counts
 *    as an owed off, so every old opt-out reaches the account.
 * 2. An owed "on" is kept only if the account is not off: stricter wins.
 * 3. Otherwise the account's value applies. That is how turning analytics on
 *    or off on one device reaches the others.
 *
 * Until the account's value is known on `/app`, `posthog.ts` holds events in
 * memory and sends none (`initAnalytics`'s `waitForAccount`).
 *
 * Same contract as the rest of `src/data/`: nothing throws.
 */
import { setSharingEnabled } from "../analytics/client.ts";
import { loadShareData, saveShareData, SHARE_DATA_KEY } from "../game/settings.ts";
import { accountStorage } from "../lib/accountStorage.ts";
import { getSupabase, warn } from "./supabase.ts";

/** A switch value this browser still owes the account ("on"/"off"). */
export const OWED_KEY = "toneflap.sharedata.owed.v1";
/** Set once this browser has read the account's value. */
const SYNCED_KEY = "toneflap.sharedata.synced.v1";

type Switch = "on" | "off";

export interface UsageInputs {
  /** This browser's saved value for the account, `null` if never saved. */
  browser: Switch | null;
  /** A change not yet written to the account. */
  owed: Switch | null;
  /** This browser has read the account's value before. */
  synced: boolean;
  /** The account's value (`true` when the row has none yet: the default). */
  account: boolean;
}

export interface UsageDecision {
  on: boolean;
  /** The value to write to the account, or `null` when it is already right. */
  write: boolean | null;
}

/** The rule above. Pure, for tests. */
export function decideUsageAnalytics(i: UsageInputs): UsageDecision {
  const owed = i.owed ?? (i.browser === "off" && !i.synced ? "off" : null);
  if (owed === "off") return { on: false, write: i.account ? false : null };
  // An owed "on" and no owed choice end the same way: the account decides,
  // so an account that says off wins over an unsaved "on".
  return { on: i.account, write: null };
}

function readSwitch(key: string): Switch | null {
  try {
    const v = accountStorage.getItem(key);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

function setOwed(v: Switch | null): void {
  try {
    if (v) accountStorage.setItem(OWED_KEY, v);
    else accountStorage.removeItem(OWED_KEY);
  } catch {
    // Blocked storage: nothing to retry from.
  }
}

/** Writes the switch to the account. `true` when the row was updated. */
async function writeAccount(userId: string, on: boolean): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ usage_analytics: on, usage_analytics_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");
    if (error) {
      warn("usage", `could not save the analytics switch: ${error.message}`);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    warn("usage", "could not save the analytics switch", err);
    return false;
  }
}

/**
 * Reads the account's value, applies the rule, saves the result in this
 * browser and turns analytics on or off. When the account cannot be read the
 * switch stays as it is (off, or held on `/app`) and the next sync tries
 * again. Never throws.
 */
export async function syncUsageAnalytics(userId: string): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    // Clients cannot select the consent columns (migration 0034): the
    // owner reads their own value through a security-definer function.
    const { data, error } = await supabase.rpc("my_usage_analytics");
    if (error) {
      warn("usage", `could not read the analytics switch: ${error.message}`);
      if (!loadShareData()) setSharingEnabled(false);
      return;
    }
    const decision = decideUsageAnalytics({
      browser: readSwitch(SHARE_DATA_KEY),
      owed: readSwitch(OWED_KEY),
      synced: accountStorage.getItem(SYNCED_KEY) === "1",
      account: typeof data === "boolean" ? data : true,
    });
    saveShareData(decision.on);
    setSharingEnabled(decision.on);
    accountStorage.setItem(SYNCED_KEY, "1");
    if (decision.write === null) {
      setOwed(null);
      return;
    }
    setOwed(decision.write ? "on" : "off");
    if (await writeAccount(userId, decision.write)) setOwed(null);
  } catch (err) {
    warn("usage", "analytics switch sync failed", err);
  }
}

/**
 * The Settings toggle. Applies at once in this browser; the account write
 * runs after and never blocks it. A failed write stays owed and is retried
 * by the next `syncUsageAnalytics`, so an "off" is never lost. Never throws.
 */
export async function setUsageAnalytics(userId: string | null, on: boolean): Promise<void> {
  saveShareData(on);
  setSharingEnabled(on);
  if (!userId) return;
  setOwed(on ? "on" : "off");
  if (await writeAccount(userId, on)) setOwed(null);
}
