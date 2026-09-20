/**
 * `GET /clip/:speaker/:id?v=<word_clips.updated_at>` — the gated,
 * edge-cached clip read. The single-segment `/clip/:id` back-compat route
 * (resolving to the default speaker) has been removed: no real player has
 * ever run this architecture (live flappytone.com still serves the
 * pre-migration Vercel Blob build), and the only place that constructs a
 * clip URL (`src/audio/reference.ts`) already builds the two-segment form.
 * A path with no `/speaker/id` shape now 400s.
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

/**
 * Duplicated from `src/game/tiers.ts`'s `DEFAULT_TIER_LIMITS` — the Worker is
 * a separate deploy target/toolchain (CLAUDE.md), and this codebase already
 * accepts this kind of duplication (`api/run.ts` mirrors `runsPerDay` the
 * same way) rather than sharing a module across the Vite/Vercel/Workers
 * boundary. The UNION here is deliberately coarser than what the game's own
 * `tierLimits()` expresses: a play ticket carries only a tier, never which
 * proficiency/level the player picked this run, so this can only ever answer
 * "does this tier EVER reach this level, under either proficiency" — never
 * "did they pick this level just now". That finer choice is a client-side
 * pool filter, same trust level `wordMix` already had. Keep this in sync by
 * hand if `tiers.ts`'s access table changes.
 */
const TIER_LEVEL_UNION: Record<string, ReadonlySet<number>> = {
  guest: new Set(),
  free: new Set([1, 2]),
  pro: new Set([1, 2, 3]),
};

/** Sampler words are always playable, whatever the ticket's tier — guest needs them. */
const SAMPLER_LIST_IDS = new Set(["sampler-beginner", "sampler-intermediate"]);

interface WordRow {
  clipKey: string | null;
  minTier: string;
  /** This word's `lists.id` memberships, e.g. `["tocfl1"]`. */
  listIds: string[];
}

/** A `tocfl1`/`tocfl2`/`tocfl3` list id's level number, or null for anything else (hsk*, core-120, sampler-*). */
function tocflLevel(listId: string): number | null {
  const m = /^tocfl([123])$/.exec(listId);
  return m ? Number(m[1]) : null;
}

/**
 * Whether `ticket.tier` may ever fetch a word with these list memberships.
 * A word in no `tocfl*` list at all (not yet catalogued into a level, or a
 * sampler-only/hsk/core-120 word) is never level-gated here — `min_tier` is
 * still checked separately, same as always.
 */
function levelAllowed(listIds: string[], tier: string): boolean {
  const levels = listIds.map(tocflLevel).filter((l): l is number => l !== null);
  if (levels.length === 0) return true;
  if (listIds.some((id) => SAMPLER_LIST_IDS.has(id))) return true;
  // `some`, not `every`: mirrors `wordsForList`'s membership check on the
  // client (a word is in-pool if it matches ANY requested level), for the
  // same reason a word could in principle be tagged into more than one
  // TOCFL list.
  const allowed = TIER_LEVEL_UNION[tier] ?? new Set();
  return levels.some((l) => allowed.has(l));
}

/**
 * Keyed "speaker:id", not id. A map keyed on id alone would resolve a male
 * request to whatever row happened to load last.
 */
interface Inventory {
  words: Map<string, WordRow>;
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
  const clips = await db
    .from("word_clips")
    .select("word_id,speaker_id,clip_key,words!inner(min_tier,word_lists(list_id))")
    .eq("status", "published");
  if (clips.error || !clips.data) {
    throw new Error("words query failed");
  }
  const map = new Map<string, WordRow>();
  for (const row of clips.data as unknown as Array<{
    word_id: string;
    speaker_id: string;
    clip_key: string | null;
    words: { min_tier: string; word_lists: Array<{ list_id: string }> | null };
  }>) {
    // `min_tier` and list membership both live on `words`, not `word_clips`:
    // game access and TOCFL level are the same for every voice of the word.
    map.set(`${row.speaker_id}:${row.word_id}`, {
      clipKey: row.clip_key,
      minTier: row.words.min_tier,
      listIds: (row.words.word_lists ?? []).map((l) => l.list_id),
    });
  }
  return { words: map };
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

  if (slash === -1) {
    return Response.json({ error: "Bad clip id." }, { status: 400 });
  }

  let inventory: Inventory;
  try {
    inventory = await words(env, Date.now());
  } catch {
    return Response.json({ error: "Clips are temporarily unavailable." }, { status: 503 });
  }

  const speaker = rest.slice(0, slash);
  const id = rest.slice(slash + 1);

  if (!SPEAKER_RE.test(speaker)) return Response.json({ error: "Bad speaker." }, { status: 400 });
  if (!ID_RE.test(id)) return Response.json({ error: "Bad clip id." }, { status: 400 });

  const word = inventory.words.get(`${speaker}:${id}`);
  if (!word || !word.clipKey) return Response.json({ error: "Not found." }, { status: 404 });
  // Default-deny: anything that is not exactly "free" needs a pro ticket, so
  // a third tier added to `words.min_tier` later fails closed rather than open.
  if (word.minTier !== "free" && ticket.tier !== "pro") {
    return Response.json({ error: "This clip needs Pro." }, { status: 403 });
  }
  // TOCFL level gate — coarse (see TIER_LEVEL_UNION's comment): only checks
  // whether this tier could EVER reach this word's level, not which level
  // was chosen this run.
  if (!levelAllowed(word.listIds, ticket.tier)) {
    return Response.json({ error: "This clip needs a higher TOCFL level." }, { status: 403 });
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
