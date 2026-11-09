import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initPostHog = vi.fn();
vi.mock("./posthog.ts", () => ({
  captureGameEvent: vi.fn(),
  initPostHog: (...args: unknown[]) => initPostHog(...args),
  setDeviceProperty: vi.fn(),
  setFirstSeoTouch: vi.fn(),
  setPostHogConsent: vi.fn(),
  setSpeechStyleProperty: vi.fn(),
}));

describe("initAnalytics", () => {
  beforeEach(() => {
    vi.resetModules();
    initPostHog.mockClear();
  });

  it("passes a page's $pageview props to the one start call", async () => {
    const { initAnalytics } = await import("./client.ts");
    const props = { page_type: "landing", lang: "en", angle: "general", page_path: "/" } as const;
    initAnalytics(props);
    expect(initPostHog).toHaveBeenCalledTimes(1);
    expect(initPostHog.mock.calls[0][1]).toEqual(props);
  });

  it("ignores a second call, so the first one must carry the props", async () => {
    const { initAnalytics } = await import("./client.ts");
    initAnalytics();
    initAnalytics({ page_type: "landing", lang: "en", angle: "general", page_path: "/" });
    expect(initPostHog).toHaveBeenCalledTimes(1);
    expect(initPostHog.mock.calls[0][1]).toBeUndefined();
  });
});

describe("initAnalytics and the Usage analytics switch (brief 35)", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    vi.resetModules();
    initPostHog.mockClear();
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    } as Storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("an old 'Share game data' off (toneflap.sharedata.v1 = off) is analytics off", async () => {
    store["toneflap.sharedata.v1"] = "off";
    const { initAnalytics } = await import("./client.ts");
    initAnalytics(undefined, { waitForAccount: true });
    expect(initPostHog.mock.calls[0][0]).toBe("off");
  });

  it("an old off saved under the account (brief 34 keys) is off too", async () => {
    store["toneflap.account.v1"] = JSON.stringify({ id: "A" });
    store["toneflap.sharedata.v1@A"] = "off";
    const { initAnalytics } = await import("./client.ts");
    initAnalytics();
    expect(initPostHog.mock.calls[0][0]).toBe("off");
  });

  it("/app waits for the account unless the browser already says off", async () => {
    const { initAnalytics } = await import("./client.ts");
    initAnalytics(undefined, { waitForAccount: true });
    expect(initPostHog.mock.calls[0][0]).toBe("pending");
  });

  it("site pages start on by default", async () => {
    const { initAnalytics } = await import("./client.ts");
    initAnalytics();
    expect(initPostHog.mock.calls[0][0]).toBe("on");
  });
});
