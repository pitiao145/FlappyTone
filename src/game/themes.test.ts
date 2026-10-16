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
  it("a guest only gets Paper, whatever their XP", () => {
    for (const t of THEMES) {
      expect(isThemeUnlocked(t.id, { tier: "guest", xp: 1e9 })).toBe(t.id === "classic");
    }
    expect(effectiveTheme("taroko", { tier: "guest", xp: 1e9 })).toBe("classic");
  });

  it("an account unlocks themes by XP; a locked choice falls back to the default", () => {
    expect(isThemeId("neon")).toBe(false);
    expect(isThemeUnlocked(DEFAULT_THEME, { tier: "free", xp: 0 })).toBe(true);
    expect(isThemeUnlocked("tea-terraces", { tier: "pro", xp: 0 })).toBe(false);
    expect(isThemeUnlocked("tea-terraces", { tier: "pro", xp: 1e9 })).toBe(true);
    expect(effectiveTheme("tea-terraces", { tier: "free", xp: 0 })).toBe(DEFAULT_THEME);
    expect(effectiveTheme("classic", { tier: "free", xp: 0 })).toBe("classic");
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
      expect(effectiveTheme(t.id, { tier: "pro", xp: 1e9 })).toBe(DEFAULT_THEME);
    }
  });
});
