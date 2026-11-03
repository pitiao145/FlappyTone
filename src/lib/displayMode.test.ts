import { describe, expect, it } from "vitest";
import { displayModeFrom } from "./displayMode.ts";

describe("displayModeFrom", () => {
  it("reads the iOS flag", () => {
    expect(displayModeFrom(true, false)).toBe("standalone");
  });
  it("reads the display-mode media query", () => {
    expect(displayModeFrom(undefined, true)).toBe("standalone");
  });
  it("is `browser` when neither signal is on", () => {
    expect(displayModeFrom(false, false)).toBe("browser");
    expect(displayModeFrom(undefined, false)).toBe("browser");
  });
});
