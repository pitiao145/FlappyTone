import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const line = (v: number, count = 1) => new Array(61).fill(v * count);
const goodBody = { day: "2026-09-28", entries: [{ key: "2", sum: line(3), count: 1 }] };

function req(options: { body?: unknown; auth?: string | null; rawBody?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth !== null) headers.authorization = options.auth ?? "Bearer valid-token";
  return new Request("https://example.test/api/shapes", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? goodBody),
  });
}

async function load(opts: {
  user?: { id: string; is_anonymous?: boolean } | null;
  entitlement?: { has_access: boolean } | null;
  rpcError?: unknown;
} = {}) {
  const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false };
  const entitlement = "entitlement" in opts ? opts.entitlement : { has_access: true };
  const rpc = vi.fn(async () => ({ data: null, error: opts.rpcError ?? null }));
  const ent: any = {
    select: vi.fn(() => ent),
    eq: vi.fn(() => ent),
    maybeSingle: vi.fn(async () => ({ data: entitlement, error: null })),
  };
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
      from: vi.fn(() => ent),
      rpc,
    })),
  }));
  vi.resetModules();
  const mod = await import("./shapes.js");
  return { ...mod, rpc };
}

describe("POST /api/shapes", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
    vi.doUnmock("@supabase/supabase-js");
    vi.useRealTimers();
  });

  it("returns 503 without env vars", async () => {
    delete process.env.SUPABASE_URL;
    const { POST } = await load();
    expect((await POST(req())).status).toBe(503);
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await load();
    expect((await POST(req({ auth: null }))).status).toBe(401);
  });

  it("returns 401 when the session does not resolve", async () => {
    const { POST } = await load({ user: null });
    expect((await POST(req())).status).toBe(401);
  });

  it("returns 403 for an anonymous session", async () => {
    const { POST, rpc } = await load({ user: { id: "u", is_anonymous: true } });
    expect((await POST(req())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, { has_access: false }])("returns 403 for a non-Pro account (%p)", async (entitlement) => {
    const { POST, rpc } = await load({ entitlement });
    expect((await POST(req())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await load();
    expect((await POST(req({ rawBody: "{nope" }))).status).toBe(400);
  });

  it.each(["2026-09-30", "2026-09-26", "28-09-2026", 7])("returns 400 for day %p", async (day) => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day } }))).status).toBe(400);
  });

  it("accepts a day within 24h of server UTC (same bound as api/run.ts)", async () => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day: "2026-09-29" } }))).status).toBe(200);
  });

  it.each([
    ["too short", [{ key: "2", sum: new Array(60).fill(3), count: 1 }]],
    ["too long", [{ key: "2", sum: new Array(62).fill(3), count: 1 }]],
    ["value above range", [{ key: "2", sum: line(6), count: 1 }]],
    ["value below range", [{ key: "2", sum: line(0.2), count: 1 }]],
    ["sum over count bound", [{ key: "2", sum: line(6, 2), count: 2 }]],
    ["NaN", [{ key: "2", sum: [...line(3).slice(1), null], count: 1 }]],
    ["bad key t1", [{ key: "t1", sum: line(3), count: 1 }]],
    ["bad key 3+2", [{ key: "3+2", sum: line(3), count: 1 }]],
    ["neutral combo", [{ key: "3-0", sum: line(3), count: 1 }]],
    ["zero count", [{ key: "2", sum: line(3), count: 0 }]],
    ["fractional count", [{ key: "2", sum: line(3), count: 1.5 }]],
    ["duplicate key", [{ key: "2", sum: line(3), count: 1 }, { key: "2", sum: line(3), count: 1 }]],
    ["empty", []],
    ["not an array", "x"],
  ])("returns 400 for bad entries: %s", async (_name, entries) => {
    const { POST, rpc } = await load();
    expect((await POST(req({ body: { day: "2026-09-28", entries } }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a multi-attempt bucket and a combo key", async () => {
    const { POST, rpc } = await load();
    const entries = [
      { key: "4", sum: line(3, 5), count: 5 },
      { key: "3-2", sum: line(2, 2), count: 2 },
    ];
    expect((await POST(req({ body: { day: "2026-09-28", entries } }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("add_tone_shapes", {
      p_user_id: "user-1",
      p_day: "2026-09-28",
      p_rows: entries,
    });
  });

  it("adds on every repeat: each request goes to the additive RPC, never an upsert", async () => {
    // The element-wise add itself is SQL (add_tone_shapes, migration 0026),
    // verified against the live database; this pins that the function never
    // writes the table any other way.
    const { POST, rpc } = await load();
    await POST(req());
    await POST(req());
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every((c: unknown[]) => c[0] === "add_tone_shapes")).toBe(true);
  });

  it("returns 502 when the RPC fails", async () => {
    const { POST } = await load({ rpcError: new Error("db down") });
    expect((await POST(req())).status).toBe(502);
  });
});
