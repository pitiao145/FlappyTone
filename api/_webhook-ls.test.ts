import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_URL = "https://example.supabase.co";
const ENV_KEY = "service-role-key";
const SECRET = "whsec_test_secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function req(body: unknown, options: { signature?: string | null; rawBody?: string } = {}): Request {
  const rawBody = options.rawBody ?? JSON.stringify(body);
  const headers: Record<string, string> = {};
  const signature = "signature" in options ? options.signature : sign(rawBody);
  if (signature !== null) headers["x-signature"] = signature as string;
  return new Request("https://example.test/api/webhook-ls", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function orderCreatedPayload(userId: string | null = "user-1", eventName = "order_created") {
  return {
    meta: {
      event_name: eventName,
      custom_data: userId === null ? {} : { user_id: userId },
    },
    data: {
      type: "orders",
      id: "1",
      attributes: { user_email: "someone-else@example.com" },
    },
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = ENV_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV_KEY;
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  vi.restoreAllMocks();
  vi.doUnmock("@supabase/supabase-js");
});

async function loadWithMockedSupabase() {
  const upsert = vi.fn(async (_row: Record<string, unknown>, _opts: Record<string, unknown>) => ({
    error: null as unknown,
  }));
  const fromMock = vi.fn(() => ({ upsert }));

  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({ from: fromMock })),
  }));

  vi.resetModules();
  const mod = await import("./webhook-ls.js");
  return { POST: mod.POST, upsert, fromMock };
}

describe("POST /api/webhook-ls", () => {
  it("returns 503 when env vars are missing", async () => {
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const { POST } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload()));
    expect(res.status).toBe(503);
  });

  it("grants access on a validly-signed order_created", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1")));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", has_access: true, source: "lemonsqueezy" }),
      expect.objectContaining({ onConflict: "user_id" }),
    );
  });

  it("grants access on a validly-signed subscription_created", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1", "subscription_created")));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", has_access: true }),
      expect.anything(),
    );
  });

  it("rejects an invalid signature and writes nothing", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload(), { signature: "0".repeat(64) }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header and writes nothing", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload(), { signature: null }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a body that was tampered with after signing", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const rawBody = JSON.stringify(orderCreatedPayload("user-1"));
    const signature = sign(rawBody);
    // Same signature, different body — must fail even though the signature
    // itself is well-formed and was genuinely produced by `sign`.
    const tampered = JSON.stringify(orderCreatedPayload("attacker-controlled-id"));
    const res = await POST(req(undefined, { rawBody: tampered, signature }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing user_id and writes nothing", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload(null)));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("revokes access on order_refunded", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1", "order_refunded")));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", has_access: false }),
      expect.anything(),
    );
  });

  it("revokes access on subscription_expired", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1", "subscription_expired")));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", has_access: false }),
      expect.anything(),
    );
  });

  it("is idempotent: a replayed order_created writes the same absolute state twice, no error", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const payload = req(orderCreatedPayload("user-1"));
    const first = await POST(payload);
    expect(first.status).toBe(200);
    const second = await POST(req(orderCreatedPayload("user-1")));
    expect(second.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      expect(call[0]).toMatchObject({ user_id: "user-1", has_access: true });
    }
  });

  it("returns 200 and writes nothing for an unknown event type", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1", "license_key_created")));
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("uses meta.custom_data.user_id, never any email in the payload, as the write identity", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const res = await POST(req(orderCreatedPayload("user-1")));
    expect(res.status).toBe(200);
    const written = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(written.user_id).toBe("user-1");
    expect(JSON.stringify(written)).not.toContain("someone-else@example.com");
  });

  it("returns 502 when the database write fails", async () => {
    const upsert = vi.fn(async (_row: Record<string, unknown>, _opts: Record<string, unknown>) => ({
      error: new Error("db down") as unknown,
    }));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({ from: vi.fn(() => ({ upsert })) })),
    }));
    vi.resetModules();
    const { POST } = await import("./webhook-ls.js");
    const res = await POST(req(orderCreatedPayload("user-1")));
    expect(res.status).toBe(502);
  });

  it("returns 400 for malformed JSON body, even with a valid signature over that raw text", async () => {
    const { POST, upsert } = await loadWithMockedSupabase();
    const rawBody = "{not json";
    const res = await POST(req(undefined, { rawBody, signature: sign(rawBody) }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
