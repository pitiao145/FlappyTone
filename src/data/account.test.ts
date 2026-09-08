/**
 * `mergeAggregates` is the one function in the sync path that can destroy
 * something irreplaceable. Everything else fails loudly or fails safe; a merge
 * bug quietly returns a smaller number and a player's practice is gone with no
 * error anywhere. So it is pure, and it is tested directly.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  EMPTY_AGGREGATES,
  mergeAggregates,
  pushAggregates,
  signUpWithPassword,
  type Aggregates,
} from "./account.ts";
import * as supabaseModule from "./supabase.ts";

vi.mock("./supabase.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase.ts")>();
  return {
    ...actual,
    getSupabase: vi.fn(),
    currentSession: vi.fn(),
    warn: vi.fn(),
  };
});

function aggregates(over: Partial<Aggregates> = {}): Aggregates {
  return { ...EMPTY_AGGREGATES, ...over };
}

function fakeClient() {
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const signUp = vi.fn().mockResolvedValue({ error: null });
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: { updateUser, signUp, signInWithOtp, refreshSession },
    from: vi.fn(() => ({
      upsert,
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
    })),
  };
  return { client, updateUser, signUp, signInWithOtp, refreshSession, upsert };
}

function session(status: "anonymous" | "permanent" | null) {
  if (status === null) return null;
  return {
    access_token: "t",
    user: { id: "u1", is_anonymous: status === "anonymous", email: null },
  } as unknown as Awaited<ReturnType<typeof supabaseModule.currentSession>>;
}

describe("signUpWithPassword", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
  });

  it("upgrades an anonymous user in place, never signUp/signInWithOtp", async () => {
    const { client, updateUser, signUp, signInWithOtp } = fakeClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("anonymous"));

    const result = await signUpWithPassword("a@b.com", "longenough", false);

    expect(updateUser).toHaveBeenCalledWith({ email: "a@b.com", password: "longenough" });
    expect(signUp).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("uses signUp for a signed-out user", async () => {
    const { client, updateUser, signUp } = fakeClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));

    const result = await signUpWithPassword("a@b.com", "longenough", false);

    expect(signUp).toHaveBeenCalledWith({ email: "a@b.com", password: "longenough" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("still returns ok when the post-signup sync fails", async () => {
    const { client } = fakeClient();
    // Session stays anonymous even after "signup" — syncAccount requires
    // "permanent" and so fails here, standing in for any sync failure.
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("anonymous"));

    const result = await signUpWithPassword("a@b.com", "longenough", false);
    expect(result.ok).toBe(true);
  });

  it("rejects a short password before any network call", async () => {
    const { client, updateUser, signUp } = fakeClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("anonymous"));

    const result = await signUpWithPassword("a@b.com", "short", false);

    expect(result).toEqual({ ok: false, reason: "password must be at least 8 characters" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("pushAggregates", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
  });

  // Tracks call order across tables: only `profiles` matters for the
  // upsert-before-update ordering this bug fix depends on.
  function orderedClient(opts: { upsertError?: { message: string } } = {}) {
    const calls: string[] = [];
    const profileUpsert = vi.fn((..._args: unknown[]) => {
      calls.push("upsert");
      return Promise.resolve({ error: opts.upsertError ?? null });
    });
    const profileUpdate = vi.fn(() => {
      calls.push("update");
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });
    const toneUpsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "profiles") return { upsert: profileUpsert, update: profileUpdate };
        if (table === "tone_stats") return { upsert: toneUpsert };
        throw new Error(`unexpected table ${table}`);
      }),
    };
    return { client, calls, profileUpsert, profileUpdate, toneUpsert };
  }

  it("inserts the profile row (ignoreDuplicates upsert) before updating it", async () => {
    const { client, calls, profileUpsert, profileUpdate } = orderedClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));

    const result = await pushAggregates(aggregates());

    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      { onConflict: "id", ignoreDuplicates: true },
    );
    expect(profileUpdate).toHaveBeenCalled();
    expect(calls).toEqual(["upsert", "update"]);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false and skips the update when the insert-if-absent upsert errors", async () => {
    const { client, calls, profileUpdate } = orderedClient({
      upsertError: { message: "boom" },
    });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));

    const result = await pushAggregates(aggregates());

    expect(result).toEqual({ ok: false, reason: "boom" });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(calls).toEqual(["upsert"]);
  });
});

describe("mergeAggregates", () => {
  it("keeps the larger of every scalar", () => {
    const a = aggregates({ bestScore: 1200, totalRuns: 3, totalGates: 40, streakBest: 5 });
    const b = aggregates({ bestScore: 900, totalRuns: 11, totalGates: 12, streakBest: 2 });
    expect(mergeAggregates(a, b)).toMatchObject({
      bestScore: 1200,
      totalRuns: 11,
      totalGates: 40,
      streakBest: 5,
    });
  });

  it("is symmetric — neither side is privileged", () => {
    const a = aggregates({ bestScore: 1200, totalRuns: 3 });
    const b = aggregates({ bestScore: 900, totalRuns: 11 });
    expect(mergeAggregates(a, b)).toEqual(mergeAggregates(b, a));
  });

  it("unions tones present on only one side", () => {
    const a = aggregates({
      perTone: [{ tone: 1, attempts: 10, unheard: 1, accSum: 7, best: 0.9 }],
    });
    const b = aggregates({
      perTone: [{ tone: 3, attempts: 4, unheard: 0, accSum: 2, best: 0.5 }],
    });
    const merged = mergeAggregates(a, b);
    expect(merged.perTone.map((t) => t.tone)).toEqual([1, 3]);
  });

  it("merges a tone held by both, field by field", () => {
    const a = aggregates({
      perTone: [{ tone: 2, attempts: 20, unheard: 5, accSum: 14, best: 0.6 }],
    });
    const b = aggregates({
      perTone: [{ tone: 2, attempts: 8, unheard: 7, accSum: 18, best: 0.95 }],
    });
    expect(mergeAggregates(a, b).perTone[0]).toEqual({
      tone: 2,
      attempts: 20,
      unheard: 7,
      accSum: 18,
      best: 0.95,
    });
  });

  it("never returns less than either input — the property that actually matters", () => {
    const a = aggregates({
      bestScore: 500,
      totalRuns: 9,
      perTone: [{ tone: 4, attempts: 3, unheard: 0, accSum: 2, best: 0.7 }],
    });
    const merged = mergeAggregates(a, EMPTY_AGGREGATES);
    expect(merged.bestScore).toBeGreaterThanOrEqual(a.bestScore);
    expect(merged.totalRuns).toBeGreaterThanOrEqual(a.totalRuns);
    expect(merged.perTone[0].best).toBeGreaterThanOrEqual(a.perTone[0].best);
  });

  it("returns tones in a stable order regardless of input order", () => {
    const a = aggregates({
      perTone: [
        { tone: 4, attempts: 1, unheard: 0, accSum: 0, best: 0 },
        { tone: 1, attempts: 1, unheard: 0, accSum: 0, best: 0 },
      ],
    });
    expect(mergeAggregates(a, EMPTY_AGGREGATES).perTone.map((t) => t.tone)).toEqual([1, 4]);
  });
});
