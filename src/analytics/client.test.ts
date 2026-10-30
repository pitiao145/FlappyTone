import { beforeEach, describe, expect, it, vi } from "vitest";

const initPostHog = vi.fn();
vi.mock("./posthog.ts", () => ({
  captureGameEvent: vi.fn(),
  initPostHog: (...args: unknown[]) => initPostHog(...args),
  setCalibrationProperties: vi.fn(),
  setDeviceProperty: vi.fn(),
  setInAppBrowserProperty: vi.fn(),
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
