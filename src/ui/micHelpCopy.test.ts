import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "../lib/inAppBrowser.ts";
import { UA_FIXTURES } from "../lib/inAppBrowser.fixtures.ts";
import type { MicFailureInfo } from "../lib/micFailure.ts";
import {
  MIC_HELP_COPY,
  micHelpLayout,
  micHelpTarget,
  micHelpVariant,
  type MicHelpVariant,
} from "./micHelpCopy.ts";

describe("micHelpTarget", () => {
  it.each([
    ["safariIos", "ios"],
    ["chromeIos", "ios"],
    ["chromeAndroid", "android"],
    ["chromeDesktop", "desktop"],
    ["firefoxDesktop", "desktop"],
    ["lineAndroid", "in-app"],
    ["instagramIos", "in-app"],
  ] as const)("%s -> %s", (key, target) => {
    expect(micHelpTarget(detectInAppBrowser(UA_FIXTURES[key].ua))).toBe(target);
  });
});

const refused = (ms: number, denial: MicFailureInfo["denial"] = "other"): MicFailureInfo => ({
  errorName: "NotAllowedError",
  denial,
  ms,
});
const FAST = refused(200);
const SLOW = refused(4000);

describe("micHelpVariant: copy by cause", () => {
  it.each<[string, keyof typeof UA_FIXTURES, MicFailureInfo | null, MicHelpVariant]>([
    // The priority case: Chrome on iPhone refused in 200 ms, no prompt (iOS mic switch off).
    ["Chrome iOS, fast refusal", "chromeIos", FAST, "ios-chrome-settings"],
    ["Chrome iOS, prompt refused", "chromeIos", SLOW, "ios-chrome-retry"],
    ["Safari iOS, prompt refused", "safariIos", SLOW, "ios-safari-retry"],
    ["Safari iOS, fast refusal (saved Deny)", "safariIos", FAST, "ios-safari-settings"],
    ["Safari iOS, blocked before any request", "safariIos", null, "ios-safari-settings"],
    ["Firefox iOS, fast refusal", "firefoxIos", FAST, "ios-other-settings"],
    ["Firefox iOS, prompt refused", "firefoxIos", SLOW, "ios-other-retry"],
    ["Chrome Android, dismissed", "chromeAndroid", refused(3000, "dismissed"), "dismissed"],
    ["Chrome Android, dismissed fast (re-asked)", "chromeAndroid", refused(100, "dismissed"), "dismissed"],
    ["Chrome Android, denied", "chromeAndroid", refused(100, "denied"), "android-denied"],
    ["Chrome Android, denied by system", "chromeAndroid", refused(100, "system"), "android-system"],
    ["Samsung Internet, denied by system", "samsungAndroid", refused(100, "system"), "android-system"],
    ["Firefox Android, no message detail", "firefoxAndroid", refused(100, "other"), "android-denied"],
    ["Chrome desktop, dismissed", "chromeDesktop", refused(2000, "dismissed"), "dismissed"],
    ["Chrome desktop, denied", "chromeDesktop", refused(100, "denied"), "desktop-denied"],
    ["Chrome desktop, denied by system", "chromeDesktop", refused(100, "system"), "desktop-system"],
    ["Edge desktop, denied", "edgeDesktop", refused(100, "denied"), "desktop-denied"],
    ["Firefox desktop", "firefoxDesktop", refused(100, "other"), "desktop-denied"],
    ["Safari macOS", "safariDesktop", refused(100, "other"), "desktop-denied"],
    ["Chrome desktop, blocked before any request", "chromeDesktop", null, "desktop-denied"],
    ["LINE Android (in-app)", "lineAndroid", FAST, "in-app"],
    ["Instagram iOS (in-app)", "instagramIos", SLOW, "in-app"],
  ])("%s -> %s", (_label, key, failure, variant) => {
    expect(micHelpVariant(UA_FIXTURES[key].ua, failure)).toBe(variant);
  });

  it("treats exactly 1 s as a prompt shown", () => {
    expect(micHelpVariant(UA_FIXTURES.chromeIos.ua, refused(999))).toBe("ios-chrome-settings");
    expect(micHelpVariant(UA_FIXTURES.chromeIos.ua, refused(1000))).toBe("ios-chrome-retry");
  });
});

const VARIANTS: MicHelpVariant[] = [
  "ios-safari-retry",
  "ios-safari-settings",
  "ios-chrome-retry",
  "ios-chrome-settings",
  "ios-other-retry",
  "ios-other-settings",
  "dismissed",
  "android-denied",
  "android-system",
  "desktop-denied",
  "desktop-system",
  "in-app",
];

describe("micHelpLayout", () => {
  it("puts Try again first and Reload second on every iOS panel", () => {
    for (const v of VARIANTS.filter((x) => x.startsWith("ios-"))) {
      const l = micHelpLayout(v);
      expect(l.primary, v).toBe("try_again");
      expect(l.reload, v).toBe(true);
    }
  });

  it("shows the settings steps first only after a refusal with no prompt", () => {
    expect(micHelpLayout("ios-safari-retry").before).toEqual(["retryLead"]);
    expect(micHelpLayout("ios-safari-settings").before).toContain("iosSafariSystem");
    expect(micHelpLayout("ios-chrome-settings").before).toEqual(["iosChromeSystem"]);
    expect(micHelpLayout("ios-chrome-retry").after).toEqual(["iosChromeSystem"]);
  });

  it("shows no settings steps for a dismissed prompt", () => {
    expect(micHelpLayout("dismissed")).toEqual({ before: ["dismissed"], primary: "try_again", reload: false, after: [] });
  });

  it("every line it names exists in both languages", () => {
    for (const v of VARIANTS) {
      const l = micHelpLayout(v);
      for (const k of [...l.before, ...l.after]) {
        expect(MIC_HELP_COPY.en[k], `${v}/${k}`).toBeTruthy();
        expect(MIC_HELP_COPY.zh[k], `${v}/${k}`).toBeTruthy();
      }
    }
  });
});

describe("MIC_HELP_COPY", () => {
  it("has the same keys in both languages, none empty", () => {
    expect(Object.keys(MIC_HELP_COPY.zh).sort()).toEqual(Object.keys(MIC_HELP_COPY.en).sort());
    for (const lang of ["en", "zh"] as const) {
      for (const v of Object.values(MIC_HELP_COPY[lang])) expect(v.length).toBeGreaterThan(0);
    }
  });

  it("names the iOS 18+ Settings path and the Chrome-on-iPhone switch", () => {
    expect(MIC_HELP_COPY.en.iosSafariSystem).toContain("Settings → Apps → Safari → Microphone");
    expect(MIC_HELP_COPY.en.iosChromeSystem).toContain("Settings → Apps → Chrome → turn on Microphone");
    expect(MIC_HELP_COPY.zh.iosChromeSystem).toContain("設定 → App → Chrome");
  });

  it("uses no Simplified-only characters in the Chinese copy (hard rule 9)", () => {
    // Simplified forms of characters this copy uses, and common slips.
    const simplified = /[设许关闭选还开载应权统键别试启这风麦览请复们层页]/;
    for (const v of Object.values(MIC_HELP_COPY.zh)) expect(v).not.toMatch(simplified);
  });
});
