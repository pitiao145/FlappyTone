import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_IP,
  TEST_SECRET,
  fakeBucket,
  fakeCtx,
  fakeEnv,
  installFakeCache,
  type FakeBucket,
  type FakeCache,
} from "./helpers.ts";
import { signTicket, type Tier } from "../src/tickets.ts";

const wordsQuery = vi.hoisted(() => ({
  calls: 0,
  rows: [] as {
    word_id: string;
    speaker_id: string;
    clip_key: string | null;
    words: { min_tier: string };
  }[],
  error: null as unknown,
}));

vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: () => ({
      select: () => ({
        eq: async () => {
          wordsQuery.calls++;
          return { data: wordsQuery.rows, error: wordsQuery.error };
        },
      }),
    }),
  }),
}));

const { handleClip, __resetWordCacheForTests } = await import("../src/routes/clip.ts");

const ticketFor = (tier: Tier) => signTicket({ tier, ip: TEST_IP }, TEST_SECRET);

async function get(path: string, ticket?: string, env = fakeEnv(), ctx = fakeCtx()) {
  const req = new Request(`https://clips.flappytone.com${path}`, {
    headers: {
      "CF-Connecting-IP": TEST_IP,
      ...(ticket ? { authorization: `Bearer ${ticket}` } : {}),
    },
  });
  return handleClip(req, env, ctx);
}

let cache: FakeCache;
let clips: FakeBucket;
let env: ReturnType<typeof fakeEnv>;

beforeEach(() => {
  cache = installFakeCache();
  clips = fakeBucket({
    "ba1.wav": "RIFFfake-free",
    "pw1.wav": "RIFFfake-pro",
    "ba1-mark.wav": "RIFFfake-free-mark",
    "pw1-mark.wav": "RIFFfake-pro-mark",
  });
  env = fakeEnv({ CLIPS: clips as unknown as R2Bucket });
  wordsQuery.calls = 0;
  wordsQuery.error = null;
  wordsQuery.rows = [
    { word_id: "ba1", speaker_id: "jane", clip_key: "ba1.wav", words: { min_tier: "free" } },
    { word_id: "pw1", speaker_id: "jane", clip_key: "pw1.wav", words: { min_tier: "pro" } },
    { word_id: "noclip", speaker_id: "jane", clip_key: null, words: { min_tier: "free" } },
    { word_id: "ba1", speaker_id: "mark", clip_key: "ba1-mark.wav", words: { min_tier: "free" } },
    { word_id: "pw1", speaker_id: "mark", clip_key: "pw1-mark.wav", words: { min_tier: "pro" } },
  ];
  __resetWordCacheForTests();
});

