import { describe, expect, it } from "vitest";
import playHomeSrc from "./PlayHome.tsx?raw";
import bannerSrc from "./UpdateBanner.tsx?raw";

describe("PlayHome (brief 49)", () => {
  it("shows no update banner (the component stays for the next update)", () => {
    expect(playHomeSrc).not.toContain("UpdateBanner");
    expect(playHomeSrc).not.toContain("onOpenThemes");
    expect(bannerSrc).toContain("export");
  });
});
