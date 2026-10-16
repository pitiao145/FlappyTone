import type { Tier } from "./tiers.ts";

/**
 * Game-canvas themes: the registry of what a player can pick, and whether
 * they may. No React, no `src/data/` — the renderer and Settings both read it.
 *
 * Gating: a guest only ever gets Paper (`free`). An account gets Pixel Flappy
 * (`account`), earns more by level (`level`, from XP — game/xp.ts), and Pro
 * gets the Pro-only themes on the day they buy (`pro`, no XP on top: one lock
 * per theme). Like the speech style, this is UX gating only, never a
 * security boundary: a theme is a look, not content.
 */

export type ThemeId = "classic" | "pixel-flappy" | "taroko" | "alishan" | "tea-terraces";

export type ThemeUnlock =
  /** Everyone, guests included. */
  | { kind: "free" }
  /** Any account (free or Pro). */
  | { kind: "account" }
  /** Any account at this level. */
  | { kind: "level"; level: number }
  /** Pro only, straight away. */
  | { kind: "pro" };

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  blurb: string;
  unlock: ThemeUnlock;
  /**
   * Registered but not finished: kept out of the Settings picker, and a
   * stored choice of it draws the default. A brief flips this off when the
   * theme's renderer lands.
   */
  hidden?: boolean;
}

/** Display order in Settings. */
export const THEMES: readonly ThemeInfo[] = [
  {
    id: "classic",
    label: "Paper",
    blurb: "The original calm paper look.",
    unlock: { kind: "free" },
  },  {
    id: "pixel-flappy",
    label: "Pixel Flappy",
    blurb: "Pixel mountains and the Taipei skyline.",
    unlock: { kind: "account" },
  },
  {
    id: "taroko",
    label: "Taroko",
    blurb: "Marble gorge. Cliffs, river and a shrine.",
    unlock: { kind: "level", level: 3 },
  },
  {
    id: "alishan",
    label: "Alishan",
    blurb: "Sunrise above the sea of clouds.",
    unlock: { kind: "pro" },
  },
  {
    id: "tea-terraces",
    label: "Tea terraces",
    blurb: "Terraced tea hills and the Taipei basin.",
    unlock: { kind: "pro" },
  },

];

/** What a player gets with no choice saved, once it is unlocked for them. */
export const DEFAULT_THEME: ThemeId = "pixel-flappy";
/** Always unlocked: the fallback for a locked or hidden choice. */
export const BASE_THEME: ThemeId = "classic";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/** The themes the Settings picker offers, in display order. */
export function visibleThemes(): readonly ThemeInfo[] {
  return THEMES.filter((t) => !t.hidden);
}

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Who the player is and what they have earned. */
export interface ThemeProgress {
  tier: Tier;
  level: number;
}

export function isThemeUnlocked(id: ThemeId, progress: ThemeProgress): boolean {
  const { unlock } = themeInfo(id);
  switch (unlock.kind) {
    case "free":
      return true;
    case "account":
      return progress.tier !== "guest";
    case "level":
      return progress.tier !== "guest" && progress.level >= unlock.level;
    case "pro":
      return progress.tier === "pro";
  }
}

/**
 * The theme the game actually draws: the stored choice if it is visible and
 * unlocked, else the default if that is unlocked, else Paper. The stored
 * value is never overwritten, so a choice comes back once it is unlocked
 * again (a guest who signs back in).
 */
export function effectiveTheme(stored: ThemeId, progress: ThemeProgress): ThemeId {
  if (!themeInfo(stored).hidden && isThemeUnlocked(stored, progress)) return stored;
  return isThemeUnlocked(DEFAULT_THEME, progress) ? DEFAULT_THEME : BASE_THEME;
}
