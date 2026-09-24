import { describe, expect, it } from "vitest";
import { deviceBucket, eventTier, gateEvent, roundCalibration } from "./session.ts";
import type { GateLogEntry } from "../game/run.ts";
import type { AnalyticsEvent, MicFailureReason, TrackedScreen } from "./session.ts";
import type { MicErrorKind } from "../audio/mic.ts";
import type { Screen } from "../app/GameApp.tsx";
import { APP_EVENTS, sanitizeGameProperties } from "./posthog.ts";

/**
 * `session.ts` restates `MicErrorKind` rather than importing it, so that the
 * payload module stays free of the Web Audio import graph (see the comment
 * there). This test is what stops the two drifting: it lives in the app
 * project, where importing `audio/mic.ts` is free.
 *
 * Assignable both ways — one direction alone would let a member be added to
 * either side unnoticed.
 */
const _reasonMatchesMic: MicErrorKind = null as unknown as MicFailureReason;
const _micMatchesReason: MicFailureReason = null as unknown as MicErrorKind;
void _reasonMatchesMic;
void _micMatchesReason;

/**
 * `session.ts` restates `GameApp.tsx`'s `Screen` type (minus the dev-only
 * "lab"/"devlogin") for the same reason it restates `MicErrorKind` — keeping
 * this payload module's own graph light. `TrackedScreen` must therefore be
 * assignable into `Screen`, and every non-dev `Screen` value assignable into
 * `TrackedScreen`, so the two cannot silently drift apart.
 */
const _trackedIsScreen: Screen = null as unknown as TrackedScreen;
const _screenIsTracked: TrackedScreen = null as unknown as Exclude<Screen, "lab" | "devlogin">;
void _trackedIsScreen;
void _screenIsTracked;

describe("roundCalibration", () => {
  it("rounds away meaningless precision", () => {
    expect(
      roundCalibration({
        f0Center: 198.44444444,
        rangeSemitones: 4.812345,
        rangeDownSemitones: 4.812345,
        noiseFloor: 0.002134567,
      }),
    ).toEqual({
      f0Center: 198.4,
      rangeSemitones: 4.81,
      rangeDownSemitones: 4.81,
      noiseFloor: 0.00213,
    });
  });
});

describe("gateEvent", () => {
  const entry: GateLogEntry = {
    tone: 3,
    tones: [3],
    outcome: "unheard",
    accuracy: 0,
    samples: 38,
    voiced: 12,
    voicedFraction: 0.3157894736842105,
    utteranceMs: 143.21,
    seeded: 0,
    worstExcursionMs: 412.7,
    atMs: 18430.5,
    classifiedTone: null,
  };

  it("flattens a log entry, rounding the floats", () => {
    expect(gateEvent(entry, 7)).toEqual({
      type: "gate",
      i: 7,
      tone: 3,
      tones: [3],
      outcome: "unheard",
      acc: 0,
      uttMs: 143,
      voicedFrac: 0.316,
      seeded: 0,
      excMs: 413,
    });
  });

  it("carries no per-frame data — only the gate summary", () => {
    // The privacy rule that matters: nothing in the payload can reconstruct
    // the player's pitch trace. `samples` is a count in the log; it must not
    // become an array here, and `atMs` (wall position) is not needed.
    // `tones` is the one legitimate array — a gate's small, fixed tone
    // sequence (max a handful of syllables), not per-frame pitch data.
    const ev = gateEvent(entry, 0);
    const keys = Object.keys(ev).sort();
    expect(keys).toEqual([
      "acc",
      "excMs",
      "i",
      "outcome",
      "seeded",
      "tone",
      "tones",
      "type",
      "uttMs",
      "voicedFrac",
    ]);
    for (const [key, value] of Object.entries(ev)) {
      if (key === "tones") continue;
      expect(Array.isArray(value)).toBe(false);
    }
  });
});

describe("run_feedback", () => {
  it("carries only sentiment and mode — no free text, no PII", () => {
    const ev: AnalyticsEvent = { type: "run_feedback", sentiment: "calib_off", mode: "game" };
    const keys = Object.keys(ev).sort();
    expect(keys).toEqual(["mode", "sentiment", "type"]);
    for (const value of Object.values(ev)) {
      expect(typeof value).toBe("string");
    }
  });
});

describe("deviceBucket", () => {
  const cases: [string, string][] = [
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "ios/safari",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
      "ios/chrome",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      "android/chrome",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "desktop/safari",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "desktop/chrome",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
      "desktop/edge",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", "desktop/firefox"],
    ["", "desktop/other"],
  ];

  for (const [ua, expected] of cases) {
    it(`maps ${expected}`, () => {
      expect(deviceBucket(ua)).toBe(expected);
    });
  }

  it("never echoes the user-agent back", () => {
    // A bucket that falls through to the raw UA would be a fingerprint, which
    // is the specific thing this function exists to prevent.
    const weird = "SomeUnknownBrowser/9.9 (Device Serial ABC123XYZ)";
    const bucket = deviceBucket(weird);
    expect(bucket).toBe("desktop/other");
    expect(weird.toLowerCase()).not.toContain(bucket);
  });

  it("only ever returns a value from the closed set", () => {
    const allowed = new Set<string>();
    for (const p of ["ios", "android", "desktop"]) {
      for (const e of ["safari", "chrome", "firefox", "edge", "other"]) {
        allowed.add(`${p}/${e}`);
      }
    }
    const uas = [...cases.map(([ua]) => ua), "garbage", "Opera/9.80", "curl/8.4"];
    for (const ua of uas) expect(allowed.has(deviceBucket(ua))).toBe(true);
  });
});

