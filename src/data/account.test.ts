/**
 * Account flows: sign-up and sign-in (no anonymous upgrade since the guest
 * paths were removed after brief 34) and the sync's name pull-down.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  signInWithPassword,
  signUpWithPassword,
  startEmailCode,
  startGoogleSignIn,
  verifyEmailCode,
  syncAccount,
} from "./account.ts";
import { displayName } from "./leaderboard.ts";
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

function fakeClient() {
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const signUp = vi.fn().mockResolvedValue({ error: null });
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
  const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
  const linkIdentity = vi.fn().mockResolvedValue({ data: {}, error: null });
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
  const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: null });
  const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      updateUser,
      signUp,
      signInWithOtp,
      refreshSession,
      signInWithOAuth,
      linkIdentity,
      verifyOtp,
      signInWithPassword,
      getSession,
    },
    from: vi.fn(() => ({
      upsert,
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
    })),
  };
  return {
    client,
    updateUser,
    signUp,
    signInWithOtp,
    refreshSession,
    signInWithOAuth,
    linkIdentity,
    verifyOtp,
    signInWithPassword,
    upsert,
  };
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

  it("uses signUp, also from an old anonymous session (no in-place upgrade)", async () => {
    const { client, updateUser, signUp } = fakeClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("anonymous"));

    const result = await signUpWithPassword("a@b.com", "longenough", false);

    expect(signUp).toHaveBeenCalledWith({ email: "a@b.com", password: "longenough" });
    expect(updateUser).not.toHaveBeenCalled();
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

describe("syncAccount name pull-down", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
    const storageMap: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storageMap[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMap[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMap[key];
      },
    } as Storage);
  });

  function syncClient(remoteDisplayName: string | null) {
    const profileSelect = {
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            best_score: 0,
            total_runs: 0,
            total_gates: 0,
            streak_current: 0,
            streak_best: 0,
            display_name: remoteDisplayName,
          },
          error: null,
        }),
      })),
    };
    const toneSelect = { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const runChain: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order"]) runChain[m] = vi.fn(() => runChain);
    runChain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const profileUpsert = vi.fn().mockResolvedValue({ error: null });
    const profileUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const toneUpsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return { select: () => profileSelect, upsert: profileUpsert, update: profileUpdate };
        }
        if (table === "tone_accuracy_stats") return { select: () => toneSelect, upsert: toneUpsert };
        if (table === "run_log") return { select: () => runChain };
        throw new Error(`unexpected table ${table}`);
      }),
    };
    return { client, profileUpsert };
  }

  it("overwrites the local cached name with the server's when the server has one", async () => {
    const { client, profileUpsert } = syncClient("ServerName99");
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));

    const before = displayName();
    expect(before).not.toBe("ServerName99");

    await syncAccount();

    expect(displayName()).toBe("ServerName99");
    // The push (ensure-step upsert) must not have been asked to write the
    // server's own name back up as if it came from this device.
    expect(profileUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "ServerName99" }),
      expect.anything(),
    );
  });

  it("does not push the local name up when the server already has a name", async () => {
    const { client, profileUpsert } = syncClient("ServerName99");
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));
    const local = displayName();

    await syncAccount();

    // The ensure-step still runs (ignoreDuplicates, harmless on
    // an existing row) but must carry this device's name, never overwriting
    // the server's — ignoreDuplicates is what makes that safe either way.
    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", display_name: local }),
      { onConflict: "id", ignoreDuplicates: true },
    );
  });

  it("leaves the local cache alone when the server has no name", async () => {
    const { client } = syncClient(null);
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));

    const before = displayName();
    await syncAccount();
    expect(displayName()).toBe(before);
  });
});

/** Brief 30's flows, with every player signing in to their own account. */
describe("sign-in flows", () => {
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
    vi.stubGlobal("window", { location: { origin: "https://flappytone.com" } });
  });

  function setup(status: "anonymous" | null) {
    const fake = fakeClient();
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(fake.client as never);
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(status));
    return fake;
  }

  it("code: signInWithOtp (creates the account) + email, even from an anonymous session", async () => {
    for (const status of [null, "anonymous"] as const) {
      const f = setup(status);
      expect(await startEmailCode(" a@b.com ")).toEqual({ ok: true });
      expect(f.signInWithOtp).toHaveBeenCalledWith({
        email: "a@b.com",
        options: { emailRedirectTo: "https://flappytone.com/app", shouldCreateUser: true },
      });
      expect(f.updateUser).not.toHaveBeenCalled();
      await verifyEmailCode("a@b.com", "123 456", false);
      expect(f.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "email" });
    }
  });

  it("a short code is refused before any network call", async () => {
    const f = setup(null);
    const r = await verifyEmailCode("a@b.com", "12", false);
    expect(r).toMatchObject({ ok: false, code: "code_too_short" });
    expect(f.verifyOtp).not.toHaveBeenCalled();
  });

  it("Google: signInWithOAuth, never linkIdentity", async () => {
    for (const status of [null, "anonymous"] as const) {
      const f = setup(status);
      expect((await startGoogleSignIn()).ok).toBe(true);
      expect(f.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "https://flappytone.com/app" },
      });
      expect(f.linkIdentity).not.toHaveBeenCalled();
    }
  });

  it("password login: signInWithPassword only", async () => {
    const f = setup(null);
    await signInWithPassword("a@b.com", "pw");
    expect(f.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(f.updateUser).not.toHaveBeenCalled();
  });

  it("a failure is a result, never a throw", async () => {
    const f = setup(null);
    f.signInWithOAuth.mockRejectedValueOnce(new Error("offline"));
    expect(await startGoogleSignIn()).toEqual({ ok: false, reason: "network error" });
    f.verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    expect(await verifyEmailCode("a@b.com", "123456", false)).toMatchObject({ ok: false, code: "otp_expired" });
  });
});
