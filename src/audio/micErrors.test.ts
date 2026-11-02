import { describe, expect, it } from "vitest";
import { MicError, micErrorName, toMicError } from "./mic.ts";

const dom = (name: string) => new DOMException("x", name);

describe("toMicError", () => {
  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "no-microphone"],
    ["OverconstrainedError", "no-microphone"],
    ["NotReadableError", "in-use"],
    ["AbortError", "unknown"],
  ] as const)("%s -> %s, with the name kept", (name, kind) => {
    const e = toMicError(dom(name));
    expect(e.kind).toBe(kind);
    expect(e.errorName).toBe(name);
  });

  it("maps a TypeError and anything else", () => {
    expect(toMicError(new TypeError("no mediaDevices"))).toMatchObject({ kind: "unknown", errorName: "TypeError" });
    expect(toMicError(dom("NotSupportedError"))).toMatchObject({ kind: "unknown", errorName: "other" });
    expect(toMicError("boom")).toMatchObject({ kind: "unknown", errorName: "other" });
    expect(toMicError(null)).toMatchObject({ kind: "unknown", errorName: "other" });
  });

  it("passes a MicError through", () => {
    const e = new MicError("no-audioworklet", "x");
    expect(toMicError(e)).toBe(e);
    expect(micErrorName(e)).toBe("other");
  });
});
