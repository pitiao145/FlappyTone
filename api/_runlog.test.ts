import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const goodRun = {
  mode: "game",
  score: 1200,
  gates: 4,
  outcome: "finished",
  tone_acc: 0.8,
  per_key: { "2": { gates: 3, accSum: 2.4 }, "3-2": { gates: 1, accSum: 0.8 } },
};
const goodBody = { day: "2026-09-28", run: goodRun };

function req(options: { body?: unknown; auth?: string | null; rawBody?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth !== null) headers.authorization = options.auth ?? "Bearer valid-token";
  return new Request("https://example.test/api/runlog", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? goodBody),
  });
}

async function load(opts: {
  user?: { id: string; is_anonymous?: boolean } | null;
  entitlement?: { has_access: boolean } | null;
  insertError?: unknown;
} = {}) {
  const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false };
  const entitlement = "entitlement" in opts ? opts.entitlement : { has_access: true };
  const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: opts.insertError ?? null }));
  const ent: any = {
    select: vi.fn(() => ent),
    eq: vi.fn(() => ent),
    maybeSingle: vi.fn(async () => ({ data: entitlement, error: null })),
  };
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
      from: vi.fn((t: string) => (t === "run_log" ? { insert } : ent)),
    })),
  }));
  vi.resetModules();
  const mod = await import("./runlog.js");
  return { ...mod, insert };
}

describe("POST /api/runlog", () => {
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
    const { POST, insert } = await load({ user: { id: "u", is_anonymous: true } });
    expect((await POST(req())).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([null, { has_access: false }])("returns 403 for a non-Pro account (%p)", async (entitlement) => {
    const { POST, insert } = await load({ entitlement });
    expect((await POST(req())).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await load();
    expect((await POST(req({ rawBody: "{nope" }))).status).toBe(400);
  });

  it.each(["2026-09-30", "2026-09-26", "28-09-2026", 7])("returns 400 for day %p", async (day) => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day } }))).status).toBe(400);
  });

  it("accepts a day within 24h of server UTC", async () => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day: "2026-09-29" } }))).status).toBe(200);
  });

  it.each([
    ["score too high", { score: 1_000_001 }],
    ["negative score", { score: -1 }],
    ["fractional score", { score: 1.5 }],
    ["too many gates", { gates: 501 }],
    ["bad mode", { mode: "lab" }],
    ["bad outcome", { outcome: "won" }],
    ["accuracy above 1", { tone_acc: 1.2 }],
    ["accuracy a string", { tone_acc: "0.5" }],
    ["bad key t1", { per_key: { t1: { gates: 1, accSum: 1 } } }],
    ["bad key 3+2", { per_key: { "3+2": { gates: 1, accSum: 1 } } }],
    ["neutral combo", { per_key: { "3-0": { gates: 1, accSum: 1 } } }],
    ["accSum over gates", { per_key: { "1": { gates: 2, accSum: 2.5 } } }],
    ["negative accSum", { per_key: { "1": { gates: 2, accSum: -1 } } }],
    ["zero key gates", { per_key: { "1": { gates: 0, accSum: 0 } } }],
    ["per_key an array", { per_key: [] }],
  ])("returns 400 for a bad run: %s", async (_n, patch) => {
    const { POST, insert } = await load();
    expect((await POST(req({ body: { day: "2026-09-28", run: { ...goodRun, ...patch } } }))).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("logs every mode and outcome, allows null accuracy and empty per_key", async () => {
    const { POST, insert } = await load();
    const run = { ...goodRun, mode: "drill", outcome: "restart", gates: 0, tone_acc: null, per_key: {} };
    expect((await POST(req({ body: { day: "2026-09-28", run } }))).status).toBe(200);
    expect(insert).toHaveBeenCalledWith({ user_id: "user-1", day: "2026-09-28", ...run });
  });

  it("never sends a client-supplied time or user id", async () => {
    const { POST, insert } = await load();
    const body = { day: "2026-09-28", run: { ...goodRun, played_at: "2020-01-01T00:00:00Z", user_id: "evil" } };
    expect((await POST(req({ body }))).status).toBe(200);
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe("user-1");
    expect("played_at" in row).toBe(false);
  });

  it("returns 502 when the insert fails", async () => {
    const { POST } = await load({ insertError: new Error("db down") });
    expect((await POST(req())).status).toBe(502);
  });
});
