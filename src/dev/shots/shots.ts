/**
 * Brief 54: phone screenshots of /app, with layout checks, and a contact sheet.
 *
 *   npm run shots                      # "after" shots, checks, contact sheet
 *   npm run shots -- --label before    # the baseline set
 *   npm run shots -- --only calibration,play --sizes 390,320
 *
 * Starts Vite in-process (like render-demo.ts), opens the dev-only
 * `shots.html` (GameApp without the login gate) in headless Chromium with a
 * fake mic that loops one of Jane's captures, and walks each flow at every
 * size, in the browser and as an installed PWA (display-mode standalone,
 * iPhone safe areas). Each state is a PNG and a run of `checks.browser.js`.
 *
 * Out: `shots-out/<label>/…png`, `shots-out/<label>/results.json`, and
 * `shots-out/index.html` (before/after side by side). Gitignored.
 * Exit code 1 when any in-scope check fails. Dev only: nothing here reaches
 * `dist/` (hard rule 7).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createServer } from "vite";

/* eslint-disable @typescript-eslint/no-explicit-any */

const root = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = flag("label") ?? "after";
const only = flag("only")?.split(",");
const sizeFilter = flag("sizes")?.split(",");
const outRoot = join(root, "shots-out");
const outDir = join(outRoot, label);

// ------------------------------------------------------------------ sizes

interface Size {
  id: string;
  w: number;
  h: number;
  dpr: number;
  /** Visible viewport in a browser tab: the device minus the status bar and the browser's own bars (approximate). */
  browserH: number;
  /** PWA standalone: safe-area insets (iPhone notch / home bar). */
  pwa: { top: number; bottom: number } | null;
}

const SIZES: Size[] = [
  { id: "320x568", w: 320, h: 568, dpr: 2, browserH: 460, pwa: { top: 20, bottom: 0 } },
  { id: "360x800", w: 360, h: 800, dpr: 3, browserH: 680, pwa: { top: 24, bottom: 16 } },
  { id: "375x667", w: 375, h: 667, dpr: 2, browserH: 548, pwa: { top: 20, bottom: 0 } },
  { id: "390x844", w: 390, h: 844, dpr: 3, browserH: 664, pwa: { top: 47, bottom: 34 } },
  { id: "430x932", w: 430, h: 932, dpr: 3, browserH: 746, pwa: { top: 59, bottom: 34 } },
  { id: "1280x800", w: 1280, h: 800, dpr: 1, browserH: 800, pwa: null },
];

type Mode = "browser" | "pwa";

interface Variant {
  size: Size;
  mode: Mode;
  key: string;
  vh: number;
  insets: { top: number; bottom: number };
}

const variants: Variant[] = SIZES.filter((s) => !sizeFilter || sizeFilter.includes(s.id) || sizeFilter.includes(String(s.w))).flatMap(
  (size) =>
    (["browser", "pwa"] as Mode[])
      .filter((mode) => mode === "browser" || size.pwa)
      .map((mode) => ({
        size,
        mode,
        key: `${size.id}-${mode}`,
        vh: mode === "pwa" ? size.h : size.browserH,
        insets: mode === "pwa" && size.pwa ? size.pwa : { top: 0, bottom: 0 },
      })),
);

// ------------------------------------------------------------------ seeds

/** A calibrated player (numbers from a real calibration), Pro so nothing is locked. */
const SEED: Record<string, string> = {
  "toneflap.settings.v3": JSON.stringify({ f0Center: 205, noiseFloor: 0.0008, rangeSemitones: 5.5, rangeDownSemitones: 5, voiceRms: 0.05 }),
  "flappytone.devtier": "pro",
};

function standaloneScript(on: boolean): string {
  if (!on) return "";
  return `
    Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q)
      ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {},
          addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
      : mm(q);`;
}

// ------------------------------------------------------------------ results

