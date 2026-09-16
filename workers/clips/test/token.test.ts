import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_IP, TEST_SECRET, fakeEnv } from "./helpers.ts";
import { verifyTicket } from "../src/tickets.ts";

const verifySupabaseJwt = vi.hoisted(() => vi.fn());
const entitlementsRow = vi.hoisted(() => ({ value: null as { has_access: boolean } | null }));

vi.mock("../src/supabaseJwt.ts", () => ({ verifySupabaseJwt }));
vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: entitlementsRow.value, error: null }),
        }),
      }),
    }),
  }),
}));

const { handleToken } = await import("../src/routes/token.ts");

const req = (auth?: string) =>
  new Request("https://clips.flappytone.com/token", {
    method: "POST",
    headers: {
      "CF-Connecting-IP": TEST_IP,
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
  });

describe("POST /token", () => {
  beforeEach(() => {
    verifySupabaseJwt.mockReset();
    entitlementsRow.value = null;
  });

  it("issues a guest ticket with no Authorization header", async () => {
    const res = await handleToken(req(), fakeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresIn: number; tier: string };
    expect(body.tier).toBe("guest");
    expect(body.expiresIn).toBe(1800);
    expect(await verifyTicket(body.token, TEST_SECRET, TEST_IP)).toEqual({ tier: "guest", ip: TEST_IP });
  });

  it("issues a guest ticket (never a hard failure) for an invalid Supabase JWT", async () => {
    verifySupabaseJwt.mockResolvedValue(null);
    const res = await handleToken(req("garbage"), fakeEnv());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tier: string }).tier).toBe("guest");
  });

  it("treats an anonymous Supabase session as guest, not free", async () => {
    verifySupabaseJwt.mockResolvedValue({ sub: "anon-1", isAnonymous: true });
    const res = await handleToken(req("jwt"), fakeEnv());
    expect(((await res.json()) as { tier: string }).tier).toBe("guest");
  });

  it("issues a free ticket for a permanent account without entitlement", async () => {
    verifySupabaseJwt.mockResolvedValue({ sub: "user-1", isAnonymous: false });
    entitlementsRow.value = { has_access: false };
    const body = (await (await handleToken(req("jwt"), fakeEnv())).json()) as { tier: string; token: string };
    expect(body.tier).toBe("free");
    expect(await verifyTicket(body.token, TEST_SECRET, TEST_IP)).toEqual({
      tier: "free",
      sub: "user-1",
      ip: TEST_IP,
    });
  });

  it("issues a pro ticket when has_access is true", async () => {
    verifySupabaseJwt.mockResolvedValue({ sub: "user-2", isAnonymous: false });
    entitlementsRow.value = { has_access: true };
    expect(((await (await handleToken(req("jwt"), fakeEnv())).json()) as { tier: string }).tier).toBe("pro");
  });

  it("falls back to free when the entitlements row is missing", async () => {
    verifySupabaseJwt.mockResolvedValue({ sub: "user-3", isAnonymous: false });
    entitlementsRow.value = null;
    expect(((await (await handleToken(req("jwt"), fakeEnv())).json()) as { tier: string }).tier).toBe("free");
  });
});
