import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "../lib/inAppBrowser.ts";
import { UA_FIXTURES } from "../lib/inAppBrowser.fixtures.ts";
import { MIC_HELP_COPY, micHelpTarget } from "./micHelpCopy.ts";

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

describe("MIC_HELP_COPY", () => {
  it("has the same keys in both languages, none empty", () => {
    expect(Object.keys(MIC_HELP_COPY.zh).sort()).toEqual(Object.keys(MIC_HELP_COPY.en).sort());
    for (const lang of ["en", "zh"] as const) {
      for (const v of Object.values(MIC_HELP_COPY[lang])) expect(v.length).toBeGreaterThan(0);
    }
  });
});