interface Result {
  flow: string;
  state: string;
  title: string;
  variant: string;
  file: string;
  failures: { check: string; detail: string }[];
  /** Reference only (out of scope, e.g. the tool page): reported, never fails the run. */
  reference?: boolean;
}

const results: Result[] = [];
const checksJs = readFileSync(join(root, "src/dev/shots/checks.browser.js"), "utf8");

interface SnapOpts {
  noNav?: boolean;
  /** Also shoot the screen's scroll container scrolled to its end. */
  scrollEnd?: boolean;
  ignore?: string[];
  reference?: boolean;
}

/** Elements that only exist in dev (Settings' Lab/login rows) or are not ours to fix. */
const ALWAYS_IGNORE = ["[data-shots-ignore]"];
/** Dev-only chrome a production build does not have, hidden so the layout matches prod. */
const DEV_ONLY_CSS = ".setting-dev { display: none !important; }";

function makeSnap(page: Page, flow: string, v: Variant) {
  return async (state: string, title: string, opts: SnapOpts = {}) => {
    await page.waitForTimeout(250);
    const shoot = async (suffix: string, stTitle: string) => {
      const file = join(flow, `${state}${suffix}__${v.key}.png`);
      mkdirSync(join(outDir, flow), { recursive: true });
      await page.screenshot({ path: join(outDir, file) });
      const failures = (await page.evaluate(
        (o) => (globalThis as any).__shotsCheck(o),
        { noNav: !!opts.noNav && v.size.w < 720, touch: v.size.w < 720, insets: v.insets, ignore: [...ALWAYS_IGNORE, ...(opts.ignore ?? [])] },
      )) as Result["failures"];
      results.push({ flow, state: state + suffix, title: stTitle, variant: v.key, file, failures, reference: opts.reference });
    };
    await shoot("", title);
    if (opts.scrollEnd) {
      const scrolled = await page.evaluate(() => {
        const els: any[] = [...(globalThis as any).document.querySelectorAll(".frame, .app-main, .screen, body, html")];
        let moved = false;
        for (const el of els) {
          if (el.scrollHeight > el.clientHeight + 2) {
            el.scrollTop = el.scrollHeight;
            moved = true;
          }
        }
        return moved;
      });
      if (scrolled) {
        await page.waitForTimeout(200);
        await shoot("-end", `${title} (scrolled to the end)`);
        await page.evaluate(() => {
          for (const el of (globalThis as any).document.querySelectorAll(".frame, .app-main, .screen, body, html")) el.scrollTop = 0;
        });
      }
    }
  };
}

// ------------------------------------------------------------------ flows

type Snap = ReturnType<typeof makeSnap>;
interface FlowCtx {
  page: Page;
  snap: Snap;
  base: string;
  v: Variant;
}

const clickText = async (page: Page, text: string | RegExp, scope = "button") => {
  await page.locator(scope, { hasText: text }).first().click({ timeout: 8000 });
};
const nav = async (page: Page, tab: string) => {
  await page.locator(".game-nav-item", { hasText: tab }).first().click({ timeout: 8000 });
};
const waitText = (page: Page, sel: string, text: string | RegExp, timeout = 20000) =>
  page.locator(sel, { hasText: text }).first().waitFor({ timeout });

/** Clicks through the level pick and the "Before you start" gate until `target` shows. */
async function passGates(page: Page, snap: Snap | null, target: string) {
  const shot = new Set<string>();
  for (let i = 0; i < 12; i++) {
    if (await page.locator(target).count()) return;
    if (await page.locator(".level-select-screen").count()) {
      if (snap && !shot.has("level")) await snap("level", "Level pick");
      shot.add("level");
      await clickText(page, "TOCFL 1");
      await page.locator(".level-select-screen .playhome-menu button.primary").click();
    } else if (await page.locator(".playhome-overlay", { hasText: "Before you start" }).count()) {
      if (snap && !shot.has("gate")) await snap("before-start", "Before you start");
      shot.add("gate");
      await clickText(page, /^OK$/);
    }
    await page.waitForTimeout(700);
  }
  await page.locator(target).waitFor({ timeout: 15000 });
}

