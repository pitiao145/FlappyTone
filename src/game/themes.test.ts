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
  it("a guest only gets Paper, whatever their level", () => {
    for (const t of THEMES) {
      expect(isThemeUnlocked(t.id, { tier: "guest", level: 99 })).toBe(t.id === "classic");
    }
    expect(effectiveTheme("taroko", { tier: "guest", level: 99 })).toBe("classic");
  });

  it("an account unlocks themes by level; a locked choice falls back to the default", () => {
    expect(isThemeId("neon")).toBe(false);
    expect(isThemeUnlocked(DEFAULT_THEME, { tier: "free", level: 1 })).toBe(true);
    expect(isThemeUnlocked("taroko", { tier: "free", level: 2 })).toBe(false);
    expect(isThemeUnlocked("taroko", { tier: "free", level: 3 })).toBe(true);
    expect(effectiveTheme("taroko", { tier: "free", level: 1 })).toBe(DEFAULT_THEME);
    expect(effectiveTheme("classic", { tier: "free", level: 1 })).toBe("classic");
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

  it("Pro-only themes: Pro at any level, never free at any level", () => {
    for (const id of ["alishan", "tea-terraces"] as const) {
      expect(isThemeUnlocked(id, { tier: "pro", level: 1 })).toBe(true);
      expect(isThemeUnlocked(id, { tier: "free", level: 99 })).toBe(false);
    }
  });

  it("keeps hidden themes out of the picker and never draws one", () => {
    const picker = visibleThemes().map((t) => t.id);
    for (const t of THEMES.filter((t) => t.hidden)) {
      expect(picker).not.toContain(t.id);
      expect(effectiveTheme(t.id, { tier: "pro", level: 99 })).toBe(DEFAULT_THEME);
    }
  });
});
