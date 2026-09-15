import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const currentSession = vi.fn();
vi.mock("../data/supabase.ts", () => ({
  currentSession: () => currentSession(),
  warn: () => undefined,
}));

const BASE = "https://clips.example.com";

/**
 * The module caches its ticket in module scope, so every test needs a fresh
 * copy — and the base URL is read at import time, so it has to be stubbed
 * before the import, not after.
 */
async function load(baseUrl: string | null = BASE) {
  vi.resetModules();
  vi.stubEnv("VITE_CLIPS_BASE_URL", baseUrl ?? "");
  return await import("./clipToken.ts");
}

function tokenResponse(token = "tok-1", expiresIn = 1800): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ token, expiresIn, tier: "guest" }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => tokenResponse());
  vi.stubGlobal("fetch", fetchMock);
  currentSession.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getPlayTicket", () => {
  it("POSTs /token without Authorization when there is no session", async () => {
    const { getPlayTicket } = await load();
    expect(await getPlayTicket()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/token`);
    expect(init.method).toBe("POST");
    expect((init.headers ?? {}) as Record<string, string>).not.toHaveProperty("Authorization");
  });

  it("sends the session's access token when one exists", async () => {
    currentSession.mockResolvedValue({ access_token: "jwt-abc" });
    const { getPlayTicket } = await load();
    await getPlayTicket();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc");
  });

  it("does not refetch within the ticket's TTL", async () => {
    const { getPlayTicket } = await load();
    expect(await getPlayTicket()).toBe("tok-1");
    expect(await getPlayTicket()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const { getPlayTicket } = await load();
    const [a, b, c] = await Promise.all([getPlayTicket(), getPlayTicket(), getPlayTicket()]);
    expect([a, b, c]).toEqual(["tok-1", "tok-1", "tok-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the ticket is inside the 2-minute expiry margin", async () => {
    vi.useFakeTimers();
    const { getPlayTicket } = await load();
    await getPlayTicket();
    fetchMock.mockResolvedValue(tokenResponse("tok-2"));
    // 1800s TTL, 120s margin: still fresh at 1600s, stale at 1700s.
    vi.advanceTimersByTime(1600_000);
    expect(await getPlayTicket()).toBe("tok-1");
    vi.advanceTimersByTime(100_000);
    expect(await getPlayTicket()).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null and never throws when the fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { getPlayTicket } = await load();
    await expect(getPlayTicket()).resolves.toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const { getPlayTicket } = await load();
    expect(await getPlayTicket()).toBeNull();
  });

  it("returns null on a malformed body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tier: "guest" }),
    } as unknown as Response);
    const { getPlayTicket } = await load();
    expect(await getPlayTicket()).toBeNull();
  });

  it("returns null without fetching when the base URL is unset", async () => {
    const { getPlayTicket, CLIPS_BASE_URL } = await load(null);
    expect(CLIPS_BASE_URL).toBeNull();
    expect(await getPlayTicket()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache a failure — the next call retries", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { getPlayTicket } = await load();
    expect(await getPlayTicket()).toBeNull();
    expect(await getPlayTicket()).toBe("tok-1");
  });
});

describe("invalidatePlayTicket", () => {
  it("forces the next call to refetch", async () => {
    const { getPlayTicket, invalidatePlayTicket } = await load();
    expect(await getPlayTicket()).toBe("tok-1");
    fetchMock.mockResolvedValue(tokenResponse("tok-2"));
    invalidatePlayTicket();
    expect(await getPlayTicket()).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale in-flight mint re-cache after invalidation", async () => {
    const { getPlayTicket, invalidatePlayTicket } = await load();
    let resolveFetch!: (res: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    // Start a mint (e.g. the pre-signup ticket warm-up) and, while it is still
    // in flight, invalidate — simulating a signup landing before that request
    // resolves.
    const inFlight = getPlayTicket();
    invalidatePlayTicket();
    // The stale request now resolves with a guest ticket.
    resolveFetch(tokenResponse("stale-guest-tok"));
    expect(await inFlight).toBe("stale-guest-tok");
    // It must not have been cached — the next call issues a fresh /token
    // request rather than returning the stale one.
    fetchMock.mockResolvedValueOnce(tokenResponse("fresh-tok"));
    expect(await getPlayTicket()).toBe("fresh-tok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
