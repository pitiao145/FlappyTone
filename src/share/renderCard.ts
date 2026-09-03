/**
 * Renders the game-over share card to a PNG blob on a fixed offscreen canvas.
 *
 * Fixed 1080×1920 (9:16 story format) regardless of the device's own screen
 * size, so every phone exports identical pixels — the DOM is never
 * screenshotted. See docs/flappytone-SPEC-share.md "Part 1".
 *
 * Kept out of the render/game hot path (src/render/) — this runs once, on a
 * share tap, not every frame.
 */

import { TONE_PATHS } from "../ui/toneIcons.tsx";
import { toneBreakdown, type RunStats } from "../game/scoring.ts";
import type { RunHistoryStore } from "../game/runHistory.ts";
import type { Tone } from "../game/gates.ts";

const W = 1080;
const H = 1920;

// Literal hex values — canvas can't read CSS custom properties, so these are
// copied from src/ui/tokens.css and must be kept in sync by hand.
const SURFACE = "#f7f1e3";
const INK = "#241d15";
const INK_SOFT = "#857a65";
const ACCENT = "#1c7a63";
const GOLD = "#c98a3c";
const GOLD_LIGHT = "#dca24b";

const FONT_DISPLAY = "Fraunces";
const FONT_BODY = "Hanken Grotesk";

/** TONE_PATHS' own viewBox — see src/ui/toneIcons.tsx. */
const TONE_VIEWBOX = 120;

/** The Pip mascot, no halo — see public/Bird-hor-no-halo.png. */
const PIP_SRC = "/Bird-hor-no-halo.png";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function ensureFontsLoaded(): Promise<void> {
  await document.fonts.ready;
  // document.fonts.ready can resolve before a weight that was never used
  // elsewhere on the page has actually been fetched — load the exact
  // weights this card draws with, explicitly, before the first fillText.
  await Promise.all([
    document.fonts.load('700 1px "Fraunces"'),
    document.fonts.load('900 1px "Fraunces"'),
    document.fonts.load('400 1px "Hanken Grotesk"'),
    document.fonts.load('600 1px "Hanken Grotesk"'),
  ]);
}

function drawToneMark(
  ctx: CanvasRenderingContext2D,
  tone: Tone,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const path = new Path2D(TONE_PATHS[tone]);
  const scale = size / TONE_VIEWBOX;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders the game-over share card. `stats` drives the tone-accuracy grid
 * and the score; `history` decides whether the "new best" tag shows (it's
 * already been updated with this run by the time GameOver mounts — see
 * GameOver.tsx's own comment on `history`).
 */
export async function renderShareCard(
  stats: RunStats,
  history: RunHistoryStore,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const [, pipImg] = await Promise.all([ensureFontsLoaded(), loadImage(PIP_SRC)]);

  // Background
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let y = 150;

  // 1. Wordmark
  ctx.fillStyle = INK;
  ctx.font = `700 64px "${FONT_DISPLAY}"`;
  ctx.fillText("flappytone", W / 2, y);
  y += 130;

  // 2. Pip mascot — the shipped no-halo PNG (public/Bird-hor-no-halo.png),
  // same asset PlayHome uses. The source is a square image with the bird
  // inset (transparent margin on every side); that inset's bounding box is
  // near-enough centred in the square (measured: bbox centre (790, 720) vs.
  // image centre (719.5, 719.5) on the 1439x1439 source) that drawing the
  // whole square scaled and centred on `pipCenterY` centres the bird itself,
  // no separate offset needed.
  const pipCenterY = y + 190;
  const pipDrawSize = 820;
  // Bird bbox within the 1439x1439 source, measured directly — see the
  // comment above. Used only to know how far the visible bird extends below
  // its centre, for spacing the next block.
  const pipBboxHalfHeight = ((980 - 460) / 2 / 1439) * pipDrawSize;
  ctx.drawImage(
    pipImg,
    W / 2 - pipDrawSize / 2,
    pipCenterY - pipDrawSize / 2,
    pipDrawSize,
    pipDrawSize,
  );
  y = pipCenterY + pipBboxHalfHeight + 60;

  // 3. Four tone cells, 2x2 — best tone highlighted in jade.
  const breakdown = toneBreakdown(stats);
  const scored = breakdown.filter((b) => b.pct !== null);
  const bestTone =
    scored.length > 0
      ? scored.reduce((best, b) => (b.pct! > best.pct! ? b : best)).tone
      : null;

  const cellW = 420;
  const cellH = 220;
  const gap = 40;
  const gridW = cellW * 2 + gap;
  const gridLeft = (W - gridW) / 2;
  const gridTop = y;

  breakdown.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = gridLeft + col * (cellW + gap);
    const cy = gridTop + row * (cellH + gap);
    const isBest = b.tone === bestTone;
    const color = isBest ? ACCENT : INK;

    roundRect(ctx, cx, cy, cellW, cellH, 28);
    if (isBest) {
      ctx.fillStyle = "#e4efe9"; // accent tint on --surface
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#efe6d1"; // --surface-panel
      ctx.fill();
    }

    drawToneMark(ctx, b.tone, cx + cellW / 2, cy + 90, 110, color);

    ctx.fillStyle = color;
    ctx.font = `700 52px "${FONT_DISPLAY}"`;
    const pctLabel = b.pct === null ? "—" : `${Math.round(b.pct)}%`;
    ctx.fillText(pctLabel, cx + cellW / 2, cy + 190);
  });

  y = gridTop + cellH * 2 + gap + 110;

  // 4. Big score — "I scored" kicker + gold plaque number.
  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 34px "${FONT_BODY}"`;
  ctx.fillText("I SCORED", W / 2, y);
  y += 150;

  const gradient = ctx.createLinearGradient(0, y - 130, 0, y + 20);
  gradient.addColorStop(0, GOLD_LIGHT);
  gradient.addColorStop(1, GOLD);
  ctx.fillStyle = gradient;
  ctx.font = `900 160px "${FONT_DISPLAY}"`;
  ctx.fillText(stats.score.toLocaleString(), W / 2, y);

  const isNewBest = stats.score > 0 && stats.score >= history.bestScore;
  if (isNewBest) {
    ctx.fillStyle = GOLD;
    ctx.font = `700 36px "${FONT_BODY}"`;
    ctx.fillText("★ NEW BEST", W / 2, y + 70);
    y += 70;
  }
  y += 130;

  // 5. Tagline
  ctx.fillStyle = INK;
  ctx.font = `700 56px "${FONT_DISPLAY}"`;
  ctx.fillText("Can you beat me?", W / 2, y);
  y += 130;

  // 6. flappytone.com pill — clean url, no params.
  const pillLabel = "flappytone.com";
  ctx.font = `600 40px "${FONT_BODY}"`;
  const pillTextW = ctx.measureText(pillLabel).width;
  const pillPadX = 56;
  const pillH = 96;
  const pillW = pillTextW + pillPadX * 2;
  const pillX = (W - pillW) / 2;
  const pillY = y - pillH / 2 - 12;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.textBaseline = "middle";
  ctx.fillText(pillLabel, W / 2, pillY + pillH / 2 + 2);
  ctx.textBaseline = "alphabetic";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}