const FLOWS: Record<string, { mic: "fake" | "denied"; run: (c: FlowCtx) => Promise<void> }> = {
  play: {
    mic: "fake",
    run: async ({ page, snap, base }) => {
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await page.waitForTimeout(600);
      await snap("home", "Play home");
      await clickText(page, "Modes");
      await page.locator(".mode-select-cards").waitFor();
      await snap("modes", "Modes");
      await clickText(page, "Tone Drill");
      await page.waitForTimeout(300);
      await snap("modes-drill", "Modes: Tone Drill pick");
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await page.locator(".playhome-menu button.primary").click();
      // A first Play asks for a level, then shows "Before you start"; shoot both, then go on.
      await passGates(page, snap, ".hud");
      await page.locator(".hud").waitFor({ timeout: 20000 });
      await page.waitForTimeout(5000);
      await snap("game", "In game, mid-run", { noNav: true });
      await page.evaluate(() => (globalThis as any).__ftMicStatus?.("recovering"));
      await page.waitForTimeout(300);
      await snap("game-mic", "In game: mic status banner", { noNav: true });
      await page.evaluate(() => (globalThis as any).__ftMicStatus?.("live"));
      await page.locator(".hud-button").first().click();
      await page.locator(".pause-card").waitFor();
      await snap("pause", "Paused", { noNav: true });
      await page.locator(".pause-settings-toggle").click();
      await page.waitForTimeout(300);
      await snap("pause-settings", "Paused: settings open", { noNav: true });
      await page.evaluate(() => {
        const t = { gates: 6, accSum: 4.6, unheard: 1, mismatched: 0, mismatchedAs: {}, best: 0.93 };
        (globalThis as any).__ftShots.gameOver({
          score: 1840, hearts: 0, combo: 0, bestMultiplier: 3,
          perTone: { 1: t, 2: { ...t, accSum: 3.9 }, 3: { ...t, accSum: 3.1 }, 4: { ...t, accSum: 5.2 } },
          perCombo: {},
        });
      });
      await page.locator(".gameover-screen").waitFor();
      await page.waitForTimeout(1500);
      await snap("gameover", "Game over", { scrollEnd: true });
    },
  },
  // Brief 55: streak card states, end-of-run lines/chip/teaser, compare view.
  comeback: {
    mic: "fake",
    run: async ({ page, snap, base }) => {
      const day = (o: number) => {
        const d = new Date();
        d.setDate(d.getDate() + o);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const streak = (last: string, current: number) => {
        const st = { lastPlayedDate: last, current, best: Math.max(current, 6) };
        let h = 0;
        const str = `${st.lastPlayedDate}:${st.current}:${st.best}:ft-streak`;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return JSON.stringify({ ...st, chk: h.toString(36) });
      };
      const seed = async (kv: Record<string, string | null>) => {
        await page.evaluate((kv) => {
          for (const [k, v] of Object.entries(kv)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
        }, kv);
      };
      const home = async (state: string, title: string, s: string | null) => {
        await seed({ "toneflap.streak.v1": s });
        await page.goto(`${base}shots.html`);
        await page.locator(".playhome-menu").waitFor();
        await page.waitForTimeout(500);
        await snap(state, title);
      };
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await home("home-done", "Play home: played today", streak(day(0), 4));
      await home("home-at-risk", "Play home: played yesterday", streak(day(-1), 3));
      await home("home-broken", "Play home: streak lost", streak(day(-3), 5));
      await home("home-new", "Play home: new account", null);

      // A free player with 3+ runs, two weeks of play (third tone improved).
      const mon = (o: number) => {
        const d = new Date();
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * o);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const lt = (attempts: number, acc: number) => ({ attempts, unheard: 0, accSum: attempts * acc, best: 1 });
      const history = {
        totalRuns: 9, bestScore: 2100, totalGates: 120, wordIds: [], lastRuns: [], statsVersion: 2,
        lifetimePerTone: { 1: lt(30, 0.81), 2: lt(30, 0.7), 3: lt(30, 0.64), 4: lt(30, 0.77) },
        lifetimePerCombo: {},
      };
      const wk = (a: number) => ({ 1: { attempts: 10, accSum: 8 }, 2: { attempts: 10, accSum: 7 }, 3: { attempts: 10, accSum: a }, 4: { attempts: 10, accSum: 7.5 } });
      const comeback = { days: { [mon(-1)]: 4, [day(0)]: 3 }, weeks: { [mon(-1)]: wk(5.5), [mon(0)]: wk(6.4) } };
      await seed({
        "flappytone.devtier": "free",
        "toneflap.streak.v1": streak(day(0), 4),
        "toneflap.history.v1": JSON.stringify(history),
        "toneflap.comeback.v1": JSON.stringify(comeback),
      });
      const over = async (goal: unknown) => {
        await page.goto(`${base}shots.html`);
        await page.locator(".playhome-menu").waitFor();
        await page.evaluate((goal) => {
          const t = { gates: 6, accSum: 4.6, unheard: 1, mismatched: 0, mismatchedAs: {}, best: 0.93 };
          (globalThis as any).__ftShots.gameOver(
            {
              score: 1840, hearts: 0, combo: 0, bestMultiplier: 3,
              perTone: { 1: t, 2: { ...t, accSum: 3.9 }, 3: { ...t, accSum: 3.1 }, 4: { ...t, accSum: 5.2 } },
              perCombo: {},
            },
            goal,
          );
        }, goal);
        await page.locator(".gameover-screen").waitFor();
        await page.waitForTimeout(1200);
      };
      await over({ runsToday: 3, goalJustCompleted: true });
      await snap("gameover-free", "End of run: free, daily goal, teaser");
      await page.locator(".go-compare-teaser").scrollIntoViewIfNeeded();
      await snap("gameover-free-teaser", "End of run: free, teaser in view");
      await page.locator(".go-compare-teaser").click();
      await page.locator(".tone-compare-sheet").waitFor();
      await page.waitForTimeout(400);
      await snap("compare-mock", "Compare view: mock-up (free)", { noNav: true });

      // Free: Progress accuracy (last 5 only) and the trend mock with icon pills.
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await nav(page, "Progress");
      await page.locator(".progress-screen").waitFor();
      await page.locator(".acc-tab", { hasText: "Accuracy progress" }).click();
      await page.waitForTimeout(800);
      await page.locator(".acc-tab").first().scrollIntoViewIfNeeded();
      await snap("progress-trend-free", "Progress: accuracy trend (free mock, icon pills)");
      await seed({ "flappytone.devtier": "pro" });
      await over({ runsToday: 2, goalJustCompleted: false });
      await snap("gameover-pro", "End of run: Pro (no teaser)");
      await page.locator(".go-insight").click();
      await page.locator(".progress-screen").waitFor();
      await page.waitForTimeout(800);
      await snap("tone-stats-link", "Weekly line → Progress tone accuracy");
      await nav(page, "Play");

      // Pro compare view with seeded weekly shapes (dev hook, fetchShapes).
      await page.evaluate(([thisMon, lastMon, twoMon, fourMon]) => {
        const line = (k: number) => Array.from({ length: 61 }, (_, i) => {
          const x = i / 60;
          return 3 - 2.2 * Math.sin(Math.PI * Math.min(1, x * 1.4)) * (1 - x) + 2.4 * x * x + k * 0.5 * Math.sin(x * 6);
        });
        const row = (key: string, d: string, k: number) => ({ key, day: d, sum: line(k).map((v) => v * 8), count: 8 });
        (globalThis as any).__ftShotsShapes = ["1", "2", "3", "4", "3-2", "2-4", "4-1"].flatMap((key) => [row(key, fourMon, 3), row(key, twoMon, 2.2), row(key, lastMon, 1.6), row(key, thisMon, 0.5)]);
      }, [mon(0), mon(-1), mon(-2), mon(-4)]);
      await nav(page, "Progress");
      await page.locator(".progress-screen").waitFor();
      await page.waitForTimeout(800);
      await snap("progress-top", "Progress: weekly headline");
      await page.locator(".tone-compare").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await snap("compare-pro", "Compare view: Pro");
      await page.locator(".tone-compare-pair").first().click();
      await page.waitForTimeout(300);
      await snap("compare-pro-pair", "Compare view: Pro, a tone pair");
      await page.locator(".compare-back-pill", { hasText: "2 weeks" }).click().catch(() => {});
      await page.locator(".week-picker-label").last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await snap("compare-pro-2w", "Compare view: Pro, compared with 2 weeks before");
    },
  },
  "mic-help": {
    mic: "denied",
    run: async ({ page, snap, base }) => {
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await page.locator(".playhome-menu button.primary").click();
      await passGates(page, null, ".mic-help, .playhome-overlay .error");
      await page.waitForTimeout(800);
      await snap("mic-help", "Mic blocked", { scrollEnd: true });
    },
  },
  visualiser: {
    mic: "fake",
    run: async ({ page, snap, base }) => {
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await nav(page, "Visualiser");
      await passGates(page, null, ".visualiser-screen");
      await page.waitForTimeout(5000);
      await snap("trace", "Visualiser with a trace");
      const picker = page.locator(".vis-filter-btn").first();
      if (await picker.count()) {
        await picker.click().catch(() => {});
        await page.waitForTimeout(500);
        await snap("picker", "Visualiser: tone picker open");
      }
    },
  },
  calibration: {
    mic: "fake",
    run: async ({ page, snap, base }) => {
      await page.goto(`${base}shots.html`);
      await page.locator(".playhome-menu").waitFor();
      await nav(page, "Settings");
      await page.locator(".settings-screen").waitFor();
      await page.waitForTimeout(500);
      await snap("settings", "Settings: Your voice", { scrollEnd: true });
      await clickText(page, /^Calibrate$/);
      await page.locator(".tuner-screen").waitFor({ timeout: 15000 });
      await page.waitForTimeout(700);
      await snap("room", "Calibration: Room, listening", { noNav: true });
      await page.locator(".tuner-verdict").waitFor({ timeout: 15000 });
      await snap("room-verdict", "Calibration: Room verdict", { noNav: true });
      await clickText(page, "Continue");
      await waitText(page, ".tuner-count", "Step 2");
      await page.waitForTimeout(1500);
      await snap("talk", "Calibration: Talk, mid-step", { noNav: true });
      await waitText(page, ".tuner-count", "Step 3", 40000);
      await page.waitForTimeout(1500);
      await snap("t1", "Calibration: 媽 mā", { noNav: true });
      await waitText(page, ".tuner-count", "Step 4", 40000);
      await page.waitForTimeout(1500);
      await snap("t3", "Calibration: 馬 mǎ", { noNav: true });
      await page.locator(".tuner-done").waitFor({ timeout: 40000 });
      await page.waitForTimeout(500);
      await snap("done", "Calibration: done, redo per part", { noNav: true, scrollEnd: true });
      await page.locator(".tuner-row button").first().click();
      await page.waitForTimeout(1500);
      await snap("redo", "Calibration: redo one part", { noNav: true });
    },
  },
  tool: {
    mic: "fake",
    run: async ({ page, snap, base }) => {
      await page.goto(`${base}tools/tone-visualizer`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);
      await snap("tool", "Site: /tools/tone-visualizer (reference)", { reference: true, scrollEnd: true });
      // Start: the shared Visualiser mounts in the page (brief 53).
      for (let i = 0; i < 3 && !(await page.locator(".visualiser-screen").count()); i++) {
        await page.locator(".tool-vis-start .sticker-button, .tool-vis-voice button").first().click().catch(() => {});
        await page.waitForTimeout(1500);
      }
      await page.locator(".visualiser-screen").waitFor({ timeout: 15000 });
      await page.locator(".visualiser-screen").scrollIntoViewIfNeeded();
      await page.waitForTimeout(5000);
      await snap("tool-live", "Site: tone visualizer running (reference)", { reference: true });
    },
  },
};

// ------------------------------------------------------------------ run

function captureWav(): string {
  const local = join(root, "fixtures/captures/jane_ma1.wav");
  if (existsSync(local)) return local;
  // A worktree: fixtures/captures is gitignored, so read the main checkout's.
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  const main = join(resolve(root, common), "..", "fixtures/captures/jane_ma1.wav");
  if (existsSync(main)) return main;
  throw new Error("fixtures/captures/jane_ma1.wav not found (the fake mic plays it)");
}

async function newContext(browser: Browser, v: Variant): Promise<BrowserContext> {
  const desktop = v.size.w >= 720;
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: v.size.w, height: v.vh },
    deviceScaleFactor: v.size.dpr,
    isMobile: !desktop,
    hasTouch: !desktop,
    userAgent: desktop
      ? undefined
      : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(
    `try { const s = ${JSON.stringify(SEED)}; for (const k in s) if (localStorage.getItem(k) === null) localStorage.setItem(k, s[k]); } catch {}
     ${standaloneScript(v.mode === "pwa")}`,
  );
  await ctx.addInitScript(checksJs);
  await ctx.addInitScript(`document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style"); s.textContent = ${JSON.stringify(DEV_ONLY_CSS)}; document.head.appendChild(s); });`);
  return ctx;
}

async function runFlow(browser: Browser, name: string, v: Variant, base: string) {
  const ctx = await newContext(browser, v);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: v.insets.top, bottom: v.insets.bottom, left: 0, right: 0 } });
  page.on("pageerror", (e) => console.error(`  [${name} ${v.key}] page error: ${e.message}`));
  try {
    await FLOWS[name].run({ page, snap: makeSnap(page, name, v), base, v });
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    console.error(`  [${name} ${v.key}] flow stopped: ${msg}`);
    const file = join(name, `_error__${v.key}.png`);
    mkdirSync(join(outDir, name), { recursive: true });
    await page.screenshot({ path: join(outDir, file) }).catch(() => {});
    results.push({ flow: name, state: "_error", title: "Flow stopped", variant: v.key, file, failures: [{ check: "flow", detail: msg }] });
  } finally {
    await ctx.close();
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    for (let it = queue.shift(); it; it = queue.shift()) await fn(it);
  }));
}

