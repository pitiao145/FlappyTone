/**
 * Reads whether the current user has paid access. Same never-throw contract
 * as the rest of `src/data/` — no session or any failure just means "no
 * access", never an error the caller has to handle.
 *
 * `entitlements` is select-own with no client write policy: only the payment
 * webhook writes it, holding the service-role key. This read is the client's
 * whole relationship with the flag.
 */
import { currentSession, getSupabase, warn } from "./supabase.ts";

export async function fetchHasAccess(): Promise<boolean> {
  const supabase = getSupabase();
  const session = await currentSession();
  if (!supabase || !session) return false;
  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("has_access")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      warn("entitlements", `could not read entitlement: ${error.message}`);
      return false;
    }
    return Boolean(data?.has_access);
  } catch (err) {
    warn("entitlements", "could not read entitlement", err);
    return false;
  }
}
