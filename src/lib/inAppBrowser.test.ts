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
import { UA_FIXTURES } from "./inAppBrowser.fixtures.ts";

const ALL_APPS = [
  "instagram", "facebook", "threads", "line", "wechat", "tiktok", "linkedin", "snapchat",
  "pinterest", "reddit", "x", "kakaotalk", "google-app", "webview-android", "webview-ios", "none",
] as const;

describe("detectInAppBrowser", () => {
  it.each(Object.entries(UA_FIXTURES))("%s", (_name, f) => {
    expect(detectInAppBrowser(f.ua)).toEqual({ app: f.app, platform: f.platform });
  });

  it("covers every app value with a fixture", () => {
    const seen = new Set(Object.values(UA_FIXTURES).map((f) => f.app));
    for (const app of ALL_APPS) expect(seen.has(app), app).toBe(true);
  });

  it("handles an empty UA", () => {
    expect(detectInAppBrowser("")).toEqual({ app: "none", platform: "other" });
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
