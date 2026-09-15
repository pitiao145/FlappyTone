/**
 * `GET /clip/:id?v=<updated_at>` — the gated, edge-cached clip read.
 *
 * Three things are load-bearing here:
 *
 * 1. **The ticket is the whole authorization.** `verifyTicket` checks the
 *    HS256 signature, the 30-minute expiry AND the caller's IP, so a forged,
 *    expired or lifted-and-replayed ticket yields no bytes. The pro gate is
 *    applied before R2 is touched at all.
 *
 * 2. **The `words` lookup is per-isolate, not per-request** (a 5-minute TTL).
 *    A refresh that fails leaves the route 503-ing rather than serving an
 *    empty inventory — an empty map would read as "every id is unknown",
 *    which is a 404 storm dressed up as normal operation.
 *
 * 3. **The shared edge cache stores `public`, the client gets `private`**
 *    (Decision 6). Cloudflare's Cache API refuses to store a `private`
 *    response, so the cached copy must be `public` — and it is safe to be,
 *    because the cache key carries only `id` and `v`, never anything about
 *    the caller, and the pro gate runs before the cache is consulted. The
 *    copy handed to the browser is rewritten to `private` so no intermediary
 *    holds a per-player response.
 */
import { serviceDb } from "../db.ts";
import { verifyTicket } from "../tickets.ts";
import { callerIp } from "./token.ts";
import type { Env } from "../index.ts";

/** Validate, never sanitise: a bad id is rejected, not stripped into a good one. */
const ID_RE = /^[a-z0-9]{1,32}$/;

const WORDS_TTL_MS = 5 * 60 * 1000;

interface WordRow {
  clipKey: string | null;
  minTier: string;
}

let wordCache: { at: number; words: Map<string, WordRow> } | null = null;
/** Concurrent misses in one isolate share a single query rather than racing. */
let inFlight: Promise<Map<string, WordRow>> | null = null;

export function __resetWordCacheForTests(): void {
  wordCache = null;
  inFlight = null;
}

async function loadWords(env: Env): Promise<Map<string, WordRow>> {
  const { data, error } = await serviceDb(env)
    .from("words")
    .select("id,clip_key,min_tier")
    .eq("status", "published");
  if (error || !data) throw new Error("words query failed");
  const map = new Map<string, WordRow>();
  for (const row of data) map.set(row.id, { clipKey: row.clip_key, minTier: row.min_tier });
  return map;
}

async function words(env: Env, now: number): Promise<Map<string, WordRow>> {
  if (wordCache && now - wordCache.at < WORDS_TTL_MS) return wordCache.words;
  if (!inFlight) {
    inFlight = loadWords(env)
      .then((map) => {
        wordCache = { at: Date.now(), words: map };
        return map;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

const CACHE_HOST = "https://clips.flappytone.com";

function privateCopy(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("cache-control", "private, max-age=604800, immutable");
  return new Response(res.body, { status: res.status, headers });
}

export async function handleClip(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.slice("/clip/".length));

  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  const ticket = match ? await verifyTicket(match[1], env.CLIP_TOKEN_SECRET, callerIp(req)) : null;
  if (!ticket) return Response.json({ error: "Missing or invalid token." }, { status: 401 });

  if (!ID_RE.test(id)) return Response.json({ error: "Bad clip id." }, { status: 400 });

  let inventory: Map<string, WordRow>;
  try {
    inventory = await words(env, Date.now());
  } catch {
    return Response.json({ error: "Clips are temporarily unavailable." }, { status: 503 });
  }

  const word = inventory.get(id);
  if (!word || !word.clipKey) return Response.json({ error: "Not found." }, { status: 404 });
  if (word.minTier === "pro" && ticket.tier !== "pro") {
    return Response.json({ error: "This clip needs Pro." }, { status: 403 });
  }

  const v = url.searchParams.get("v") ?? "";
  const cacheKey = new Request(`${CACHE_HOST}/clip/${id}?v=${encodeURIComponent(v)}`);
  const cache = (caches as unknown as { default: Cache }).default;

  const hit = await cache.match(cacheKey);
  if (hit) return privateCopy(hit);

  const obj = await env.CLIPS.get(word.clipKey);
  if (!obj) return Response.json({ error: "Not found." }, { status: 404 });

  const shared = new Response(obj.body, {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "public, max-age=604800, immutable",
      etag: obj.httpEtag,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, shared.clone()));
  return privateCopy(shared);
}
