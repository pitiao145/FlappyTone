// CLI: npm run update-demo <hero|visualiser> [path-to-mp4]
//
// The landing page's two looping demo clips (src/ui/DemoLoop.tsx) each ship
// as a pair — a .webm (what most browsers actually decode) and a .mp4
// (Safari's fallback) — plus two places that hardcode the clip's native
// pixel size: DemoLoop.tsx itself (sets the live <video>'s aspect ratio) and
// src/dev/demoStub.tsx (the prerendered placeholder that reserves the same
// box so swapping the live video in doesn't shift the page — see its own
// comment). Updating a clip by hand means touching all four and keeping
// them in sync, which is exactly the kind of thing worth scripting once
// rather than redoing by hand every time.
//
// Usage: drop the new .mp4 at its usual path (public/hero/hero-flappytone.mp4
// or public/visualiser/visualiser-demo.mp4) and run:
//   npm run update-demo hero
//   npm run update-demo visualiser
// Or point it at a file elsewhere and this copies it into place first:
//   npm run update-demo hero ~/Downloads/new-hero-take.mp4
//
// What it does, in order: (1) copies the source over the target's .mp4 if a
// source path was given; (2) re-muxes that .mp4 losslessly to strip any
// audio track — DemoLoop.tsx's <video> is deliberately mute and mic-free,
// so a clip with sound would silently violate that; (3) reads its actual
// width/height; (4) transcodes a matching .webm (VP9, quality-based, muted);
// (5) rewrites the width/height constants in DemoLoop.tsx and demoStub.tsx
// to the new clip's real size, so the prerendered placeholder's aspect ratio
// never drifts from what the video actually is.
//
// Needs ffmpeg/ffprobe on PATH. Doesn't run the build — check the result
// with `npm run build` (or `npm run dev`) same as any other change.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

type Target = "hero" | "visualiser";

interface TargetConfig {
  mp4: string;
  webm: string;
  widthConst: string;
  heightConst: string;
}

const TARGETS: Record<Target, TargetConfig> = {
  hero: {
    mp4: "public/hero/hero-flappytone.mp4",
    webm: "public/hero/hero-flappytone.webm",
    widthConst: "HERO_CLIP_WIDTH",
    heightConst: "HERO_CLIP_HEIGHT",
  },
  visualiser: {
    mp4: "public/visualiser/visualiser-demo.mp4",
    webm: "public/visualiser/visualiser-demo.webm",
    widthConst: "VISUALISER_CLIP_WIDTH",
    heightConst: "VISUALISER_CLIP_HEIGHT",
  },
};

const DEMO_LOOP_PATH = "src/ui/DemoLoop.tsx";
const DEMO_STUB_PATH = "src/dev/demoStub.tsx";
/** Which demoStub.tsx function owns each target's placeholder. */
const STUB_FN: Record<Target, string> = {
  hero: "DemoLoop",
  visualiser: "VisualiserDemoLoop",
};

function requireTools(): void {
  for (const bin of ["ffmpeg", "ffprobe"]) {
    try {
      execFileSync(bin, ["-version"], { stdio: "ignore" });
    } catch {
      throw new Error(`${bin} not found on PATH — install it (e.g. brew install ffmpeg).`);
    }
  }
}

function probeSize(path: string): { width: number; height: number } {
  const out = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      path,
    ],
    { encoding: "utf8" },
  ).trim();
  const [width, height] = out.split("x").map(Number);
  if (!width || !height) {
    throw new Error(`Could not read ${path}'s dimensions from ffprobe output: "${out}"`);
  }
  return { width, height };
}

function hasAudio(path: string): boolean {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  ).trim();
  return out.length > 0;
}

/** Strips any audio track losslessly (stream copy, no re-encode). */
function stripAudio(path: string): void {
  const tmp = `${path}.muted.mp4`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", path, "-c:v", "copy", "-an", tmp], { stdio: "inherit" });
  copyFileSync(tmp, path);
  execFileSync("rm", [tmp]);
}