const server = await createServer({ root, server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("vite did not report a URL");

const wav = captureWav();
const fakeArgs = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"];
const fake = await chromium.launch({ args: fakeArgs });
const denied = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--deny-permission-prompts", "--autoplay-policy=no-user-gesture-required"] });

// A partial run (--only/--sizes) replaces just its own shots in the set.
const partial = !!only || !!sizeFilter;
if (!partial) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const flows = Object.keys(FLOWS).filter((f) => !only || only.includes(f));
const jobs = flows.flatMap((f) => variants.map((v) => ({ f, v })));
const t0 = Date.now();
console.log(`shots (${label}): ${flows.join(", ")} × ${variants.length} variants`);
try {
  // Vite transforms on first request; one warm-up load keeps the parallel runs from timing out.
  const warm = await fake.newPage({ ignoreHTTPSErrors: true });
  await warm.goto(`${base}shots.html`);
  await warm.locator(".playhome-menu").waitFor({ timeout: 120000 }).catch(() => {});
  await warm.close();
  await pool(jobs, 4, async ({ f, v }) => {
    await runFlow(FLOWS[f].mic === "fake" ? fake : denied, f, v, base);
    process.stdout.write(".");
  });
} finally {
  await fake.close();
  await denied.close();
  await server.close();
}
process.stdout.write("\n");

if (partial) {
  const mine = new Set(results.map((r) => `${r.flow}|${r.variant}`));
  const keep = readSet(label).filter((r) => !mine.has(`${r.flow}|${r.variant}`));
  results.unshift(...keep);
}
writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
writeContactSheet();

const failing = results.filter((r) => !r.reference && r.failures.length > 0);
for (const r of failing) {
  console.log(`✗ ${r.flow}/${r.state} @ ${r.variant}`);
  for (const f of r.failures) console.log(`    ${f.check}: ${f.detail}`);
}
const refFails = results.filter((r) => r.reference && r.failures.length > 0);
if (refFails.length) console.log(`(reference only, not counted: ${refFails.length} shots with findings — see results.json)`);
const total = failing.reduce((n, r) => n + r.failures.length, 0);
console.log(`${results.length} shots, ${failing.length} with failures (${total} findings), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`contact sheet: ${relative(process.cwd(), join(outRoot, "index.html"))}`);
process.exit(failing.length > 0 ? 1 : 0);

// ------------------------------------------------------------------ contact sheet

function readSet(l: string): Result[] {
  const p = join(outRoot, l, "results.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Result[]) : [];
}

function writeContactSheet() {
  const sets = readdirSync(outRoot).filter((d) => existsSync(join(outRoot, d, "results.json")));
  const order = ["before", ...sets.filter((s) => s !== "before" && s !== "after"), "after"].filter((s) => sets.includes(s));
  const data: Record<string, Result[]> = {};
  for (const s of order) data[s] = readSet(s);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlappyTone shots</title>
<style>
  :root { --ink:#2b2a26; --muted:#6f6a5c; --paper:#f7f1e3; --panel:#efe6d1; --bad:#c0392b; --good:#2f7d5b; }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.4 system-ui, sans-serif; background: var(--paper); color: var(--ink); }
  header { position: sticky; top: 0; z-index: 2; background: var(--paper); border-bottom: 1px solid #d8ccb0; padding: 10px 14px; display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; }
  header h1 { font-size: 17px; margin: 0; }
  header label { display:flex; gap:6px; align-items:center; min-height:44px; }
  select, button { font: inherit; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #cfc2a3; background: #fff; }
  .toc { padding: 8px 14px; display:flex; flex-wrap:wrap; gap:6px; }
  .toc a { padding: 8px 10px; background: var(--panel); border-radius: 999px; color: var(--ink); text-decoration:none; font-size: 13px; }
  .toc a.bad { background: #f4d4cf; }
  section { padding: 10px 14px 24px; border-bottom: 1px solid #e3d8bd; }
  section h2 { font-size: 16px; margin: 6px 0 2px; }
  section h2 small { color: var(--muted); font-weight: 400; }
  .row { display:flex; gap: 12px; overflow-x: auto; padding: 8px 0; scroll-snap-type: x proximity; }
  figure { margin:0; flex: 0 0 auto; scroll-snap-align: start; }
  figure .pair { display:flex; gap: 6px; }
  figure img { display:block; height: min(70vh, 560px); width:auto; border-radius: 8px; border: 1px solid #d8ccb0; background:#fff; }
  figure.desktop img { height: min(45vh, 360px); }
  figcaption { font-size: 12px; color: var(--muted); margin-top: 4px; max-width: 360px; }
  .tag { font-size: 11px; color: var(--muted); }
  .fails { color: var(--bad); font-size: 12px; margin: 4px 0 0; padding-left: 16px; max-width: 360px; }
  .ok { color: var(--good); }
  .missing { height: min(70vh,560px); width: 120px; display:grid; place-items:center; color: var(--muted); border:1px dashed #cfc2a3; border-radius:8px; font-size:12px; text-align:center; }
</style></head><body>
<header>
  <h1>FlappyTone shots</h1>
  <label>Show <select id="view">
    ${order.map((s) => `<option value="${s}"${s === "after" ? " selected" : ""}>${s}</option>`).join("")}
    ${order.length > 1 ? `<option value="both">${order[0]} | ${order[order.length - 1]}</option>` : ""}
  </select></label>
  <label>Mode <select id="mode"><option value="all">browser + PWA</option><option value="browser">browser</option><option value="pwa">PWA</option></select></label>
  <label><input type="checkbox" id="onlyBad"> only shots with findings</label>
</header>
<nav class="toc" id="toc"></nav>
<main id="main"></main>
<script>
const DATA = ${JSON.stringify(data)};
const SETS = ${JSON.stringify(order)};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function render() {
  const view = document.getElementById("view").value;
  const mode = document.getElementById("mode").value;
  const onlyBad = document.getElementById("onlyBad").checked;
  const show = view === "both" ? [SETS[0], SETS[SETS.length - 1]] : [view];
  const keys = new Map();
  for (const s of SETS) for (const r of DATA[s]) {
    const k = r.flow + "/" + r.state;
    if (!keys.has(k)) keys.set(k, { flow: r.flow, state: r.state, title: r.title, variants: new Set() });
    keys.get(k).variants.add(r.variant);
  }
  const find = (s, k, v) => DATA[s].find((r) => r.flow + "/" + r.state === k && r.variant === v);
  const vOrder = (v) => { const [w] = v.split("x"); return Number(w) * 10 + (v.endsWith("pwa") ? 1 : 0); };
  let html = "", toc = "";
  for (const [k, info] of keys) {
    const vs = [...info.variants].filter((v) => mode === "all" || v.endsWith(mode)).sort((a, b) => vOrder(a) - vOrder(b));
    const bad = vs.some((v) => show.some((s) => (find(s, k, v)?.failures.length ?? 0) > 0));
    if (onlyBad && !bad) continue;
    const id = k.replace(/[^a-z0-9]+/gi, "-");
    toc += '<a href="#' + id + '"' + (bad ? ' class="bad"' : "") + ">" + esc(info.title) + "</a>";
    html += '<section id="' + id + '"><h2>' + esc(info.title) + " <small>" + esc(k) + "</small></h2><div class=row>";
    for (const v of vs) {
      const desk = v.startsWith("1280");
      html += '<figure class="' + (desk ? "desktop" : "") + '"><div class=pair>';
      const notes = [];
      for (const s of show) {
        const r = find(s, k, v);
        if (r) html += '<a href="' + esc(s + "/" + r.file) + '" target=_blank><img loading=lazy src="' + esc(s + "/" + r.file) + '" alt="' + esc(s + " " + v) + '"></a>';
        else html += '<div class=missing>no ' + esc(s) + ' shot</div>';
        if (r) notes.push([s, r]);
      }
      html += "</div><figcaption>" + esc(v) + "</figcaption>";
      for (const [s, r] of notes) {
        if (r.failures.length === 0) html += '<div class="tag ok">' + esc(s) + ": ✓ checks pass</div>";
        else html += '<div class=tag>' + esc(s) + (r.reference ? " (reference)" : "") + ":</div><ul class=fails>" + r.failures.slice(0, 8).map((f) => "<li><b>" + esc(f.check) + "</b> " + esc(f.detail) + "</li>").join("") + (r.failures.length > 8 ? "<li>… " + (r.failures.length - 8) + " more</li>" : "") + "</ul>";
      }
      html += "</figure>";
    }
    html += "</div></section>";
  }
  document.getElementById("main").innerHTML = html || "<p style='padding:14px'>Nothing to show.</p>";
  document.getElementById("toc").innerHTML = toc;
}
for (const id of ["view", "mode", "onlyBad"]) document.getElementById(id).addEventListener("change", render);
render();
</script></body></html>
`;
  writeFileSync(join(outRoot, "index.html"), html);
}
