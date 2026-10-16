import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, effectiveTheme, isThemeId, isThemeUnlocked, THEMES } from "./themes.ts";

describe("themes", () => {
  it("every theme is free today, and the default is unlocked", () => {
    for (const t of THEMES) expect(isThemeUnlocked(t.id, { xp: null })).toBe(true);
    expect(isThemeUnlocked(DEFAULT_THEME, { xp: null })).toBe(true);
  });

  it("falls back to the default for an unknown or locked choice", () => {
    expect(isThemeId("neon")).toBe(false);
    expect(effectiveTheme("classic", { xp: 0 })).toBe("classic");
  });
});
