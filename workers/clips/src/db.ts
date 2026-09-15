/**
 * The one place this Worker talks to Postgres: a service-role PostgREST
 * client, same posture as `api/score.ts`/`api/run.ts` — holds the key that
 * bypasses RLS, so every query built on top of it (Tasks 6/10) must apply
 * its own row-scoping by hand rather than relying on policies.
 *
 * `Database` is the app's own generated schema (`src/data/database.types.ts`,
 * regenerated via the Supabase MCP after each migration) — reused rather
 * than duplicated, so the worker and the app can't drift onto two different
 * ideas of the schema.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/data/database.types.ts";
import type { Env } from "./index.ts";

let cached: { url: string; client: SupabaseClient<Database> } | null = null;

export function serviceDb(env: Env): SupabaseClient<Database> {
  if (cached && cached.url === env.SUPABASE_URL) return cached.client;
  const client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { url: env.SUPABASE_URL, client };
  return client;
}