describe("GET /clip/:id (back-compat route removed)", () => {
  it("400s a single-segment path, even with a valid ticket", async () => {
    expect((await get("/clip/ba1?v=1", await ticketFor("free"), env)).status).toBe(400);
  });

  it("401s a single-segment path with no ticket (ticket check still runs first)", async () => {
    expect((await get("/clip/ba1")).status).toBe(401);
  });

  it("401s on a ticket signed with another secret", async () => {
    const forged = await signTicket({ tier: "pro", ip: TEST_IP }, "not-our-secret");
    expect((await get("/clip/jane/pw1?v=1", forged, env)).status).toBe(401);
  });

  it("401s on a ticket presented from a different IP", async () => {
    const other = await signTicket({ tier: "pro", ip: "198.51.100.9" }, TEST_SECRET);
    expect((await get("/clip/jane/pw1?v=1", other, env)).status).toBe(401);
  });

  it("400s a malformed id, before touching R2", async () => {
    const t = await ticketFor("free");
    for (const bad of ["..%2Fx", "BA1", "ba_1", "a".repeat(33), "", "%ff", "%e0%80%80", "%"]) {
      const res = await get(`/clip/jane/${bad}?v=1`, t, env);
      expect(res.status).toBe(400);
    }
    expect(clips.getCalls).toBe(0);
  });

  it("404s an unknown id without touching R2", async () => {
    const res = await get("/clip/jane/nope?v=1", await ticketFor("free"), env);
    expect(res.status).toBe(404);
    expect(clips.getCalls).toBe(0);
  });

  it("404s a published word with no clip_key", async () => {
    expect((await get("/clip/jane/noclip?v=1", await ticketFor("free"), env)).status).toBe(404);
  });

  it("404s when the object is missing from R2", async () => {
    clips.objects.delete("ba1.wav");
    expect((await get("/clip/jane/ba1?v=1", await ticketFor("free"), env)).status).toBe(404);
  });

  it("serves a free word to a free ticket with a private cache-control", async () => {
    const res = await get("/clip/jane/ba1?v=1", await ticketFor("free"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect(await res.text()).toBe("RIFFfake-free");
  });

  it("serves a free word to a guest ticket", async () => {
    expect((await get("/clip/jane/ba1?v=1", await ticketFor("guest"), env)).status).toBe(200);
  });

  it("403s a pro word for a guest or free ticket, without touching R2", async () => {
    expect((await get("/clip/jane/pw1?v=1", await ticketFor("guest"), env)).status).toBe(403);
    expect((await get("/clip/jane/pw1?v=1", await ticketFor("free"), env)).status).toBe(403);
    expect(clips.getCalls).toBe(0);
  });

  it("serves a pro word to a pro ticket", async () => {
    const res = await get("/clip/jane/pw1?v=1", await ticketFor("pro"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("RIFFfake-pro");
  });

  it("stores the shared copy as public and returns the client a private copy", async () => {
    await get("/clip/jane/ba1?v=7", await ticketFor("free"), env);
    const stored = cache.store.get("https://clips.flappytone.com/clip/jane/ba1?v=7");
    expect(stored).toBeDefined();
    expect(stored?.headers.get("cache-control")).toBe("public, max-age=604800, immutable");
  });

  it("serves a second request for the same id+v from the edge cache, not R2", async () => {
    const t = await ticketFor("free");
    await get("/clip/jane/ba1?v=1", t, env);
    expect(clips.getCalls).toBe(1);
    const res = await get("/clip/jane/ba1?v=1", t, env);
    expect(res.status).toBe(200);
    expect(clips.getCalls).toBe(1);
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect(await res.text()).toBe("RIFFfake-free");
  });

  it("misses the cache when ?v= changes", async () => {
    const t = await ticketFor("free");
    await get("/clip/jane/ba1?v=1", t, env);
    await get("/clip/jane/ba1?v=2", t, env);
    expect(clips.getCalls).toBe(2);
  });

  it("runs one words query per isolate, not one per request", async () => {
    const t = await ticketFor("free");
    await get("/clip/jane/ba1?v=1", t, env);
    await get("/clip/jane/ba1?v=2", t, env);
    await get("/clip/jane/pw1?v=1", t, env);
    expect(wordsQuery.calls).toBe(1);
  });

  it("503s rather than failing open when the words query errors", async () => {
    wordsQuery.rows = [];
    wordsQuery.error = { message: "boom" };
    expect((await get("/clip/jane/ba1?v=1", await ticketFor("free"), env)).status).toBe(503);
  });
});

describe("GET /clip/:speaker/:id", () => {
  it("does not share a cache entry between two speakers", async () => {
    // The bug this prevents ships the WRONG VOICE to every player at once,
    // with no error anywhere, and is invisible to every other test here.
    const t = await ticketFor("free");
    await get("/clip/jane/ba1?v=1", t, env);
    const stored = [...cache.store.keys()];
    await get("/clip/mark/ba1?v=1", t, env);
    const both = [...cache.store.keys()];
    expect(both).toHaveLength(2);
    expect(both[1]).not.toBe(stored[0]);
    expect(both[0]).toContain("/clip/jane/");
    expect(both[1]).toContain("/clip/mark/");
  });

  it("serves each speaker its own object", async () => {
    const t = await ticketFor("free");
    const jane = await get("/clip/jane/ba1?v=1", t, env);
    const mark = await get("/clip/mark/ba1?v=1", t, env);
    expect(await jane.text()).toBe("RIFFfake-free");
    expect(await mark.text()).toBe("RIFFfake-free-mark");
  });

  it("rejects a bad speaker slug — after the ticket check, so an unauthenticated probe still gets 401", async () => {
    const t = await ticketFor("free");
    expect((await get("/clip/JANE/ba1", t, env)).status).toBe(400);
    expect((await get("/clip/../ba1", t, env)).status).toBe(400);
    expect((await get("/clip/%2e%2e/ba1", t, env)).status).toBe(400);
    expect((await get("/clip/jane-2/ba1", t, env)).status).toBe(400);
    expect((await get("/clip/jane/ba1")).status).toBe(401);
    expect((await get("/clip/JANE/ba1")).status).toBe(401);
    expect(clips.getCalls).toBe(0);
  });

  it("404s a speaker who has not published that word", async () => {
    expect((await get("/clip/mark/noclip?v=1", await ticketFor("free"), env)).status).toBe(404);
    expect((await get("/clip/nobody/ba1?v=1", await ticketFor("free"), env)).status).toBe(404);
  });

  it("still gates a pro word on the ticket's tier, for every speaker", async () => {
    expect((await get("/clip/mark/pw1?v=1", await ticketFor("guest"), env)).status).toBe(403);
    expect((await get("/clip/mark/pw1?v=1", await ticketFor("free"), env)).status).toBe(403);
    expect((await get("/clip/mark/pw1?v=1", await ticketFor("pro"), env)).status).toBe(200);
  });

  it("400s a single-segment /clip/:id path instead of resolving a default speaker", async () => {
    const res = await get("/clip/ba1?v=1", await ticketFor("free"), env);
    expect(res.status).toBe(400);
  });

  it("503s rather than serving an empty inventory when the words query errors", async () => {
    wordsQuery.error = { message: "boom" };
    expect((await get("/clip/jane/ba1?v=1", await ticketFor("free"), env)).status).toBe(503);
  });
});
