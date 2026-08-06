/**
 * The analytics endpoint is public and unauthenticated — anyone who finds the
 * URL can POST to it. `validate` is the only thing standing between that and
 * the bucket, so it is tested as a boundary rather than as a formality.
 */
import { describe, expect, it } from "vitest";
import { validate } from "./analytics.js";

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    sessionId: "abcd1234abcd1234abcd12",
    playerId: "wxyz9876wxyz9876wxyz98",
    startedAt: "2026-08-06T00:00:00.000Z",
    startedAtMs: 1_000_000,
    device: "ios/safari",
    calibration: { f0Center: 198.4, rangeSemitones: 4.81, noiseFloor: 0.00213 },
    events: [
      { type: "landed", t: 0 },
      { type: "gate", t: 24800, i: 0, tone: 1, outcome: "perfect", acc: 0.91 },
    ],
    ...over,
  };
}

describe("validate", () => {
  it("accepts a well-formed session", () => {
    expect(validate(payload())).toBeNull();
  });

  it("accepts a session with no calibration yet", () => {
    // Someone who bounced before calibrating still reports — that drop-off is
    // half the reason the endpoint exists.
    expect(validate(payload({ calibration: null }))).toBeNull();
  });

  it("accepts a truncated session", () => {
    expect(validate(payload({ truncated: true }))).toBeNull();
  });

  describe("ids", () => {
    it.each([
      ["a path traversal", "../../../etc/passwd"],
      ["a slash", "abcd1234/abcd1234"],
      ["too short", "abc"],
      ["too long", "a".repeat(65)],
      ["empty", ""],
      ["a dot segment", ".."],
    ])("rejects %s as a sessionId", (_name, sessionId) => {
      // The session id lands directly in a storage path. A bad one must be
      // refused, never rewritten — quietly sanitising would file the session
      // under a key that is not the one the client will retry to.
      expect(validate(payload({ sessionId }))).toBe("Bad sessionId.");
    });

    it("rejects a bad playerId", () => {
      expect(validate(payload({ playerId: "no!" }))).toBe("Bad playerId.");
    });

    it("rejects a non-string id", () => {
      expect(validate(payload({ sessionId: 12345678 }))).toBe("Bad sessionId.");
    });
  });

  describe("unknown fields", () => {
    it("rejects an unexpected top-level field", () => {
      // The specific thing this stops: someone adding `ip`, `email` or
      // `recording` to the payload and it silently landing in the bucket.
      expect(validate(payload({ email: "a@b.c" }))).toBe("Unexpected field: email");
    });

    it("rejects an unexpected calibration field", () => {
      expect(
        validate(payload({ calibration: { f0Center: 1, samples: [1, 2, 3] } })),
      ).toBe("Unexpected calibration field: samples");
    });
  });

  describe("device bucket", () => {
    it("rejects a raw user-agent", () => {
      // A UA is a fingerprint. The client sends a bucket; anything else is
      // either a bug or someone trying to widen what gets stored.
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1";
      expect(validate(payload({ device: ua }))).toBe("Bad device.");
    });

    it.each(["ios/safari", "android/chrome", "desktop/firefox", "desktop/other"])(
      "accepts %s",
      (device) => {
        expect(validate(payload({ device }))).toBeNull();
      },
    );

    it("rejects a bucket outside the closed set", () => {
      expect(validate(payload({ device: "ios/brave" }))).toBe("Bad device.");
    });
  });

  describe("the flat-primitives rule", () => {
    it("rejects an event carrying an array", () => {
      // This is the structural guard: a pitch contour, a sample buffer or any
      // other bulk capture would arrive as an array. Refusing the shape means
      // no blocklist of field names has to be kept up to date.
      expect(
        validate(payload({ events: [{ type: "gate", contour: [1, 2, 3, 4] }] })),
      ).toBe("Event field is not a primitive.");
    });

    it("rejects an event carrying a nested object", () => {
      expect(
        validate(payload({ events: [{ type: "gate", meta: { lat: 1, lon: 2 } }] })),
      ).toBe("Event field is not a primitive.");
    });

    it("rejects a long string used to smuggle text", () => {
      expect(
        validate(payload({ events: [{ type: "note", body: "x".repeat(500) }] })),
      ).toBe("Event string too long.");
    });

    it("rejects an event with no type", () => {
      expect(validate(payload({ events: [{ t: 1 }] }))).toBe("Event has no type.");
    });

    it("rejects a non-finite number", () => {
      // JSON has no NaN, but a hand-rolled client could send 1e999 -> Infinity.
      const parsed: unknown = JSON.parse('{"type":"gate","acc":1e999}');
      expect(validate(payload({ events: [parsed] }))).toBe(
        "Event has a non-finite number.",
      );
    });

    it("rejects an event that is an array", () => {
      expect(validate(payload({ events: [[1, 2, 3]] }))).toBe("Event is not an object.");
    });

    it("rejects too many events", () => {
      const events = Array.from({ length: 2001 }, () => ({ type: "landed", t: 0 }));
      expect(validate(payload({ events }))).toBe("Too many events.");
    });

    it("rejects a field name long enough to be data", () => {
      expect(
        validate(payload({ events: [{ type: "x", ["k".repeat(30)]: 1 }] })),
      ).toBe("Event field name too long.");
    });
  });

  describe("shape", () => {
    it.each([
      ["null", null],
      ["an array", [1, 2, 3]],
      ["a string", "hello"],
      ["a number", 42],
    ])("rejects %s as the body", (_name, body) => {
      expect(validate(body)).toBe("Not an object.");
    });

    it("rejects events that are not an array", () => {
      expect(validate(payload({ events: "landed" }))).toBe("Bad events.");
    });
  });
});
