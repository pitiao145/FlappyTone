/**
 * CORS allowlist, including one wildcard shape: `https://*.vercel.app`,
 * for preview deploys whose subdomain is not known ahead of time.
 *
 * The wildcard is matched structurally against a parsed hostname, never by
 * substring/regex-on-the-raw-origin — a naive `origin.endsWith(".vercel.app")`
 * or `origin.includes(".vercel.app")` check is exploitable by
 * `https://evil.com/?x=.vercel.app` (a path/query can contain anything) or by
 * `https://notvercel.app` (a bare suffix match with no dot boundary). Parsing
 * with `URL` and comparing `hostname` against the wildcard's suffix closes
 * both: only an actual `*.vercel.app` hostname, one label deep or more, can
 * match.
 */

/**
 * True if `hostname` is a (one-or-more-label) dot-subdomain of `suffix`.
 * `*.vercel.app` requires an actual subdomain label — the bare
 * `vercel.app` itself does not match, matching the wildcard's own syntax.
 */
function hostnameMatchesWildcardSuffix(hostname: string, suffix: string): boolean {
  return hostname.endsWith(`.${suffix}`) && hostname.length > suffix.length + 1;
}

function parseOriginHostname(origin: string): string | null {
  try {
    // A malformed/relative "origin" (never legal in a real Origin header,
    // but this function must not throw on attacker input) parses to null.
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return null;
  }
}

/**
 * `allowed` is a comma-separated list of exact origins
 * (`https://flappytone.com`) and/or wildcard host patterns
 * (`https://*.vercel.app`, exactly one leading `*.` label).
 */
export function isAllowedOrigin(origin: string | null, allowed: string): boolean {
  if (!origin) return false;

  const entries = allowed
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (!entry.includes("*")) {
      // Exact match only — scheme and host both matter (an `http://` origin
      // must not match an `https://` allowlist entry).
      if (origin === entry) return true;
      continue;
    }

    // Wildcard entry: must be of the form "<scheme>://*.<suffix>".
    const match = /^([a-z][a-z0-9+.-]*):\/\/\*\.(.+)$/i.exec(entry);
    if (!match) continue;
    const [, scheme, suffix] = match;

    const originHostname = parseOriginHostname(origin);
    if (!originHostname) continue;

    let originScheme: string;
    try {
      originScheme = new URL(origin).protocol.replace(/:$/, "");
    } catch {
      continue;
    }
    if (originScheme.toLowerCase() !== scheme.toLowerCase()) continue;

    if (hostnameMatchesWildcardSuffix(originHostname, suffix)) return true;
  }

  return false;
}

/**
 * `{}` (no CORS headers at all) when the origin is not allowed — the
 * response still goes out (some callers, e.g. same-origin server-to-server,
 * have no Origin header at all), it just isn't marked cross-origin-readable.
 */
export function corsHeaders(origin: string | null, allowed: string): HeadersInit {
  if (!isAllowedOrigin(origin, allowed)) return {};
  return {
    "access-control-allow-origin": origin as string,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-record-passcode",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}
