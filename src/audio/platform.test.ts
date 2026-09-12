import { afterEach, describe, expect, it, vi } from "vitest";
import { isChromeIOS, isIOS } from "./platform.ts";

function stubUA(userAgent: string, platform = "iPhone", maxTouchPoints = 5) {
  vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const FIREFOX_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("platform detection", () => {
  it("treats Safari iOS as iOS but not Chrome-iOS (dance runs)", () => {
    stubUA(SAFARI_IOS);
    expect(isIOS()).toBe(true);
    expect(isChromeIOS()).toBe(false);
    expect(isIOS() && !isChromeIOS()).toBe(true);
  });

  it("gates the dance off Chrome iOS", () => {
    stubUA(CHROME_IOS);
    expect(isIOS()).toBe(true);
    expect(isChromeIOS()).toBe(true);
    expect(isIOS() && !isChromeIOS()).toBe(false);
  });

  it("gates the dance off Firefox iOS", () => {
    stubUA(FIREFOX_IOS);
    expect(isChromeIOS()).toBe(true);
    expect(isIOS() && !isChromeIOS()).toBe(false);
  });

  it("is not iOS (and not Chrome-iOS) on desktop", () => {
    stubUA(DESKTOP, "MacIntel", 0);
    expect(isIOS()).toBe(false);
    expect(isChromeIOS()).toBe(false);
  });
});
