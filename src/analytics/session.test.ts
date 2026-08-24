import { describe, expect, it } from "vitest";
import { deviceBucket, gateEvent, roundCalibration } from "./session.ts";
import type { GateLogEntry } from "../game/run.ts";
import type { MicFailureReason } from "./session.ts";
import type { MicErrorKind } from "../audio/mic.ts";

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
    const ev = gateEvent(entry, 0);
    const keys = Object.keys(ev).sort();
    expect(keys).toEqual([
      "acc",
      "excMs",
      "i",
      "outcome",
      "seeded",
      "tone",
      "type",
      "uttMs",
      "voicedFrac",
    ]);
    for (const value of Object.values(ev)) {
      expect(Array.isArray(value)).toBe(false);
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
