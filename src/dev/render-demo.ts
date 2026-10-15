/**
 * Renders a demo-video scenario to MP4.
 *
 *   npm run render-demo -- demo/scenarios/<name>.json [--out file.mp4] [--stills 0,120,300]
 *
 * Starts a Vite dev server in-process, opens `demo-video.html` in headless
 * Chromium (Playwright), steps the page one frame at a time, screenshots the
 * game stage (canvas + the real HUD) and pipes each frame to ffmpeg. Jane's
 * clips are then fetched from the clips Worker the way the game fetches them
 * (a guest play ticket from `/token`, then `/clip/:speaker/:id`) and laid in
 * at the moment the game would play each one. `--stills` writes those frame
 * numbers as PNGs instead — a cheap look before a full render.
 * Dev-only: nothing here reaches `dist/`.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer, loadEnv } from "vite";
import { frameSize, validateScenario } from "./demoVideo/scenario.ts";

// The page side (src/dev/demoVideo/page.tsx) hangs its API on window.demo; this
// file compiles in the Node project, which has no DOM types, hence globalThis.
/* eslint-disable @typescript-eslint/no-explicit-any */

interface CueAudio {
  wordId: string;
  speakerId: string;
  updatedAt: string;
  atMs: number;
}

const args = process.argv.slice(2);
const scenarioPath = args.find((a) => !a.startsWith("--"));
if (!scenarioPath) {
  console.error("usage: npm run render-demo -- <scenario.json> [--out file.mp4] [--stills 0,120]");
  process.exit(1);
}
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const scenario = validateScenario(JSON.parse(readFileSync(scenarioPath, "utf8")));
const name = basename(scenarioPath).replace(/\.json$/, "");
const out = resolve(flag("out") ?? `demo/out/${name}.mp4`);
const stills = flag("stills")?.split(",").map(Number);
mkdirSync(dirname(out), { recursive: true });

function ffmpeg(argv: string[], stdin = false) {
  const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...argv], {
    stdio: [stdin ? "pipe" : "ignore", "inherit", "inherit"],
  });
  const done = new Promise<void>((ok, fail) => p.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exit ${c}`)))));
  return { p, done };
}

/** Jane's clips, fetched the way the game does. A missing one is skipped with a warning. */
async function fetchClips(cues: CueAudio[], dir: string): Promise<{ path: string; atMs: number }[]> {
  if (cues.length === 0) return [];
  const base = loadEnv("development", process.cwd(), "VITE_").VITE_CLIPS_BASE_URL;
  if (!base) {
    console.warn("VITE_CLIPS_BASE_URL is not set (.env.local) — rendering without Jane's clips");
    return [];
  }
  const tok = await fetch(`${base}/token`, { method: "POST" })
    .then((r) => r.json() as Promise<{ token?: string }>)
    .catch(() => null);
  if (!tok?.token) {
    console.warn("clips /token gave no ticket — rendering without Jane's clips");
    return [];
  }
  const got: { path: string; atMs: number }[] = [];
  for (const [i, c] of cues.entries()) {
    const url = `${base}/clip/${c.speakerId}/${c.wordId}?v=${encodeURIComponent(c.updatedAt)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.token}` } });
    if (!res.ok) {
      console.warn(`clip ${c.wordId}: ${res.status} — skipped`);
      continue;
    }
    const path = join(dir, `${i}-${c.wordId}.wav`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    got.push({ path, atMs: c.atMs });
  }
  return got;
}

const { w, h, outW, outH } = frameSize(scenario.format ?? "9:16");
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("vite did not report a URL");

const browser = await chromium.launch();
const tmp = mkdtempSync(join(tmpdir(), "ft-demo-"));
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: w, height: h },
    deviceScaleFactor: outW / w,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`${base}demo-video.html`);
  await page.waitForFunction(() => (globalThis as any).demo !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => (globalThis as any).demo.ready);
  const { fps } = await page.evaluate((s) => (globalThis as any).demo.setup(s), scenario);
  const step = (n: number): Promise<boolean> => page.evaluate((k) => (globalThis as any).demo.render(k), n);
  const shot = (): Promise<Buffer> => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h } });

  if (stills) {
    const want = new Set(stills);
    const last = Math.max(...stills);
    for (let i = 0; i <= last; i++) {
      if (!(await step(i))) break;
      if (want.has(i)) {
        const p = out.replace(/\.mp4$/, `-f${i}.png`);
        writeFileSync(p, await shot());
        console.log(p);
      }
    }
  } else {
    const silent = join(tmp, "silent.mp4");
    const enc = ffmpeg(
      ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
        "-vf", `scale=${outW}:${outH}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", silent],
      true,
    );
    let i = 0;
    while (await step(i)) {
      if (!enc.p.stdin!.write(await shot())) await new Promise((r) => enc.p.stdin!.once("drain", r));
      i++;
      if (i % fps === 0) process.stdout.write(`\r${(i / fps).toFixed(0)}s rendered`);
    }
    enc.p.stdin!.end();
    await enc.done;
    process.stdout.write("\n");

    const summary = await page.evaluate(() => (globalThis as any).demo.summary());
    const clips = await fetchClips(summary.cues as CueAudio[], tmp);
    const inputs: string[] = ["-i", silent];
    const legs: string[] = [];
    clips.forEach((c, k) => {
      inputs.push("-i", c.path);
      legs.push(`[${k + 1}:a]adelay=${Math.round(c.atMs)}:all=1[c${k}]`);
    });
    const labels = clips.map((_, k) => `[c${k}]`);
    if (scenario.music) {
      const vol = scenario.musicVolume ?? (clips.length ? 0.35 : 1);
      inputs.push("-stream_loop", "-1", "-i", resolve(scenario.music));
      legs.push(`[${clips.length + 1}:a]volume=${vol}[m]`);
      labels.push("[m]");
    }
    if (labels.length === 0) {
      await ffmpeg(["-i", silent, "-c", "copy", "-movflags", "+faststart", out]).done;
    } else {
      // Pad the mix with silence so it covers the whole video; -shortest then cuts to the picture.
      const graph = [...legs, `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad[a]`].join(";");
      await ffmpeg([...inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]).done;
    }
    console.log(`${out}  (${outW}×${outH}, ${(i / fps).toFixed(1)}s, ${clips.length} clips)`);
  }
  const s = await page.evaluate(() => (globalThis as any).demo.summary());
  console.log(JSON.stringify({ score: s.score, hearts: s.hearts, gates: s.gates }));
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  await server.close();
}
