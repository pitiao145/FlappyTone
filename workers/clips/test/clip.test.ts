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
  rows: [] as { id: string; clip_key: string | null; min_tier: string }[],
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
  clips = fakeBucket({ "ba1.wav": "RIFFfake-free", "pw1.wav": "RIFFfake-pro" });
  env = fakeEnv({ CLIPS: clips as unknown as R2Bucket });
  wordsQuery.calls = 0;
  wordsQuery.error = null;
  wordsQuery.rows = [
    { id: "ba1", clip_key: "ba1.wav", min_tier: "free" },
    { id: "pw1", clip_key: "pw1.wav", min_tier: "pro" },
    { id: "noclip", clip_key: null, min_tier: "free" },
  ];
  __resetWordCacheForTests();
});

describe("GET /clip/:id", () => {
  it("401s without a ticket", async () => {
    expect((await get("/clip/ba1")).status).toBe(401);
  });

  it("401s on a ticket signed with another secret", async () => {
    const forged = await signTicket({ tier: "pro", ip: TEST_IP }, "not-our-secret");
    expect((await get("/clip/pw1?v=1", forged, env)).status).toBe(401);
  });

  it("401s on a ticket presented from a different IP", async () => {
    const other = await signTicket({ tier: "pro", ip: "198.51.100.9" }, TEST_SECRET);
    expect((await get("/clip/pw1?v=1", other, env)).status).toBe(401);
  });

  it("400s a malformed id, before touching R2", async () => {
    const t = await ticketFor("free");
    for (const bad of ["../x", "BA1", "ba_1", "a".repeat(33), ""]) {
      const res = await get(`/clip/${encodeURIComponent(bad)}?v=1`, t, env);
      expect(res.status).toBe(400);
    }
    expect(clips.getCalls).toBe(0);
  });

  it("404s an unknown id without touching R2", async () => {
    const res = await get("/clip/nope?v=1", await ticketFor("free"), env);
    expect(res.status).toBe(404);
    expect(clips.getCalls).toBe(0);
  });

  it("404s a published word with no clip_key", async () => {
    expect((await get("/clip/noclip?v=1", await ticketFor("free"), env)).status).toBe(404);
  });

  it("404s when the object is missing from R2", async () => {
    clips.objects.delete("ba1.wav");
    expect((await get("/clip/ba1?v=1", await ticketFor("free"), env)).status).toBe(404);
  });

  it("serves a free word to a free ticket with a private cache-control", async () => {
    const res = await get("/clip/ba1?v=1", await ticketFor("free"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect(await res.text()).toBe("RIFFfake-free");
  });

  it("serves a free word to a guest ticket", async () => {
    expect((await get("/clip/ba1?v=1", await ticketFor("guest"), env)).status).toBe(200);
  });

  it("403s a pro word for a guest or free ticket, without touching R2", async () => {
    expect((await get("/clip/pw1?v=1", await ticketFor("guest"), env)).status).toBe(403);
    expect((await get("/clip/pw1?v=1", await ticketFor("free"), env)).status).toBe(403);
    expect(clips.getCalls).toBe(0);
  });

  it("serves a pro word to a pro ticket", async () => {
    const res = await get("/clip/pw1?v=1", await ticketFor("pro"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("RIFFfake-pro");
  });

  it("stores the shared copy as public and returns the client a private copy", async () => {
    await get("/clip/ba1?v=7", await ticketFor("free"), env);
    const stored = cache.store.get("https://clips.flappytone.com/clip/ba1?v=7");
    expect(stored).toBeDefined();
    expect(stored?.headers.get("cache-control")).toBe("public, max-age=604800, immutable");
  });

  it("serves a second request for the same id+v from the edge cache, not R2", async () => {
    const t = await ticketFor("free");
    await get("/clip/ba1?v=1", t, env);
    expect(clips.getCalls).toBe(1);
    const res = await get("/clip/ba1?v=1", t, env);
    expect(res.status).toBe(200);
    expect(clips.getCalls).toBe(1);
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect(await res.text()).toBe("RIFFfake-free");
  });

  it("misses the cache when ?v= changes", async () => {
    const t = await ticketFor("free");
    await get("/clip/ba1?v=1", t, env);
    await get("/clip/ba1?v=2", t, env);
    expect(clips.getCalls).toBe(2);
  });

  it("runs one words query per isolate, not one per request", async () => {
    const t = await ticketFor("free");
    await get("/clip/ba1?v=1", t, env);
    await get("/clip/ba1?v=2", t, env);
    await get("/clip/pw1?v=1", t, env);
    expect(wordsQuery.calls).toBe(1);
  });

  it("503s rather than failing open when the words query errors", async () => {
    wordsQuery.rows = [];
    wordsQuery.error = { message: "boom" };
    expect((await get("/clip/ba1?v=1", await ticketFor("free"), env)).status).toBe(503);
  });
});
