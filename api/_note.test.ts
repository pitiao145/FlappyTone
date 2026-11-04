import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function req(body: unknown, auth: string | null = "Bearer valid-token"): Request {
  const headers: Record<string, string> = {};
  if (auth !== null) headers.authorization = auth;
  return new Request("https://example.test/api/note", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function load(opts: {
  user?: { id: string; is_anonymous?: boolean; email?: string } | null;
  eligible?: boolean;
  rpcError?: unknown;
} = {}) {
  const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false, email: "a@b.co" };
  const rpc = vi.fn(async (name: string) =>
    name === "note_eligible"
      ? { data: opts.eligible ?? true, error: opts.rpcError ?? null }
      : { data: null, error: null },
  );
  const insert = vi.fn(async () => ({ error: null }));
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
      from: vi.fn((table: string) => {
        expect(table).toBe("feedback");
        return { insert };
      }),
      rpc,
    })),
  }));
  vi.resetModules();
  const mod = await import("./note.js");
  return { ...mod, rpc, insert };
}

describe("parseNoteBody", () => {
  it("accepts the three actions", async () => {
    const { parseNoteBody } = await load();
    expect(parseNoteBody({ action: "check" })).toEqual({ action: "check" });
    expect(parseNoteBody({ action: "dismiss" })).toEqual({ action: "dismiss", context: {} });
    expect(parseNoteBody({ action: "send", message: " hi ", wantsChat: false, context: { tier: "free" } })).toEqual({
      action: "send",
      message: "hi",
      wantsChat: false,
      context: { tier: "free" },
    });
  });

  it.each([
    null,
    { action: "nope" },
    { action: "send", message: "   ", wantsChat: false },
    { action: "send", message: "x".repeat(1001), wantsChat: false },
    { action: "send", message: "hi" },
    { action: "send", message: "hi", wantsChat: false, context: { nested: { a: 1 } } },
    { action: "send", message: "hi", wantsChat: false, context: { long: "x".repeat(81) } },
    { action: "dismiss", context: [1] },
  ])("rejects %j", async (body) => {
    const { parseNoteBody } = await load();
    expect(parseNoteBody(body)).toBeNull();
  });
});

describe("POST /api/note", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
    vi.doUnmock("@supabase/supabase-js");
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await load();
    expect((await POST(req({ action: "check" }, null))).status).toBe(401);
  });

  it("returns 403 for an anonymous session", async () => {
    const { POST, rpc } = await load({ user: { id: "u", is_anonymous: true } });
    expect((await POST(req({ action: "check" }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers check with the server's eligibility and its thresholds", async () => {
    const { POST, rpc, NOTE_MIN_DAYS, NOTE_MIN_RUNS } = await load({ eligible: false });
    const res = await POST(req({ action: "check" }));
    expect(await res.json()).toEqual({ show: false });
    expect(rpc).toHaveBeenCalledWith("note_eligible", {
      p_user: "user-1",
      p_min_days: NOTE_MIN_DAYS,
      p_min_runs: NOTE_MIN_RUNS,
    });
  });

  it("refuses a write once the player no longer qualifies", async () => {
    const { POST, insert } = await load({ eligible: false });
    const res = await POST(req({ action: "send", message: "hi", wantsChat: true }));
    expect(res.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it("stores the session email only when the player wants a chat", async () => {
    const { POST, insert } = await load();
    await POST(req({ action: "send", message: "hi", wantsChat: true, context: { email: "evil@x.co" } }));
    await POST(req({ action: "send", message: "hi", wantsChat: false }));
    const rows = insert.mock.calls.map((c) => (c as unknown[])[0] as Record<string, unknown>);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      source: "note",
      message: "hi",
      wants_chat: true,
      contact_email: "a@b.co",
      tier: "free",
    });
    expect(rows[1]).toMatchObject({ wants_chat: false, contact_email: null });
  });

  it("records a dismiss on the profile, not as feedback", async () => {
    const { POST, insert, rpc } = await load();
    expect((await POST(req({ action: "dismiss" }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("note_dismiss", { p_user: "user-1" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 502 when the eligibility check fails", async () => {
    const { POST } = await load({ rpcError: { message: "boom" } });
    expect((await POST(req({ action: "check" }))).status).toBe(502);
  });
});
