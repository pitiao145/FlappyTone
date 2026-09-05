import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isoWeekId } from "./score.js";

const ENV_URL = "https://example.supabase.co";
const ENV_KEY = "service-role-key";

function req(options: { body?: unknown; auth?: string | null; rawBody?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth !== null) headers.authorization = options.auth ?? "Bearer valid-token";
  return new Request("https://example.test/api/score", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? { score: 100 }),
  });
}

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.restoreAllMocks();
  vi.doUnmock("@supabase/supabase-js");
});

describe("isoWeekId", () => {
  it("computes a mid-year week", () => {
    // 2026-09-05 is a Saturday in ISO week 36 of 2026.
    expect(isoWeekId(new Date(Date.UTC(2026, 8, 5)))).toBe("2026-W36");
  });

  it("zero-pads a single-digit week number", () => {
    expect(isoWeekId(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-W02");
  });

  it("handles a year boundary where the ISO week-year differs from the calendar year", () => {
    // 2027-01-01 is a Friday, which falls in week 53 of ISO year 2026.
    expect(isoWeekId(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
  });

  it("handles the start of an ISO year", () => {
    // 2024-01-01 is a Monday, ISO week 1 of 2024.
    expect(isoWeekId(new Date(Date.UTC(2024, 0, 1)))).toBe("2024-W01");
  });
});

describe("POST /api/score", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = ENV_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ENV_KEY;
  });

  it("returns 503 when env vars are missing", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { POST } = await import("./score.js");
    const res = await POST(req());
    expect(res.status).toBe(503);
  });

  it("returns 401 for a missing Authorization header", async () => {
    const { POST } = await import("./score.js");
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const { POST } = await import("./score.js");
    const res = await POST(req({ auth: "Token abc" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed JSON body", async () => {
    const { POST } = await import("./score.js");
    const res = await POST(req({ rawBody: "{not json" }));
    expect(res.status).toBe(400);
  });

  describe("with a mocked Supabase client", () => {
    // Each test dynamically re-imports score.ts after vi.resetModules() so
    // the module-level rate-limit Map doesn't leak state between tests.
    async function loadWithMockedSupabase(opts: {
      user?: { id: string } | null;
      getUserError?: unknown;
      existingRow?: { best_score: number } | null;
      readError?: unknown;
      insertError?: unknown;
      updateError?: unknown;
    }) {
      const user = "user" in opts ? opts.user : { id: "user-1" };
      const insertSingle = vi.fn(async () => ({
        data: { best_score: (globalThis as any).__lastInsertScore },
        error: opts.insertError ?? null,
      }));
      const updateSingle = vi.fn(async () => ({
        data: { best_score: (globalThis as any).__lastUpdateScore },
        error: opts.updateError ?? null,
      }));

      const fromMock = vi.fn(() => {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: opts.existingRow ?? null,
            error: opts.readError ?? null,
          })),
          insert: vi.fn((row: { best_score: number }) => {
            (globalThis as any).__lastInsertScore = row.best_score;
            return builder;
          }),
          update: vi.fn((row: { best_score: number }) => {
            (globalThis as any).__lastUpdateScore = row.best_score;
            return builder;
          }),
          single: vi.fn(async () => {
            if (builder.__mode === "insert") return insertSingle();
            return updateSingle();
          }),
        };
        // Track which write op was called so `single` knows which stub to use.
        const origInsert = builder.insert;
        builder.insert = vi.fn((row: { best_score: number }) => {
          builder.__mode = "insert";
          return origInsert(row);
        });
        const origUpdate = builder.update;
        builder.update = vi.fn((row: { best_score: number }) => {
          builder.__mode = "update";
          return origUpdate(row);
        });
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
      return import("./score.js");
    }

    it("returns 401 when auth.getUser fails to resolve a user", async () => {
      const { POST } = await loadWithMockedSupabase({ user: null });
      const res = await POST(req());
      expect(res.status).toBe(401);
    });

    it.each([1.5, -1, 1_000_001, NaN, "100"])("returns 400 for an invalid score %p", async (score) => {
      const { POST } = await loadWithMockedSupabase({ existingRow: null });
      const res = await POST(req({ body: { score } }));
      expect(res.status).toBe(400);
    });

    it("inserts a new best score when no row exists yet", async () => {
      const { POST } = await loadWithMockedSupabase({ existingRow: null });
      const res = await POST(req({ body: { score: 500 } }));
      expect(res.status).toBe(200);
      const payload = (await res.json()) as { ok: boolean; bestScore: number; weekId: string };
      expect(payload).toMatchObject({ ok: true, bestScore: 500 });
      expect(payload.weekId).toMatch(/^\d{4}-W\d{2}$/);
    });

    it("raises the best score on a higher submission", async () => {
      const { POST } = await loadWithMockedSupabase({ existingRow: { best_score: 100 } });
      const res = await POST(req({ body: { score: 300 } }));
      const payload = (await res.json()) as { bestScore: number };
      expect(payload.bestScore).toBe(300);
    });

    it("does not lower the stored best on a worse later score", async () => {
      const { POST } = await loadWithMockedSupabase({ existingRow: { best_score: 900 } });
      const res = await POST(req({ body: { score: 300 } }));
      expect(res.status).toBe(200);
      const payload = (await res.json()) as { bestScore: number };
      expect(payload.bestScore).toBe(900);
    });

    it("rejects a second submission from the same user within the rate-limit window", async () => {
      const { POST } = await loadWithMockedSupabase({ existingRow: null });
      const first = await POST(req({ body: { score: 100 } }));
      expect(first.status).toBe(200);
      const second = await POST(req({ body: { score: 200 } }));
      expect(second.status).toBe(429);
    });

    it("returns 502 on a database error", async () => {
      const { POST } = await loadWithMockedSupabase({
        existingRow: null,
        insertError: new Error("db down"),
      });
      const res = await POST(req());
      expect(res.status).toBe(502);
    });
  });
});
