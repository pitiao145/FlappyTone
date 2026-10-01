import { describe, expect, it } from "vitest";
import { cleanShareName, parseChallengeName, SHARE_NAME_MAX } from "./shareName.ts";

describe("cleanShareName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanShareName("  Pierre   B  ")).toBe("Pierre B");
  });
  it("strips control characters", () => {
    expect(cleanShareName("Pi\u0000er\nre")).toBe("Pi er re");
  });
  it("caps the length", () => {
    expect(cleanShareName("x".repeat(100))).toHaveLength(SHARE_NAME_MAX);
  });
  it("keeps hanzi", () => {
    expect(cleanShareName("小明")).toBe("小明");
  });
  it("returns empty for blank input", () => {
    expect(cleanShareName("   ")).toBe("");
  });
});

describe("parseChallengeName", () => {
  it("reads and decodes ?n=", () => {
    expect(parseChallengeName("?c=1425&n=Pierre%20B")).toBe("Pierre B");
  });
  it("is null when absent or blank", () => {
    expect(parseChallengeName("?c=1425")).toBeNull();
    expect(parseChallengeName("?n=%20%20")).toBeNull();
  });
  it("clamps an oversized name", () => {
    expect(parseChallengeName(`?n=${"a".repeat(500)}`)).toHaveLength(SHARE_NAME_MAX);
  });
});
