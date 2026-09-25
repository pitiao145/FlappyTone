// CLI: npm run make-icons
//
// Generates the home-screen icons from src/dev/icon-source.svg — the OG card's
// art re-fitted to a square — over the game's own backdrop. The 32px tab
// fallback comes from public/favicon.svg instead: the same art simplified for
// tab size, where the detailed version's lines fall below a pixel.
//
// The mark is now opaque and edge-to-edge, so this is close to "the favicon at
// a larger size". The backdrop is still painted underneath rather than trusted
// from the SVG: iOS composites any transparency in a home-screen icon onto
// black, and a partly-transparent corner would come out as a black notch.
//
// `maskable` needs its own file. The mark is deliberately drawn close to the
// edges — Pip sits in the top-right corner, where the climb ends — and padding
// it for Android's sake would cost legibility everywhere else. So the maskable variant is
// the same mark inset to `safeFrac` on its own backdrop, and the tab favicon
// keeps its full bleed. One artwork, two croppings.
//
// Chrome rather than sips for rasterising: sips does not render SVG filters, so
// the glow the mark is built from came out flat. Rendering at 2x and letting
// ffmpeg downscale is also what keeps the curve's edges clean.
//
// macOS-only. Re-run only when the mark changes; the PNGs are committed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Matches the light "paper" surface token (`--surface-rgb`, tokens.css). */
const BACKDROP = "#f7f1e3";
const ICON_SOURCE = "src/dev/icon-source.svg";
const FAVICON_SOURCE = "public/favicon.svg";
const OUT_DIR = "public/icons";
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * `safeFrac` insets the mark to that fraction of the canvas, padding the rest
 * with BACKDROP. Only the maskable icon needs it: a launcher crops to whatever
 * shape it likes, and 0.72 keeps the whole mark inside the 80% safe circle the
 * spec guarantees. Everything else runs full bleed.
 */
const SIZES: {
  name: string;
  size: number;
  safeFrac?: number;
  source?: string;
}[] = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512, safeFrac: 0.72 },
  // iOS home screen. 180 is the largest size it asks for. iOS applies its own
  // rounded mask and crops very little, so this one stays full bleed.
  { name: "apple-touch-icon.png", size: 180 },
  // PNG fallback for the browser tab, for anything that will not take an SVG
  // favicon. index.html offers it after favicon.svg.
  { name: "icon-32.png", size: 32, source: FAVICON_SOURCE },
];

function requireTools(): void {
  for (const [bin, args] of [
    [CHROME, ["--version"]],
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
 * Rasterise the mark at `size`x`size`, via headless Chrome at 2x.
 *
 * The SVG carries a viewBox, so overriding width/height scales it as vector
 * rather than upscaling a bitmap. The wrapper page zeroes the body margin;
 * without it Chrome's default 8px offsets the shot.
 */
function rasteriseMark(size: number, source: string, work: string): string {
  const svg = readFileSync(source, "utf8");
  // Test the match rather than comparing before/after: rendering at the
  // source's own 32px makes the substitution a no-op, and an equality check
  // reads that as a failure.
  const DIMS = /^<svg([^>]*?)width="32"([^>]*?)height="32"/;
  if (!DIMS.test(svg)) {
    throw new Error(
      `Could not set the mark's size — ${source} no longer opens with ` +
        `width="32" height="32". Update this regex to its new viewBox.`,
    );
  }
  const scaled = svg.replace(DIMS, `<svg$1width="${size}"$2height="${size}"`);

  const htmlPath = join(work, `mark-${size}.html`);
  const pngPath = join(work, `mark-${size}.png`);
  writeFileSync(
    htmlPath,
    '<!doctype html><meta charset="utf-8">' +
      `<style>html,body{margin:0;padding:0;background:${BACKDROP}}` +
      "svg{display:block}</style>" +
      scaled,
  );
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--force-device-scale-factor=2",
      `--window-size=${size},${size}`,
      `--screenshot=${pngPath}`,
      htmlPath,
    ],
    { stdio: "ignore" },
  );
  return pngPath;
}

function main(): void {
  requireTools();
  const work = mkdtempSync(join(tmpdir(), "flappytone-icons-"));
  try {
    execFileSync("mkdir", ["-p", OUT_DIR]);
    for (const { name, size, safeFrac, source } of SIZES) {
      const inner = Math.round(size * (safeFrac ?? 1));
      const mark = rasteriseMark(inner, source ?? ICON_SOURCE, work);
      // The shot comes back at 2x. Downscaling it here is what keeps the
      // curve's edges clean; rendering at 1x directly does not look the same.
      // `pad` then centres it on the backdrop when the mark is inset, and is a
      // no-op at full bleed. `-pix_fmt rgb24` drops the alpha channel, so
      // nothing iOS could composite onto black survives into the file.
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-i",
          mark,
          "-vf",
          `scale=${inner}:${inner}:flags=lanczos,` +
            `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:${BACKDROP}`,
          "-pix_fmt",
          "rgb24",
          "-frames:v",
          "1",
          join(OUT_DIR, name),
        ],
        { stdio: "inherit" },
      );
      console.log(
        `${name}  ${size}x${size}${safeFrac ? `  mark ${inner}px` : ""}`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
