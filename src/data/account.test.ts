/**
 * Account flows: in-place signup, the sync's name pull-down, and the one-time
 * guest -> account adoption (brief 05) — the one step that could count a
 * player's practice twice, or lose it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  adoptGuestProgress,
  loadGuestSnapshot,
  signInWithPassword,
  signUpWithPassword,
  startEmailCode,
  startExistingAccountCode,
  startGoogleSignIn,
  verifyEmailCode,
  snapshotGuestProgress,
  syncAccount,
} from "./account.ts";
import { cacheFromServer, loadRunHistory, recordRun } from "../game/runHistory.ts";
import { applyGate, newRunStats } from "../game/scoring.ts";
import type { RunSnapshot } from "../game/run.ts";
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

describe("guest adoption (brief 05)", () => {
  let storageMap: Record<string, string>;
  beforeEach(() => {
    vi.mocked(supabaseModule.warn).mockReset();
    storageMap = {};
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

  function playGuestRun(score: number): void {
    const stats = applyGate(newRunStats(), [2], "good", 0.7);
    stats.score = score;
    recordRun({ stats, wordIds: ["ma2b"] } as unknown as RunSnapshot, "finished");
  }

  function adoptClient() {
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } };
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client as never);
  }

  it("snapshots an unowned guest store while signed out, with its totals", async () => {
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));
    playGuestRun(400);
    playGuestRun(900);
    await snapshotGuestProgress();
    const snap = loadGuestSnapshot()!;
    expect(snap).toMatchObject({ runs: 2, best: 900, attempted: false, wordIds: ["ma2b"] });
    expect(snap.per_key["2"]).toMatchObject({ gates: 2, unheard: 0 });
  });

  it("never snapshots a store that is already an account's cache", async () => {
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));
    cacheFromServer({ totalRuns: 9, bestScore: 1, totalGates: 1, wordIds: [], perTarget: [], recent: [] }, "u0");
    await snapshotGuestProgress();
    expect(loadGuestSnapshot()).toBeNull();
  });

  it("adopts once: posts the snapshot, then clears it and the guest store", async () => {
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));
    playGuestRun(400);
    await snapshotGuestProgress();
    const adoptId = loadGuestSnapshot()!.adoptId;

    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));
    adoptClient();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await adoptGuestProgress()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ kind: "adopt", adopt: { adoptId, runs: 1, best: 400 } });
    expect("attempted" in body.adopt).toBe(false);
    expect(loadGuestSnapshot()).toBeNull();
    expect(loadRunHistory().totalRuns).toBe(0);

    // A second sync has nothing left to add.
    expect(await adoptGuestProgress()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the snapshot (same id) and the guest store when the post fails", async () => {
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));
    playGuestRun(400);
    await snapshotGuestProgress();
    const adoptId = loadGuestSnapshot()!.adoptId;

    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session("permanent"));
    adoptClient();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await adoptGuestProgress()).toBe(false);
    expect(loadGuestSnapshot()).toMatchObject({ adoptId, attempted: true });
    expect(loadRunHistory().totalRuns).toBe(1);

    // A later sign-in attempt must not mint a new id for an already-tried snapshot.
    vi.mocked(supabaseModule.currentSession).mockResolvedValue(session(null));
    await snapshotGuestProgress();
    expect(loadGuestSnapshot()!.adoptId).toBe(adoptId);
  });
});

/**
 * Brief 30: the flow choice. An anonymous guest is upgraded in place (same
 * user id); only a signed-out player may create or enter another user.
 */
