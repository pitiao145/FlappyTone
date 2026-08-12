import { describe, expect, it } from "vitest";
import { sanitizeGameProperties } from "./posthog.ts";

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

  it("drops every other PostHog default property — $current_url, $browser, etc.", () => {
    expect(
      sanitizeGameProperties({
        $current_url: "https://flappytone.example/game",
        $browser: "Safari",
        $os: "iOS",
        $screen_height: 844,
        $device_id: "abc-123",
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
      }),
    ).toEqual({ tone: 4, outcome: "perfect", $geoip_country_code: "TW" });
  });
});
