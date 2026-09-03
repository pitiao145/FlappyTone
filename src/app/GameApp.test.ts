import { describe, expect, it } from "vitest";
import { parseChallengeScore } from "./GameApp.tsx";

describe("parseChallengeScore", () => {
  it("parses a valid integer score", () => {
    expect(parseChallengeScore("?c=1425")).toBe(1425);
  });

  it("returns null when c is absent", () => {
    expect(parseChallengeScore("")).toBeNull();
    expect(parseChallengeScore("?ref=share")).toBeNull();
  });

  it("rejects non-numeric, negative, zero, and fractional values", () => {
    expect(parseChallengeScore("?c=abc")).toBeNull();
    expect(parseChallengeScore("?c=-5")).toBeNull();
    expect(parseChallengeScore("?c=0")).toBeNull();
    expect(parseChallengeScore("?c=12.5")).toBeNull();
  });

  it("clamps out-of-range values", () => {
    expect(parseChallengeScore("?c=99999999")).toBeNull();
  });

  it("ignores other params on the same query string", () => {
    expect(parseChallengeScore("?ref=share&c=1425")).toBe(1425);
  });
});