describe("sign-in flow choice (anonymous vs signed out)", () => {
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

  /** The calls that would leave the anonymous user behind. */
  function expectNoReplacement(f: ReturnType<typeof fakeClient>) {
    expect(f.signInWithOtp).not.toHaveBeenCalled();
    expect(f.signUp).not.toHaveBeenCalled();
    expect(f.signInWithOAuth).not.toHaveBeenCalled();
  }

  it("code, anonymous: updateUser + email_change, never signInWithOtp", async () => {
    const f = setup("anonymous");
    const sent = await startEmailCode(" a@b.com ");
    expect(sent).toEqual({ ok: true, otpType: "email_change" });
    expect(f.updateUser).toHaveBeenCalledWith({ email: "a@b.com" }, { emailRedirectTo: "https://flappytone.com/app" });
    await verifyEmailCode("a@b.com", "123 456", "email_change", false);
    expect(f.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "email_change" });
    expect(f.refreshSession).toHaveBeenCalled();
    expectNoReplacement(f);
  });

  it("code, signed out: signInWithOtp (creates the account) + email", async () => {
    const f = setup(null);
    const sent = await startEmailCode("a@b.com");
    expect(sent).toEqual({ ok: true, otpType: "email" });
    expect(f.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.com",
      options: { emailRedirectTo: "https://flappytone.com/app", shouldCreateUser: true },
    });
    expect(f.updateUser).not.toHaveBeenCalled();
    await verifyEmailCode("a@b.com", "123456", "email", false);
    expect(f.verifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "email" });
  });

  it("code, anonymous, email taken: reports email_exists and does not fall back", async () => {
    const f = setup("anonymous");
    f.updateUser.mockResolvedValueOnce({ error: { message: "A user with this email address has already been registered", code: "email_exists" } });
    const sent = await startEmailCode("taken@b.com");
    expect(sent).toMatchObject({ ok: false, code: "email_exists" });
    expectNoReplacement(f);
  });

  it("existing-account code is only the explicit choice, and never creates a user", async () => {
    const f = setup("anonymous");
    await startExistingAccountCode("taken@b.com");
    expect(f.signInWithOtp).toHaveBeenCalledWith({
      email: "taken@b.com",
      options: { emailRedirectTo: "https://flappytone.com/app", shouldCreateUser: false },
    });
  });

  it("a short code is refused before any network call", async () => {
    const f = setup(null);
    const r = await verifyEmailCode("a@b.com", "12", "email", false);
    expect(r).toMatchObject({ ok: false, code: "code_too_short" });
    expect(f.verifyOtp).not.toHaveBeenCalled();
  });

  it("Google, anonymous: linkIdentity, never signInWithOAuth", async () => {
    const f = setup("anonymous");
    expect((await startGoogleSignIn()).ok).toBe(true);
    expect(f.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://flappytone.com/app" },
    });
    expectNoReplacement(f);
  });

  it("Google, signed out: signInWithOAuth", async () => {
    const f = setup(null);
    await startGoogleSignIn();
    expect(f.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://flappytone.com/app" },
    });
    expect(f.linkIdentity).not.toHaveBeenCalled();
  });

  it("Google, anonymous, explicit sign-in to an existing account: signInWithOAuth", async () => {
    const f = setup("anonymous");
    await startGoogleSignIn({ existing: true });
    expect(f.signInWithOAuth).toHaveBeenCalled();
    expect(f.linkIdentity).not.toHaveBeenCalled();
  });

  it("password signup, anonymous: updateUser, never signUp", async () => {
    const f = setup("anonymous");
    await signUpWithPassword("a@b.com", "longenough", false);
    expect(f.updateUser).toHaveBeenCalledWith({ email: "a@b.com", password: "longenough" });
    expectNoReplacement(f);
  });

  it("password login, signed out: signInWithPassword only", async () => {
    const f = setup(null);
    await signInWithPassword("a@b.com", "pw");
    expect(f.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expectNoReplacement(f);
  });

  it("a failure is a result, never a throw", async () => {
    const f = setup(null);
    f.signInWithOAuth.mockRejectedValueOnce(new Error("offline"));
    expect(await startGoogleSignIn()).toEqual({ ok: false, reason: "network error" });
    f.verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    expect(await verifyEmailCode("a@b.com", "123456", "email", false)).toMatchObject({ ok: false, code: "otp_expired" });
  });
});