function transcodeWebm(mp4: string, webm: string): void {
  execFileSync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-i", mp4,
      "-an",
      "-c:v", "libvpx-vp9",
      "-crf", "32",
      "-b:v", "0",
      "-cpu-used", "1",
      "-row-mt", "1",
      "-pix_fmt", "yuv420p",
      webm,
    ],
    { stdio: "inherit" },
  );
}

/** Replaces `const NAME = <number>;` — throws if the pattern isn't found, rather than silently no-op-ing. */
function replaceConst(source: string, name: string, value: number, file: string): string {
  const re = new RegExp(`(const ${name} = )\\d+(;)`);
  if (!re.test(source)) {
    throw new Error(`Could not find "const ${name} = <number>;" in ${file} — did it get renamed?`);
  }
  return source.replace(re, `$1${value}$2`);
}

function updateDemoLoopConstants(cfg: TargetConfig, width: number, height: number): void {
  let src = readFileSync(DEMO_LOOP_PATH, "utf8");
  src = replaceConst(src, cfg.widthConst, width, DEMO_LOOP_PATH);
  src = replaceConst(src, cfg.heightConst, height, DEMO_LOOP_PATH);
  writeFileSync(DEMO_LOOP_PATH, src);
}

/** demoStub.tsx encodes the ratio as `Math.round((width * H) / W)` inside one function — scoped to that function's own body so the two targets' numbers can't cross-contaminate. */
function updateDemoStubRatio(target: Target, width: number, height: number): void {
  const src = readFileSync(DEMO_STUB_PATH, "utf8");
  const fnName = STUB_FN[target];
  const fnStart = src.indexOf(`function ${fnName}(`);
  if (fnStart === -1) {
    throw new Error(`Could not find "function ${fnName}(" in ${DEMO_STUB_PATH} — did it get renamed?`);
  }
  const fnEnd = src.indexOf("\n}\n", fnStart) + 3;
  const before = src.slice(0, fnStart);
  const body = src.slice(fnStart, fnEnd);
  const after = src.slice(fnEnd);

  const re = /Math\.round\(\(width \* \d+\) \/ \d+\)/;
  if (!re.test(body)) {
    throw new Error(
      `Could not find the height formula in ${fnName}() in ${DEMO_STUB_PATH} — did it change shape?`,
    );
  }
  const newBody = body.replace(re, `Math.round((width * ${height}) / ${width})`);
  writeFileSync(DEMO_STUB_PATH, before + newBody + after);
}

function fileSizeKiB(path: string): number {
  return Math.round(statSync(path).size / 1024);
}

function main(): void {
  const target = process.argv[2] as Target | undefined;
  const source = process.argv[3];

  if (target !== "hero" && target !== "visualiser") {
    console.error("Usage: npm run update-demo <hero|visualiser> [path-to-mp4]");
    process.exit(1);
  }
  const cfg = TARGETS[target];

  requireTools();

  if (source) {
    if (!existsSync(source)) throw new Error(`No such file: ${source}`);
    copyFileSync(source, cfg.mp4);
    console.log(`copied ${source} -> ${cfg.mp4}`);
  } else if (!existsSync(cfg.mp4)) {
    throw new Error(`${cfg.mp4} doesn't exist — drop the new clip there first, or pass a source path.`);
  }

  if (hasAudio(cfg.mp4)) {
    console.log(`${cfg.mp4} has an audio track — stripping it (the demo videos are always mute).`);
    stripAudio(cfg.mp4);
  }

  const { width, height } = probeSize(cfg.mp4);
  console.log(`${target}: ${width}x${height}`);

  transcodeWebm(cfg.mp4, cfg.webm);
  updateDemoLoopConstants(cfg, width, height);
  updateDemoStubRatio(target, width, height);

  console.log(
    `done — ${cfg.mp4} (${fileSizeKiB(cfg.mp4)} KiB), ${cfg.webm} (${fileSizeKiB(cfg.webm)} KiB). ` +
      `Constants updated in ${DEMO_LOOP_PATH} and ${DEMO_STUB_PATH}. Run "npm run build" and check the page.`,
  );
}

main();
