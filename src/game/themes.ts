/**
 * Game-canvas themes: the registry of what a player can pick, and whether
 * they may. No React, no `src/data/` — the renderer and Settings both read it.
 *
 * Every theme carries an `unlock` rule from day one, because themes will be
 * earned through the gamification layer (XP). Today there is no XP, so every
 * theme is `free`. When XP lands, a theme becomes `{ kind: "xp", xp: N }` and
 * the caller passes the player's progress into `isThemeUnlocked` — no change
 * to the renderer or the stored setting. Like the speech style, this is UX
 * gating only, never a security boundary: a theme is a look, not content.
 */

export type ThemeId = "classic" | "pixel-flappy";

export type ThemeUnlock =
  | { kind: "free" }
  /** Earned at a total XP. Not used yet: the XP layer does not exist. */
  | { kind: "xp"; xp: number };

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  blurb: string;
  unlock: ThemeUnlock;
}

/** Display order in Settings. */
export const THEMES: readonly ThemeInfo[] = [
  {
    id: "pixel-flappy",
    label: "Taipei",
    blurb: "Pixel mountains and the Taipei skyline.",
    unlock: { kind: "free" },
  },
  {
    id: "classic",
    label: "Paper",
    blurb: "The original calm paper look.",
    unlock: { kind: "free" },
  },
];

export const DEFAULT_THEME: ThemeId = "pixel-flappy";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** What the player has earned. `xp` is null until the XP layer exists. */
export interface ThemeProgress {
  xp: number | null;
}

export function isThemeUnlocked(id: ThemeId, progress: ThemeProgress): boolean {
  const { unlock } = themeInfo(id);
  if (unlock.kind === "free") return true;
  return progress.xp !== null && progress.xp >= unlock.xp;
}

/**
 * The theme the game actually draws: the stored choice if it is still
 * unlocked, else the default. The stored value is never overwritten, so a
 * choice comes back if the theme is unlocked again.
 */
export function effectiveTheme(stored: ThemeId, progress: ThemeProgress): ThemeId {
  return isThemeUnlocked(stored, progress) ? stored : DEFAULT_THEME;
}
