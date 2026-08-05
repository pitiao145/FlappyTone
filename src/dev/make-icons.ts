// CLI: npm run make-icons
//
// Generates the home-screen icons from public/favicon.svg — the Pierrebuilds
// mark — composited onto the game's own backdrop.
//
// Two reasons this is not just the favicon at a larger size. The mark is drawn
// on transparency, and iOS composites a transparent home-screen icon onto
// black, which loses the glow the artwork is made of. And a `maskable` icon is
// cropped to whatever shape the launcher likes, so the mark has to sit inside
// a safe circle at 80% of the canvas or Android will clip it.
//
// macOS-only: leans on sips to rasterise the SVG and ffmpeg to composite.
// Re-run only when the mark changes; the PNGs are committed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Matches BACKDROP in src/render/scene.ts — the icon is a frame of the game. */
const BACKDROP = "#141821";
/** Mark width as a fraction of the canvas, inside the maskable safe zone. */
const MARK_FRAC = 0.62;
const SOURCE = "public/favicon.svg";
const OUT_DIR = "public/icons";

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  // iOS home screen. 180 is the largest size it asks for.
  { name: "apple-touch-icon.png", size: 180 },
];

function requireTools(): void {
  for (const [bin, args] of [
    ["sips", ["--version"]],
    ["ffmpeg", ["-version"]],
  ] as const) {
    try {
      execFileSync(bin, args, { stdio: "ignore" });
    } catch {
      throw new Error(`${bin} not found — this script is macOS-only.`);
    }
  }
}

/**
 * Rasterise the mark at `width`. The SVG carries a viewBox, so overriding the
 * width/height attributes scales it as vector rather than upscaling a bitmap.
 */
function rasteriseMark(width: number, work: string): string {
  const svg = readFileSync(SOURCE, "utf8");
  const height = Math.round((width * 46) / 48); // source viewBox is 48x46
  const scaled = svg.replace(
    /^<svg([^>]*?)width="48"([^>]*?)height="46"/,
    `<svg$1width="${width}"$2height="${height}"`,
  );
  if (scaled === svg) throw new Error("Could not set the mark's size");

  const svgPath = join(work, `mark-${width}.svg`);
  const pngPath = join(work, `mark-${width}.png`);
  writeFileSync(svgPath, scaled);
  execFileSync("sips", ["-s", "format", "png", svgPath, "--out", pngPath], {
    stdio: "ignore",
  });
  return pngPath;
}

function main(): void {
  requireTools();
  const work = mkdtempSync(join(tmpdir(), "flappytone-icons-"));
  try {
    execFileSync("mkdir", ["-p", OUT_DIR]);
    for (const { name, size } of SIZES) {
      const markWidth = Math.round(size * MARK_FRAC);
      const mark = rasteriseMark(markWidth, work);
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `color=c=${BACKDROP}:s=${size}x${size}`,
          "-i",
          mark,
          "-filter_complex",
          "[0][1]overlay=(W-w)/2:(H-h)/2",
          "-frames:v",
          "1",
          join(OUT_DIR, name),
        ],
        { stdio: "inherit" },
      );
      console.log(`${name}  ${size}x${size}  mark ${markWidth}px`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
