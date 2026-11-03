import { describe, expect, it } from "vitest";
import { PH_ALLOW, sanitizeGameProperties, scrubNameFromUrls, stripPersonUrls, withPageViewProps, inAppBrowserProperties, displayModeProperties } from "./posthog.ts";

describe("sanitizeGameProperties", () => {
  it("passes through our own event fields untouched", () => {
    expect(sanitizeGameProperties({ tone: 3, outcome: "ok", acc: 0.8 })).toEqual({
      tone: 3,
      outcome: "ok",
      acc: 0.8,
    });
  });

  it("keeps only country-level geo, per CLAUDE.md's one deliberate exception", () => {
    expect(
      sanitizeGameProperties({
        $geoip_country_name: "Taiwan",
        $geoip_country_code: "TW",
      }),
    ).toEqual({ $geoip_country_name: "Taiwan", $geoip_country_code: "TW" });
  });

  it("drops city, region, lat/long and every other geoip field", () => {
    expect(
      sanitizeGameProperties({
        $geoip_city_name: "Taipei",
        $geoip_subdivision_1_name: "Taipei City",
        $geoip_latitude: 25.03,
        $geoip_longitude: 121.56,
        $geoip_time_zone: "Asia/Taipei",
        $geoip_postal_code: "100",
      }),
    ).toEqual({});
  });

  it("keeps the allowlisted page, device and session properties", () => {
    const allowed = Object.fromEntries([...PH_ALLOW].map((k) => [k, "v"]));
    expect(sanitizeGameProperties(allowed)).toEqual(allowed);
    expect(PH_ALLOW).toContain("$host");
    expect(PH_ALLOW).toContain("$raw_user_agent");
    expect(PH_ALLOW).toContain("$session_id");
  });

  it("drops $current_url, $referrer, element props and unknown $ properties", () => {
    expect(
      sanitizeGameProperties({
        $current_url: "https://flappytone.example/app?n=Pierre",
        $referrer: "https://example.com/?q=x",
        $session_entry_url: "https://flappytone.example/app?n=Pierre",
        $initial_current_url: "https://flappytone.example/",
        $el_text: "typed",
        $device_id: "abc-123",
        $foo: 1,
      }),
    ).toEqual({});
  });

  it("mixes both rules correctly on one event", () => {
    expect(
      sanitizeGameProperties({
        tone: 4,
        outcome: "perfect",
        $geoip_country_code: "TW",
        $current_url: "https://flappytone.example/game",
        $host: "flappytone.com",
      }),
    ).toEqual({ tone: 4, outcome: "perfect", $geoip_country_code: "TW", $host: "flappytone.com" });
  });
});

describe("withPageViewProps", () => {
  const props = { page_type: "hub", lang: "en", angle: "learner", page_path: "/chinese-tones" } as const;
  const cr = (event: string) => ({ uuid: "u", event, properties: { $current_url: "x" } });

  it("adds the page's props to its $pageview", () => {
    expect(withPageViewProps(cr("$pageview"), props).properties).toEqual({
      $current_url: "x",
      ...props,
    });
  });

  it("leaves every other event, and pages without props, alone", () => {
    expect(withPageViewProps(cr("landed"), props).properties).toEqual({ $current_url: "x" });
    expect(withPageViewProps(cr("$pageview"), undefined).properties).toEqual({ $current_url: "x" });
  });
});

describe("stripPersonUrls", () => {
  it("drops full URLs and referrers, keeps host, path, referring domain and UTM", () => {
    expect(
      stripPersonUrls({
        $initial_current_url: "https://flappytone.com/app?n=Pierre",
        $initial_referrer: "https://x.com/?q=1",
        $current_url: "https://flappytone.com/app?n=Pierre",
        $referrer: "https://x.com/",
        $initial_host: "flappytone.com",
        $initial_pathname: "/app",
        $initial_referring_domain: "x.com",
        $initial_utm_source: "tiktok",
      }),
    ).toEqual({
      $initial_host: "flappytone.com",
      $initial_pathname: "/app",
      $initial_referring_domain: "x.com",
      $initial_utm_source: "tiktok",
    });
  });

  it("passes undefined through", () => {
    expect(stripPersonUrls(undefined)).toBeUndefined();
  });
});

describe("scrubNameFromUrls", () => {
  it("drops a challenge name from every full-URL field, keeps the rest", () => {
    expect(
      scrubNameFromUrls({
        $current_url: "https://flappytone.com/app?c=42&n=Alice",
        $initial_referrer: "https://x.com/?n=Bob",
        $pathname: "/app",
        name: "kept",
      }),
    ).toEqual({
      $current_url: "https://flappytone.com/app?c=42",
      $initial_referrer: "https://x.com/",
      $pathname: "/app",
      name: "kept",
    });
  });
});

describe("inAppBrowserProperties", () => {
  it("sends `none` for a normal browser, so a filter can select it", () => {
    expect(inAppBrowserProperties({ app: "none", platform: "ios" })).toEqual({
      register: { in_app_browser: "none", in_app_platform: "ios" },
      set: { last_in_app_browser: "none" },
      setOnce: { initial_in_app_browser: "none" },
    });
  });
  it("sends the app and platform for an in-app browser", () => {
    expect(inAppBrowserProperties({ app: "line", platform: "android" }).register).toEqual({
      in_app_browser: "line",
      in_app_platform: "android",
    });
  });
});

describe("displayModeProperties", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  it("stamps the first Home Screen launch once, as the install signal", () => {
    expect(displayModeProperties("standalone", now)).toEqual({
      register: { display_mode: "standalone" },
      set: { last_display_mode: "standalone" },
      setOnce: { initial_display_mode: "standalone", first_standalone_at: "2026-11-04T00:00:00.000Z" },
    });
  });
  it("sends `browser` without an install date in a tab", () => {
    expect(displayModeProperties("browser", now)).toEqual({
      register: { display_mode: "browser" },
      set: { last_display_mode: "browser" },
      setOnce: { initial_display_mode: "browser" },
    });
  });
});
