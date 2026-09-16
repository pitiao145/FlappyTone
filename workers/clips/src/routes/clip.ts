/**
 * `GET /clip/:speaker/:id?v=<word_clips.updated_at>` — the gated,
 * edge-cached clip read. `GET /clip/:id` still resolves to the default
 * speaker, for exactly one release (an old, content-hashed bundle is still
 * live in some player's tab, and without it every cue it asks for 404s at
 * once); it is removed in the contract task.
 *
 * Four things are load-bearing here:
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
 *    because the cache key carries only `speaker`, `id` and `v`, never
 *    anything about the caller, and the pro gate runs before the cache is
 *    consulted. The copy handed to the browser is rewritten to `private` so
 *    no intermediary holds a per-player response.
 *
 * 4. **The speaker is in the cache key, and it is a path segment.** If it
 *    were dropped, one speaker's response would be served from a key another
 *    speaker also computes — the WRONG VOICE to every player at once, with
 *    no error anywhere. A path segment cannot be silently dropped by a
 *    refactor the way a query parameter can. The speaker is NOT in the play
 *    ticket: voice is not an entitlement, and `min_tier` (read from `words`,
 *    not `word_clips`) gates every voice identically.
 */
import { serviceDb } from "../db.ts";
import { verifyTicket } from "../tickets.ts";
import { callerIp } from "./token.ts";
import type { Env } from "../index.ts";

/** Validate, never sanitise: a bad id is rejected, not stripped into a good one. */
const ID_RE = /^[a-z0-9]{1,32}$/;

/** Same alphabet as the DB check constraint. Validate, never sanitise. */
const SPEAKER_RE = /^[a-z0-9]{1,16}$/;

const WORDS_TTL_MS = 5 * 60 * 1000;

interface WordRow {
  clipKey: string | null;
  minTier: string;
}

/**
 * Keyed "speaker:id", not id. A map keyed on id alone would resolve a male
 * request to whatever row happened to load last.
 */
interface Inventory {
  words: Map<string, WordRow>;
  defaultSpeaker: string;
}

let wordCache: { at: number; inventory: Inventory } | null = null;
/** Concurrent misses in one isolate share a single query rather than racing. */
let inFlight: Promise<Inventory> | null = null;

export function __resetWordCacheForTests(): void {
  wordCache = null;
  inFlight = null;
}

async function loadWords(env: Env): Promise<Inventory> {
  const db = serviceDb(env);
  const [clips, speakers] = await Promise.all([
    db
      .from("word_clips")
      .select("word_id,speaker_id,clip_key,words!inner(min_tier)")
      .eq("status", "published"),
    db.from("speakers").select("id,is_default"),
  ]);
  if (clips.error || !clips.data || speakers.error || !speakers.data) {
    throw new Error("words query failed");
  }
  const map = new Map<string, WordRow>();
  for (const row of clips.data as unknown as Array<{
    word_id: string;
    speaker_id: string;
    clip_key: string | null;
    words: { min_tier: string };
  }>) {
    // `min_tier` lives on `words`, not `word_clips`: it is game access, the
    // same for every voice of the same word.
    map.set(`${row.speaker_id}:${row.word_id}`, {
      clipKey: row.clip_key,
      minTier: row.words.min_tier,
    });
  }
  const def = (speakers.data as Array<{ id: string; is_default: boolean }>).find((s) => s.is_default)?.id;
  if (!def) throw new Error("no default speaker");
  return { words: map, defaultSpeaker: def };
}

async function words(env: Env, now: number): Promise<Inventory> {
  if (wordCache && now - wordCache.at < WORDS_TTL_MS) return wordCache.inventory;
  if (!inFlight) {
    inFlight = loadWords(env)
      .then((inventory) => {
        wordCache = { at: Date.now(), inventory };
        return inventory;
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
  // Deliberately NOT decoded: the id alphabet is [a-z0-9], so nothing
  // legitimate needs decoding, and `decodeURIComponent` THROWS a URIError on
  // a malformed or invalid-UTF-8 escape (`%ff`, `%e0%80%80`) — which, running
  // before the ticket check, turned an unauthenticated probe into a 500
  // instead of the contracted 400. `ID_RE` rejects any escape as-is.
  const rest = url.pathname.slice("/clip/".length);
  const slash = rest.indexOf("/");

  // Ticket first, then the slug regexes: an unauthenticated probe with a bad
  // speaker or id must get 401, not 400 (and never a 500 — see above).
  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  const ticket = match ? await verifyTicket(match[1], env.CLIP_TOKEN_SECRET, callerIp(req)) : null;
  if (!ticket) return Response.json({ error: "Missing or invalid token." }, { status: 401 });

  let inventory: Inventory;
  try {
    inventory = await words(env, Date.now());
  } catch {
    return Response.json({ error: "Clips are temporarily unavailable." }, { status: 503 });
  }

  // Back-compat for exactly one release: an old, content-hashed bundle is
  // still in some player's tab, and without this every cue it asks for 404s
  // at once. Remove in the contract task.
  const speaker = slash === -1 ? inventory.defaultSpeaker : rest.slice(0, slash);
  const id = slash === -1 ? rest : rest.slice(slash + 1);

  if (!SPEAKER_RE.test(speaker)) return Response.json({ error: "Bad speaker." }, { status: 400 });
  if (!ID_RE.test(id)) return Response.json({ error: "Bad clip id." }, { status: 400 });

  const word = inventory.words.get(`${speaker}:${id}`);
  if (!word || !word.clipKey) return Response.json({ error: "Not found." }, { status: 404 });
  // Default-deny: anything that is not exactly "free" needs a pro ticket, so
  // a third tier added to `words.min_tier` later fails closed rather than open.
  if (word.minTier !== "free" && ticket.tier !== "pro") {
    return Response.json({ error: "This clip needs Pro." }, { status: 403 });
  }

  const v = url.searchParams.get("v") ?? "";
  const cacheKey = new Request(`${CACHE_HOST}/clip/${speaker}/${id}?v=${encodeURIComponent(v)}`);
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
