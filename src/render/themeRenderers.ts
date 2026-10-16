/**
 * A landmark at `frac` of a layer tile `tileMult × width` wide, scrolled at
 * parallax factor `k`, lands on screen at frac·tile − worldX·k (mod tile).
 */
function landmarkWorldX(width: number, screenX: number, tileMult: number, frac: number, k: number): number {
  const tile = width * tileMult;
  return k > 0 ? ((((frac * tile - screenX) % tile) + tile) % tile) / k : 0;
}

/**
 * One renderer record per game-canvas theme (src/game/themes.ts is the
 * registry of what a player can pick). `world.ts` draws through this record
 * and never branches on a theme id itself, so a new theme is a record here
 * plus its own module — collision and corridor geometry never see it.
 *
 * The channel tint, rims and dashed guide stay in `drawGate` for every
 * theme: a theme paints the backdrop and the walls, nothing the player reads
 * as the corridor.
 */

import type { GateShape } from "../game/gates.ts";
import type { ThemeId } from "../game/themes.ts";
import { ALISHAN_GRID, drawAlishanBackdrop, drawAlishanWalls } from "./alishanTheme.ts";
import { ALISHAN, PIXEL_FLAPPY, rgb, TAROKO, TEA_TERRACES } from "./palette.ts";
import { drawBackdrop as drawPixelBackdrop, drawGround, drawPixelWalls } from "./pixelTheme.ts";
import { tuning } from "../game/tuning.ts";
import { BACKDROP, PAPER_GRID, PIXEL_GRID, type GridStyle } from "./scene.ts";
import { bottomWallPath, topWallPath, type Pt } from "./smoothPath.ts";
import { drawTeaTerracesBackdrop, drawTeaTerracesWalls, TEA_TERRACES_GRID, TOWER_AT } from "./teaTerracesTheme.ts";
import { drawTarokoBackdrop, drawTarokoWalls, TAROKO_GRID } from "./tarokoTheme.ts";

export interface WallArgs {
  ctx: CanvasRenderingContext2D;
  height: number;
  x0: number;
  x1: number;
  /** The gate's world x; anchors world-fixed textures (pixel phase, strata). */
  xStart: number;
  top: readonly Pt[];
  bottom: readonly Pt[];
  /** Cache owner: the gate's shape object. */
  shape: GateShape;
  /** Everything that would change the gate's edges. */
  cacheKey: string;
  active: boolean;
}

export interface ThemeRenderer {
  /** Everything behind the grid. Called with the normal logical transform. */
  drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, worldX: number): void;
  /** Over the gates, under the trail and bird. */
  drawForeground?(ctx: CanvasRenderingContext2D, width: number, height: number, worldX: number): void;
  /** A gate's walls, inside [x0, x1] only. */
  drawWalls(args: WallArgs): void;
  gridStyle: GridStyle;
  /**
   * The worldX that puts the theme's landmark (Taipei 101, the shrine, Yushan)
   * at `screenX` on a `width`-wide canvas. Settings' still preview cards use it.
   */
  showcaseWorldX?(width: number, screenX: number): number;
  /** "r, g, b" of the cue veil. A function: paper's token resolves at runtime. */
  veilRgb(): string;
}

const classic: ThemeRenderer = {
  drawBackdrop(ctx, width, height) {
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, width, height);
  },
  drawWalls({ ctx, height, x0, x1, top, bottom, active }) {
    // Paper: the wall shares the backdrop colour; the channel tint and rims
    // carry the shape.
    ctx.fillStyle = active ? `rgba(${rgb("backdrop")}, 0.97)` : `rgba(${rgb("backdrop")}, 0.82)`;
    topWallPath(ctx, top, x0, x1);
    ctx.fill();
    bottomWallPath(ctx, bottom, x0, x1, height);
    ctx.fill();
  },
  gridStyle: PAPER_GRID,
  veilRgb: () => rgb("backdrop"),
};

const pixelFlappy: ThemeRenderer = {
  drawBackdrop: drawPixelBackdrop,
  drawForeground: drawGround,
  drawWalls({ ctx, height, x0, x1, xStart, top, bottom, shape, cacheKey }) {
    drawPixelWalls(ctx, height, x0, x1, xStart, { top, bottom }, shape, cacheKey);
  },
  gridStyle: PIXEL_GRID,
  showcaseWorldX: (w, x) => landmarkWorldX(w, x, tuning().pixelTileSkyline, 0.62, tuning().pixelKSkyline),
  veilRgb: () => PIXEL_FLAPPY.backdropRgb,
};

const taroko: ThemeRenderer = {
  drawBackdrop: drawTarokoBackdrop,
  drawWalls: drawTarokoWalls,
  gridStyle: TAROKO_GRID,
  showcaseWorldX: (w, x) => landmarkWorldX(w, x, tuning().tarokoTileShrine, 0.5, tuning().tarokoKShrine),
  veilRgb: () => TAROKO.veilRgb,
};

const alishan: ThemeRenderer = {
  drawBackdrop: drawAlishanBackdrop,
  drawWalls: drawAlishanWalls,
  gridStyle: ALISHAN_GRID,
  // The far massif's peak (Yushan), next to the screen-fixed sun.
  showcaseWorldX: (w, x) => landmarkWorldX(w, x, tuning().alishanTileRange, 0.62, tuning().alishanKRange),
  veilRgb: () => ALISHAN.veilRgb,
};

const teaTerraces: ThemeRenderer = {
  drawBackdrop: drawTeaTerracesBackdrop,
  drawWalls: drawTeaTerracesWalls,
  gridStyle: TEA_TERRACES_GRID,
  showcaseWorldX: (w, x) => landmarkWorldX(w, x, tuning().teaTileBasin, TOWER_AT, tuning().teaKBasin),
  veilRgb: () => TEA_TERRACES.veilRgb,
};

/**
 * Every ThemeId has a record. A theme still `hidden` in the registry may
 * point at classic until its brief lands; `effectiveTheme` never selects a
 * hidden theme, so the stand-in is not reachable by a player.
 */
export const THEME_RENDERERS: Record<ThemeId, ThemeRenderer> = {
  classic,
  "pixel-flappy": pixelFlappy,
  taroko,
  alishan,
  "tea-terraces": teaTerraces,
};
