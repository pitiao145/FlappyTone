import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ENV_URL = "https://example.supabase.co";
const ENV_KEY = "service-role-key";

function req(options: { body?: unknown; auth?: string | null; rawBody?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth !== null) headers.authorization = options.auth ?? "Bearer valid-token";
  return new Request("https://example.test/api/run", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? { day: "2026-09-08" }),
  });
}

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.restoreAllMocks();
  vi.doUnmock("@supabase/supabase-js");
  vi.useRealTimers();
});

describe("POST /api/run", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = ENV_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ENV_KEY;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  });

  it("returns 503 when env vars are missing", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { POST } = await import("./run.js");
    const res = await POST(req());
    expect(res.status).toBe(503);
  });

  it("returns 401 for a missing Authorization header", async () => {
    const { POST } = await import("./run.js");
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const { POST } = await import("./run.js");
    const res = await POST(req({ auth: "Token abc" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed JSON body", async () => {
    const { POST } = await import("./run.js");
    const res = await POST(req({ rawBody: "{not json" }));
    expect(res.status).toBe(400);
  });

  it.each(["2026/09/08", "09-08-2026", "2026-9-8", "not-a-date", 12345])(
    "returns 400 for a malformed day %p",
    async (day) => {
      const { POST } = await import("./run.js");
      const res = await POST(req({ body: { day } }));
      expect(res.status).toBe(400);
    },
  );

  it("returns 400 for a day more than 1 day from server UTC time", async () => {
    const { POST } = await import("./run.js");
    const res = await POST(req({ body: { day: "2026-09-11" } }));
    expect(res.status).toBe(400);
  });

  it("accepts a day 1 day ahead or behind server UTC time", async () => {
    const { POST } = await loadWithMockedSupabase({ existingRow: null });
    const ahead = await POST(req({ body: { day: "2026-09-09" } }));
    expect(ahead.status).toBe(200);
  });

  async function loadWithMockedSupabase(opts: {
    user?: { id: string; is_anonymous?: boolean } | null;
    getUserError?: unknown;
    existingRow?: { count: number } | null;
    readError?: unknown;
    insertError?: unknown;
    updateError?: unknown;
    entitlement?: { has_access: boolean } | null;
  }) {
    const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false };
    const insertSingle = vi.fn(async () => ({
      data: { count: 1 },
      error: opts.insertError ?? null,
    }));
    const updateSingle = vi.fn(async () => ({
      data: { count: (opts.existingRow?.count ?? 0) + 1 },
      error: opts.updateError ?? null,
    }));

    const entitlementsEq = vi.fn();
    const fromMock = vi.fn((table: string) => {
      if (table === "entitlements") {
        const entBuilder: any = {
          select: vi.fn(() => entBuilder),
          eq: vi.fn((...args: unknown[]) => {
            entitlementsEq(...args);
            return entBuilder;
          }),
          maybeSingle: vi.fn(async () => ({
            data: opts.entitlement ?? null,
            error: null,
          })),
        };
        return entBuilder;
      }
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: opts.existingRow ?? null,
          error: opts.readError ?? null,
        })),
        insert: vi.fn(() => {
          builder.__mode = "insert";
          return builder;
        }),
        update: vi.fn(() => {
          builder.__mode = "update";
          return builder;
        }),
        single: vi.fn(async () => {
          if (builder.__mode === "insert") return insertSingle();
          return updateSingle();
        }),
      };
      return builder;
    });

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user },
            error: opts.getUserError ?? null,
          })),
        },
        from: fromMock,
      })),
    }));

    vi.resetModules();
    const mod = await import("./run.js");
    return { ...mod, entitlementsEq };
  }

  it("returns 401 when auth.getUser fails to resolve a user", async () => {
    const { POST } = await loadWithMockedSupabase({ user: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 for an anonymous user", async () => {
    const { POST } = await loadWithMockedSupabase({
      user: { id: "user-1", is_anonymous: true },
    });
    const res = await POST(req());
    expect(res.status).toBe(403);
  });

  it("inserts a fresh count of 1 when no row exists yet", async () => {
    const { POST } = await loadWithMockedSupabase({ existingRow: null });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { count: number; limit: number; allowed: boolean };
    expect(payload.count).toBe(1);
    expect(payload.allowed).toBe(true);
  });

  it("increments an existing count", async () => {
    const { POST } = await loadWithMockedSupabase({ existingRow: { count: 4 } });
    const res = await POST(req());
    const payload = (await res.json()) as { count: number };
    expect(payload.count).toBe(5);
  });

  it("reports allowed:false once the count exceeds the free limit", async () => {
    const { POST } = await loadWithMockedSupabase({ existingRow: { count: 10 } });
    const res = await POST(req());
    const payload = (await res.json()) as { count: number; limit: number; allowed: boolean };
    expect(payload.count).toBe(11);
    expect(payload.limit).toBe(10);
    expect(payload.allowed).toBe(false);
  });

  it("returns 502 on a database error", async () => {
    const { POST } = await loadWithMockedSupabase({
      existingRow: null,
      insertError: new Error("db down"),
    });
    const res = await POST(req());
    expect(res.status).toBe(502);
  });

  it("gives an entitled user limit:null and allowed:true far past the free limit", async () => {
    const { POST } = await loadWithMockedSupabase({
      existingRow: { count: 999 },
      entitlement: { has_access: true },
    });
    const res = await POST(req());
    const text = await res.text();
    expect(text).not.toContain("Infinity");
    const payload = JSON.parse(text) as { count: number; limit: number | null; allowed: boolean };
    expect(payload.count).toBe(1000);
    expect(payload.limit).toBeNull();
    expect(payload.allowed).toBe(true);
  });

  it("caps a user with no entitlements row at the free limit", async () => {
    const { POST } = await loadWithMockedSupabase({
      existingRow: { count: 10 },
      entitlement: null,
    });
    const res = await POST(req());
    const payload = (await res.json()) as { count: number; limit: number | null; allowed: boolean };
    expect(payload.limit).toBe(10);
    expect(payload.count).toBe(11);
    expect(payload.allowed).toBe(false);
  });

  it("caps a user with has_access:false the same as no row", async () => {
    const { POST } = await loadWithMockedSupabase({
      existingRow: { count: 10 },
      entitlement: { has_access: false },
    });
    const res = await POST(req());
    const payload = (await res.json()) as { count: number; limit: number | null; allowed: boolean };
    expect(payload.limit).toBe(10);
    expect(payload.count).toBe(11);
    expect(payload.allowed).toBe(false);
  });

  it("looks up entitlements using the JWT-verified user id, not the request body", async () => {
    const { POST, entitlementsEq } = await loadWithMockedSupabase({
      user: { id: "user-1", is_anonymous: false },
      existingRow: null,
      entitlement: { has_access: true },
    });
    const res = await POST(
      req({ body: { day: "2026-09-08", userId: "attacker-controlled-id", user_id: "attacker-controlled-id" } }),
    );
    const payload = (await res.json()) as { limit: number | null; allowed: boolean };
    expect(payload.limit).toBeNull();
    expect(payload.allowed).toBe(true);
    expect(entitlementsEq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
