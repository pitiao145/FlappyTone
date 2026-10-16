import { describe, expect, it } from "vitest";
import { THEME_RENDERERS } from "../render/themeRenderers.ts";
import {
  DEFAULT_THEME,
  effectiveTheme,
  isThemeId,
  isThemeUnlocked,
  THEMES,
  visibleThemes,
} from "./themes.ts";

describe("themes", () => {
  it("every theme is free today, and the default is unlocked", () => {
    for (const t of THEMES) expect(isThemeUnlocked(t.id, { xp: null })).toBe(true);
    expect(isThemeUnlocked(DEFAULT_THEME, { xp: null })).toBe(true);
  });

  it("falls back to the default for an unknown or locked choice", () => {
    expect(isThemeId("neon")).toBe(false);
    expect(effectiveTheme("classic", { xp: 0 })).toBe("classic");
  });

  it("every visible theme is in the picker and has its own renderer", () => {
    const picker = visibleThemes().map((t) => t.id);
    for (const t of THEMES.filter((t) => !t.hidden)) {
      expect(picker).toContain(t.id);
      const r = THEME_RENDERERS[t.id];
      expect(r).toBeDefined();
      // Only classic may draw with classic's renderer: a visible theme on the
      // stand-in would be a finished-looking entry that draws paper.
      if (t.id !== "classic") expect(r).not.toBe(THEME_RENDERERS.classic);
    }
    expect(picker).toContain("taroko");
  });

  it("keeps hidden themes out of the picker and never draws one", () => {
    const picker = visibleThemes().map((t) => t.id);
    for (const t of THEMES.filter((t) => t.hidden)) {
      expect(picker).not.toContain(t.id);
      expect(effectiveTheme(t.id, { xp: null })).toBe(DEFAULT_THEME);
    }
  });
});
