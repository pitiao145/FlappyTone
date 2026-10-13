import { beforeEach, describe, expect, it } from "vitest";
import {
  INAPP_DISMISS_KEY,
  INAPP_DISMISS_MS,
  chromeIntentUrl,
  detectInAppBrowser,
  dismissInAppPrompt,
  isInAppPromptDismissed,
  resetInAppPromptMemory,
} from "./inAppBrowser.ts";

const UA = {
  igIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.5.19.89 (iPhone14,5; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 612560424)",
  igAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 340.0.0.35.109 Android (33/13; 420dpi; 1080x2205; Google/google; Pixel 7; panther; panther; en_US; 600403013)",
  ttIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US RevealType/Dialog",
  ttAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 trill_340104 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.1.4 ByteLocale/en BytedanceWebview/d8a21c6",
  fbIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/460.0.0.45.108;FBBV/590000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  fbAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.45.108;]",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  firefoxDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
  firefoxAndroid: "Mozilla/5.0 (Android 13; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
};

describe("detectInAppBrowser", () => {
  it.each([
    ["igIos", "instagram", "ios"],
    ["igAndroid", "instagram", "android"],
    ["ttIos", "tiktok", "ios"],
    ["ttAndroid", "tiktok", "android"],
    ["fbIos", "facebook", "ios"],
    ["fbAndroid", "facebook", "android"],
  ] as const)("%s -> %s on %s", (key, app, platform) => {
    expect(detectInAppBrowser(UA[key])).toEqual({ app, platform });
  });

  it.each([
    ["safariIos", "ios"],
    ["chromeAndroid", "android"],
    ["chromeDesktop", "other"],
    ["firefoxDesktop", "other"],
    ["firefoxAndroid", "android"],
    ["firefoxIos", "ios"],
  ] as const)("normal browser %s -> null", (key, platform) => {
    expect(detectInAppBrowser(UA[key])).toEqual({ app: null, platform });
  });

  it("handles an empty UA", () => {
    expect(detectInAppBrowser("")).toEqual({ app: null, platform: "other" });
  });
});

describe("chromeIntentUrl", () => {
  it("keeps path and utm params, drops the fragment", () => {
    expect(
      chromeIntentUrl("https://flappytone.com/app?utm_source=instagram&utm_medium=social#x"),
    ).toBe(
      "intent://flappytone.com/app?utm_source=instagram&utm_medium=social#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
  it("returns null for a bad URL", () => {
    expect(chromeIntentUrl("not a url")).toBeNull();
  });
});

describe("dismissal memory", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  beforeEach(() => resetInAppPromptMemory());

  it("is not dismissed by default", () => {
    expect(isInAppPromptDismissed(1000, mem())).toBe(false);
  });
  it("stays dismissed for 7 days, then expires", () => {
    const s = mem();
    dismissInAppPrompt(1000, s);
    expect(s.getItem(INAPP_DISMISS_KEY)).toBe("1000");
    expect(isInAppPromptDismissed(1000 + INAPP_DISMISS_MS - 1, s)).toBe(true);
    expect(isInAppPromptDismissed(1000 + INAPP_DISMISS_MS, s)).toBe(false);
  });
  it("falls back to memory when storage is unavailable", () => {
    dismissInAppPrompt(1000, null);
    expect(isInAppPromptDismissed(2000, null)).toBe(true);
  });
  it("falls back to memory when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    dismissInAppPrompt(1000, broken);
    expect(isInAppPromptDismissed(2000, broken)).toBe(true);
  });
  it("ignores a corrupt stored value", () => {
    const s = mem();
    s.setItem(INAPP_DISMISS_KEY, "garbage");
    expect(isInAppPromptDismissed(2000, s)).toBe(false);
  });
});
