/**
 * Renders a demo-video scenario to MP4.
 *
 *   npm run render-demo -- demo/scenarios/<name>.json [--out file.mp4] [--stills 0,120,300]
 *
 * Starts a Vite dev server in-process, opens `demo-video.html` in headless
 * Chromium (Playwright), steps the page one frame at a time and pipes each
 * frame to ffmpeg as PNG. `--stills` writes those frame numbers as PNGs next
 * to the output instead of rendering the video — a cheap look before a full
 * render. Dev-only: nothing here reaches `dist/`.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

// The page side (src/dev/demoVideo/page.ts) hangs its API on window.demo; this
// file compiles in the Node project, which has no DOM types, hence globalThis.
/* eslint-disable @typescript-eslint/no-explicit-any */

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
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const name = basename(scenarioPath).replace(/\.json$/, "");
const out = resolve(flag("out") ?? `demo/out/${name}.mp4`);
const stills = flag("stills")?.split(",").map(Number);
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("vite did not report a URL");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`${base}demo-video.html`);
  await page.waitForFunction(() => (globalThis as any).demo !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => (globalThis as any).demo.ready);
  const { outW, outH, fps } = await page.evaluate((s) => (globalThis as any).demo.setup(s), scenario);
  await page.setViewportSize({ width: 400, height: 400 });

  const frameData = async (): Promise<Buffer> =>
    Buffer.from((await page.evaluate(() => (globalThis as any).demo.frame())).split(",")[1], "base64");

  if (stills) {
    const want = new Set(stills);
    const last = Math.max(...stills);
    for (let i = 0; i <= last; i++) {
      if (!(await page.evaluate((n) => (globalThis as any).demo.render(n), i))) break;
      if (want.has(i)) {
        const p = out.replace(/\.mp4$/, `-f${i}.png`);
        writeFileSync(p, await frameData());
        console.log(p);
      }
    }
  } else {
    const silent = out.replace(/\.mp4$/, ".silent.mp4");
    const ff = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart",
        scenario.music ? silent : out],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise<void>((ok, fail) => ff.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exit ${c}`)))));
    let i = 0;
    while (await page.evaluate((n) => (globalThis as any).demo.render(n), i)) {
      if (!ff.stdin.write(await frameData())) await new Promise((r) => ff.stdin.once("drain", r));
      i++;
      if (i % fps === 0) process.stdout.write(`\r${(i / fps).toFixed(0)}s rendered`);
    }
    ff.stdin.end();
    await done;
    process.stdout.write("\n");
    if (scenario.music) {
      await new Promise<void>((ok, fail) => {
        const m = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-stream_loop", "-1", "-i", resolve(scenario.music),
          "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", out], { stdio: "inherit" });
        m.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg mux exit ${c}`))));
      });
    }
    console.log(`${out}  (${outW}×${outH}, ${(i / fps).toFixed(1)}s, ${i} frames)`);
  }
  console.log(JSON.stringify(await page.evaluate(() => (globalThis as any).demo.summary())));
} finally {
  await browser.close();
  await server.close();
}
