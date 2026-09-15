/**
 * A Supabase client authorised with the service-role key, for one-shot dev
 * scripts (seeding, migrations helpers) that need to write past RLS.
 *
 * Never import this from `src/` app code — the service-role key must only
 * ever live in a Node script's process env or a Vercel serverless function
 * (`api/score.ts`, `api/run.ts`, `api/webhook-ls.ts`), never in the browser
 * bundle. `persistSession: false` because there is no session to persist —
 * this client acts as itself, not as a signed-in user.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../data/database.types.ts";
import { envVar } from "./env.ts";

export function serviceClient(): SupabaseClient<Database> {
  const url = envVar("SUPABASE_URL");
  const serviceKey = envVar("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
}
