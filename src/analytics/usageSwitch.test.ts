/**
 * Brief 35: one "Usage analytics" switch. Off stops every PostHog event, the
 * SDK's own (`$pageview`, `$pageleave`, `$web_vitals`, `$set`, `$identify`)
 * included. The PostHog client is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BeforeSendFn, CaptureResult } from "posthog-js";

const fake = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
  setPersonProperties: vi.fn(),
  unsetPersonProperties: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: fake }));

import {
  captureGameEvent,
  initPostHog,
  resetPostHogForTests,
  setPostHogConsent,
} from "./posthog.ts";

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  // `enabled()`: a dev build reports only with `?analytics`.
  vi.stubGlobal("location", { search: "?analytics" });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15" });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  } as Storage);
  for (const f of Object.values(fake)) f.mockClear();
  resetPostHogForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Lets the dynamic `import("posthog-js")` resolve. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function beforeSend(): BeforeSendFn {
  return fake.init.mock.calls[0][1].before_send as BeforeSendFn;
}

const AUTOCAPTURED = ["$pageview", "$pageleave", "$web_vitals", "$set", "$identify"];

describe("Usage analytics switch", () => {
  it("off at load: the SDK never starts and no event of any kind is captured", async () => {
    initPostHog("off");
    captureGameEvent({ type: "screen_viewed", screen: "play" });
    captureGameEvent({ type: "run_start", mode: "game", corridor: "wide", cue: "voice" } as never);
    await flush();
    expect(fake.init).not.toHaveBeenCalled();
    expect(fake.capture).not.toHaveBeenCalled();
    expect(fake.setPersonProperties).not.toHaveBeenCalled();
  });

  it("turned off after start: no capture call, and before_send drops the SDK's own events", async () => {
    initPostHog("on");
    await flush();
    expect(fake.init).toHaveBeenCalledTimes(1);
    fake.capture.mockClear();

    setPostHogConsent(false);
    captureGameEvent({ type: "screen_viewed", screen: "play" });
    captureGameEvent({ type: "mic_help", action: "shown", surface: "app", reason: "permission-denied" } as never);
    expect(fake.capture).not.toHaveBeenCalled();

    for (const event of [...AUTOCAPTURED, "screen_viewed", "gate"]) {
      const cr = { event, properties: {} } as unknown as CaptureResult;
      expect(beforeSend()(cr), event).toBeNull();
    }
  });

  it("on again: sends from that moment, nothing captured while off", async () => {
    initPostHog("on");
    await flush();
    setPostHogConsent(false);
    captureGameEvent({ type: "screen_viewed", screen: "play" });
    setPostHogConsent(true);
    captureGameEvent({ type: "screen_viewed", screen: "profile" });
    const sent = fake.capture.mock.calls.filter((c) => c[0] === "screen_viewed");
    expect(sent).toHaveLength(1);
    expect(sent[0][1]).toEqual({ screen: "profile" });
    const cr = { event: "$pageview", properties: {} } as unknown as CaptureResult;
    expect(beforeSend()(cr)).not.toBeNull();
  });

  it("pending (/app before the account is read): holds events, sends them only if it resolves on", async () => {
    initPostHog("pending");
    captureGameEvent({ type: "app_open" } as never);
    await flush();
    expect(fake.init).not.toHaveBeenCalled();
    setPostHogConsent(true);
    await flush();
    expect(fake.init).toHaveBeenCalledTimes(1);
    expect(fake.capture.mock.calls.map((c) => c[0])).toContain("app_open");
  });

  it("pending that resolves off: the held events are discarded and the SDK never starts", async () => {
    initPostHog("pending");
    captureGameEvent({ type: "app_open" } as never);
    setPostHogConsent(false);
    setPostHogConsent(true);
    await flush();
    expect(fake.capture.mock.calls.map((c) => c[0])).not.toContain("app_open");
  });

  it("a browser that never calibrated sends no $unset", async () => {
    initPostHog("on");
    await flush();
    expect(fake.unsetPersonProperties).not.toHaveBeenCalled();
  });

  it("removes the old calibration person properties once, then never again", async () => {
    store["toneflap.settings.v3"] = "{}"; // this browser calibrated
    initPostHog("on");
    await flush();
    expect(fake.unsetPersonProperties).toHaveBeenCalledWith([
      "f0Center",
      "rangeSemitones",
      "rangeDownSemitones",
      "noiseFloor",
    ]);
    resetPostHogForTests();
    fake.unsetPersonProperties.mockClear();
    initPostHog("on");
    await flush();
    expect(fake.unsetPersonProperties).not.toHaveBeenCalled();
  });

  it("never sends calibration numbers: no event or person property carries them", async () => {
    initPostHog("on");
    await flush();
    captureGameEvent({ type: "calib_done" });
    const keys = ["f0Center", "rangeSemitones", "rangeDownSemitones", "noiseFloor", "uttMs", "voicedFrac", "seeded", "excMs"];
    for (const [name, props] of fake.capture.mock.calls) {
      expect(name).not.toBe("calib_numbers");
      for (const k of keys) expect(props ?? {}).not.toHaveProperty(k);
    }
    for (const [set] of fake.setPersonProperties.mock.calls) {
      for (const k of keys) expect(set ?? {}).not.toHaveProperty(k);
    }
  });
});
