import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const goodRun = {
  runId: RUN_ID,
  mode: "game",
  score: 1200,
  gates: 4,
  outcome: "finished",
  tone_acc: 0.8,
  per_key: { "2": { gates: 3, accSum: 2.4, unheard: 1, best: 0.9 }, "3-2": { gates: 1, accSum: 0.8, unheard: 0, best: 0.8 } },
  wordIds: ["ma1b", "hao3wan2"],
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
  rpcError?: unknown;
  rpcResult?: boolean;
  /** An existing adoption row for this user, if any. */
  priorAdoption?: { adopt_id: string } | null;
  /** claim_counted_run's answer (default: a slot is free). */
  claim?: boolean;
  /** The run id is already in run_log (a retry). */
  seen?: boolean;
} = {}) {
  const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false };
  const entitlement = "entitlement" in opts ? opts.entitlement : { has_access: true };
  const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) =>
    fn === "claim_counted_run"
      ? { data: opts.claim ?? true, error: null }
      : { data: opts.rpcError ? null : (opts.rpcResult ?? true), error: opts.rpcError ?? null },
  );
  // One chain per table; `then` answers a head/count query, `maybeSingle` a row.
  const chain = (row: unknown, count = 0): any => {
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      limit: vi.fn(() => c),
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      then: (resolve: (v: unknown) => void) => resolve({ count, error: null }),
    };
    return c;
  };
  const tables: Record<string, any> = {
    entitlements: chain(entitlement),
    adoptions: chain(opts.priorAdoption ?? null),
    run_log: chain(opts.seen ? { run_id: RUN_ID } : null),
  };
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
      from: vi.fn((t: string) => tables[t]),
      rpc,
    })),
  }));
  vi.resetModules();
  const mod = await import("./runlog.js");
  return { ...mod, rpc };
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
    const { POST, rpc } = await load({ user: { id: "u", is_anonymous: true } });
    expect((await POST(req())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await load();
    expect((await POST(req({ rawBody: "{nope" }))).status).toBe(400);
  });

  it.each(["2026-09-30", "2026-09-20", "28-09-2026", 7])("returns 400 for day %p", async (day) => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day } }))).status).toBe(400);
  });

  it.each(["2026-09-29", "2026-09-22"])("accepts day %p (a day ahead, or an outbox run a week old)", async (day) => {
    const { POST } = await load();
    expect((await POST(req({ body: { ...goodBody, day } }))).status).toBe(200);
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
    ["empty key", { per_key: { "1": { gates: 0, accSum: 0, unheard: 0 } } }],
    ["best above 1", { per_key: { "1": { gates: 1, accSum: 1, best: 2 } } }],
    ["per_key an array", { per_key: [] }],
    ["bad run id", { runId: "not-a-uuid" }],
    ["bad word id", { wordIds: ["DROP TABLE"] }],
    ["too many words", { wordIds: Array.from({ length: 201 }, (_, i) => `w${i}`) }],
  ])("returns 400 for a bad run: %s", async (_n, patch) => {
    const { POST, rpc } = await load();
    expect((await POST(req({ body: { day: "2026-09-28", run: { ...goodRun, ...patch } } }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an unheard-only key is valid (it still adds to the unheard tally)", async () => {
    const { POST } = await load();
    const run = { ...goodRun, per_key: { "3": { gates: 0, accSum: 0, unheard: 2, best: 0 } } };
    expect((await POST(req({ body: { day: "2026-09-28", run } }))).status).toBe(200);
  });

  it("records a free account's counted run with stats, streak and a ring of 5", async () => {
    const { POST, rpc } = await load({ entitlement: null });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: true });
    expect(rpc).toHaveBeenCalledWith("record_run", expect.objectContaining({
      p_user: "user-1", p_run: RUN_ID, p_day: "2026-09-28", p_stats: true, p_streak: true, p_ring: 5,
      p_words: ["ma1b", "hao3wan2"],
    }));
  });

  it("keeps every row for Pro (no ring)", async () => {
    const { POST, rpc } = await load();
    await POST(req());
    expect(rpc.mock.calls.find((c) => c[0] !== "claim_counted_run")![1].p_ring).toBeNull();
  });

  it("a retried run reports applied:false and still succeeds", async () => {
    const { POST } = await load({ rpcResult: false });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: false });
  });

  it("does not store a free account's uncounted run (tutorial, restart)", async () => {
    const { POST, rpc } = await load({ entitlement: { has_access: false } });
    for (const patch of [{ mode: "tutorial" }, { outcome: "restart" }]) {
      const res = await POST(req({ body: { day: "2026-09-28", run: { ...goodRun, ...patch } } }));
      expect(await res.json()).toEqual({ applied: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("logs a Pro tutorial run without stats or streak", async () => {
    const { POST, rpc } = await load();
    await POST(req({ body: { day: "2026-09-28", run: { ...goodRun, mode: "tutorial", tone_acc: null, per_key: {} } } }));
    expect(rpc.mock.calls.find((c) => c[0] !== "claim_counted_run")![1]).toMatchObject({ p_stats: false, p_streak: false });
  });

  it("accepts a pre-brief-05 body (no runId, unheard, best or words)", async () => {
    const { POST, rpc } = await load();
    const old = { mode: "game", score: 10, gates: 1, outcome: "quit", tone_acc: 0.5, per_key: { "1": { gates: 1, accSum: 0.5 } } };
    expect((await POST(req({ body: { day: "2026-09-28", run: old } }))).status).toBe(200);
    const args = rpc.mock.calls.find((c) => c[0] !== "claim_counted_run")![1];
    expect(args.p_run).toMatch(/^[0-9a-f-]{36}$/);
    expect(args.p_per_key).toEqual({ "1": { gates: 1, accSum: 0.5, unheard: 0, best: 0 } });
  });

  it("never sends a client-supplied time or user id", async () => {
    const { POST, rpc } = await load();
    const body = { day: "2026-09-28", run: { ...goodRun, played_at: "2020-01-01T00:00:00Z", user_id: "evil" } };
    expect((await POST(req({ body }))).status).toBe(200);
    const args = rpc.mock.calls.find((c) => c[0] !== "claim_counted_run")![1];
    expect(args.p_user).toBe("user-1");
    expect(JSON.stringify(args)).not.toContain("2020-01-01");
  });

  it("returns 502 when the database call fails", async () => {
    const { POST } = await load({ rpcError: new Error("db down") });
    expect((await POST(req())).status).toBe(502);
  });

  describe("adopt", () => {
    const adopt = {
      adoptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      runs: 12, gates: 40, best: 3000, streakCurrent: 2, streakBest: 4, streakLastDay: "2026-09-27",
      per_key: { "2": { gates: 10, accSum: 7, unheard: 2, best: 0.95 } },
      wordIds: ["ma1b"],
    };

    it("adds a guest's totals through adopt_guest", async () => {
      const { POST, rpc } = await load({ entitlement: null });
      const res = await POST(req({ body: { kind: "adopt", adopt } }));
      expect(await res.json()).toEqual({ applied: true });
      expect(rpc).toHaveBeenCalledWith("adopt_guest", expect.objectContaining({
        p_user: "user-1", p_adopt: adopt.adoptId, p_runs: 12, p_streak_last_day: "2026-09-27",
      }));
    });

    it("a repeated adoption reports applied:false", async () => {
      const { POST } = await load({ rpcResult: false });
      expect(await (await POST(req({ body: { kind: "adopt", adopt } }))).json()).toEqual({ applied: false });
    });

    it.each([
      ["bad id", { adoptId: "x" }],
      ["runs too high", { runs: 10_001 }],
      ["negative gates", { gates: -1 }],
      ["future streak day", { streakLastDay: "2027-01-01" }],
    ])("returns 400 for %s", async (_n, patch) => {
      const { POST, rpc } = await load();
      expect((await POST(req({ body: { kind: "adopt", adopt: { ...adopt, ...patch } } }))).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("returns 403 for an anonymous session", async () => {
      const { POST } = await load({ user: { id: "u", is_anonymous: true } });
      expect((await POST(req({ body: { kind: "adopt", adopt } }))).status).toBe(403);
    });
  });

  it("rejects a run whose keys claim more heard gates than the run has", async () => {
    const { POST, rpc } = await load();
    const run = { ...goodRun, gates: 3 };
    expect((await POST(req({ body: { ...goodBody, run } }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a run over the gate cap", async () => {
    const { POST } = await load();
    const run = { ...goodRun, gates: 101, per_key: { "1": { gates: 101, accSum: 101, unheard: 0, best: 1 } } };
    expect((await POST(req({ body: { ...goodBody, run } }))).status).toBe(400);
  });

  it("caps counted runs per day, per tier", async () => {
    for (const [entitlement, limit] of [[{ has_access: true }, 100], [{ has_access: false }, 30]] as const) {
      const full = await load({ entitlement, claim: false });
      expect((await full.POST(req())).status).toBe(429);
      expect(full.rpc).toHaveBeenCalledWith("claim_counted_run", expect.objectContaining({ p_limit: limit }));
      expect(full.rpc).not.toHaveBeenCalledWith("record_run", expect.anything());
    }
  });

  it("a retry of a logged run takes no new slot", async () => {
    const { POST, rpc } = await load({ seen: true, claim: false });
    expect((await POST(req())).status).toBe(200);
    expect(rpc).not.toHaveBeenCalledWith("claim_counted_run", expect.anything());
    expect(rpc).toHaveBeenCalledWith("record_run", expect.anything());
  });

  it("adds guest progress only once per account", async () => {
    const adopt = {
      adoptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      runs: 2,
      gates: 4,
      best: 100,
      streakCurrent: 0,
      streakBest: 0,
      streakLastDay: null,
      per_key: { "2": { gates: 4, accSum: 3, unheard: 0, best: 0.9 } },
      wordIds: [],
    };
    const other = await load({ priorAdoption: { adopt_id: "99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee" } });
    const res = await other.POST(req({ body: { kind: "adopt", adopt } }));
    expect(await res.json()).toEqual({ applied: false });
    expect(other.rpc).not.toHaveBeenCalled();

    const retry = await load({ priorAdoption: { adopt_id: adopt.adoptId } });
    await retry.POST(req({ body: { kind: "adopt", adopt } }));
    expect(retry.rpc).toHaveBeenCalledWith("adopt_guest", expect.anything());

    const inflated = await load();
    const bad = { ...adopt, per_key: { "1": { gates: 4, accSum: 4, unheard: 0, best: 1 }, "2": { gates: 4, accSum: 4, unheard: 0, best: 1 } } };
    expect((await inflated.POST(req({ body: { kind: "adopt", adopt: bad } }))).status).toBe(400);
  });
});