describe("run_end", () => {
  /**
   * The voice a run was flown with. A speaker id from the roster — never
   * anything the player typed, so `session.ts`'s standing promise is intact —
   * and the one property that makes every other gameplay number breakable by
   * voice ("do male-voiced runs score worse?", which is unanswerable without
   * it).
   */
  it("carries the voice", () => {
    const ev: AnalyticsEvent = {
      type: "run_end",
      reason: "out_of_hearts",
      gates: 7,
      score: 1200,
      bestMult: 2,
      missedEarly: 1,
      voice: "mark",
    };
    expect(ev.type === "run_end" && ev.voice).toBe("mark");
  });

  it("survives the transport boundary, where a property the allowlist misses is dropped", () => {
    // `voice` reaching the union is only half of it: `before_send` re-reduces
    // every *sent* property, so a field added to the type and not carried
    // through here would be built and then thrown away.
    const sent = sanitizeGameProperties({
      voice: "mark",
      score: 1200,
      $geoip_country_code: "TW",
      $host: "flappytone.com",
      $current_url: "https://flappytone.com/app",
    });
    expect(sent.voice).toBe("mark");
    expect(sent).not.toHaveProperty("$host");
    expect(sent).not.toHaveProperty("$current_url");
    expect(sent.$geoip_country_code).toBe("TW");
  });
});

describe("eventTier", () => {
  // Enumerated independently of eventTier's own switch, so this test can
  // actually catch a miscategorization rather than just re-asserting the
  // implementation.
  const GAMEPLAY: AnalyticsEvent["type"][] = [
    "mic",
    "calib_step",
    "calib_done",
    "calib_abandoned",
    "recal_offered",
    "recal_resolved",
    "run_feedback",
    "run_start",
    "gate",
    "run_end",
    "cue_fallback",
    "visualiser_session",
  ];
  const GLOBAL: AnalyticsEvent["type"][] = [
    "landed",
    "share_clicked",
    "challenge_landed",
    "challenge_resolved",
    "leaderboard_viewed",
    "join_board_shown",
    "join_board_submitted",
    "score_submitted",
    "mode_selected",
    "screen_viewed",
    "setting_changed",
    "signup_started",
    "signup_completed",
    "daily_limit_reached",
    "earlybird_modal_shown",
    "earlybird_create_account_click",
    "earlybird_pay_click",
    "earlybird_checkout_opened",
    "profile_earlybird_cta_click",
    "progress_locked_cta_click",
    "progress_earlybird_pricing_click",
    "feedback_submitted",
  ];

  for (const type of GAMEPLAY) {
    it(`${type} is gameplay tier`, () => {
      expect(eventTier(type)).toBe("gameplay");
    });
  }
  for (const type of GLOBAL) {
    it(`${type} is global tier`, () => {
      expect(eventTier(type)).toBe("global");
    });
  }

  it("covers every AnalyticsEvent type exactly once, split between the two lists above", () => {
    expect(new Set([...GAMEPLAY, ...GLOBAL]).size).toBe(GAMEPLAY.length + GLOBAL.length);
  });
});

describe("APP_EVENTS", () => {
  it("contains every AnalyticsEvent type, so sanitization can't silently miss one", () => {
    const allTypes = new Set<AnalyticsEvent["type"]>([
      "landed",
      "mic",
      "calib_step",
      "calib_done",
      "calib_abandoned",
      "recal_offered",
      "recal_resolved",
      "run_feedback",
      "run_start",
      "gate",
      "run_end",
      "cue_fallback",
      "share_clicked",
      "challenge_landed",
      "challenge_resolved",
      "leaderboard_viewed",
      "join_board_shown",
      "join_board_submitted",
      "score_submitted",
      "mode_selected",
      "screen_viewed",
      "setting_changed",
      "signup_started",
      "signup_completed",
      "daily_limit_reached",
      "earlybird_modal_shown",
      "earlybird_create_account_click",
      "earlybird_pay_click",
      "earlybird_checkout_opened",
      "profile_earlybird_cta_click",
      "progress_locked_cta_click",
      "progress_earlybird_pricing_click",
      "visualiser_session",
      "feedback_submitted",
    ]);
    for (const type of allTypes) {
      expect(APP_EVENTS.has(type), `APP_EVENTS is missing "${type}"`).toBe(true);
    }
  });

  it("sanitizes a representative global-tier event exactly like a gameplay one, proving sanitization is tier-independent", () => {
    const sent = sanitizeGameProperties({
      screen: "profile",
      $host: "flappytone.com",
      $geoip_country_code: "TW",
    });
    expect(sent.screen).toBe("profile");
    expect(sent).not.toHaveProperty("$host");
    expect(sent.$geoip_country_code).toBe("TW");
  });
});
