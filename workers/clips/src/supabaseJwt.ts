/**
 * Verifies a Supabase session JWT against the project's own JWKS.
 *
 * The Supabase project signs with an asymmetric ES256 key (not the legacy
 * HS256-shared-secret scheme) — there is deliberately no
 * `SUPABASE_JWT_SECRET` anywhere in this codebase. Verifying against the
 * public JWKS means this Worker never holds a signing secret for player
 * sessions at all, only the service-role key it uses to *act* as itself
 * against PostgREST (see `db.ts`).
 *
 * `createRemoteJWKSet` does its own fetch caching internally, but it's keyed
 * to the `URL` instance passed in — caching the whole remote set per
 * Supabase URL at module scope means a warm isolate reuses it across
 * requests instead of re-fetching the JWKS document every call.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(supabaseUrl: string) {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

export async function verifySupabaseJwt(
  jwt: string,
  supabaseUrl: string,
): Promise<{ sub: string; isAnonymous: boolean } | null> {
  try {
    const jwks = jwksFor(supabaseUrl);
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer: `${supabaseUrl}/auth/v1`,
    });
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub, isAnonymous: payload.is_anonymous === true };
  } catch {
    return null;
  }
}
