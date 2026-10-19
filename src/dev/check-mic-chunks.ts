/**
 * After `npm run build`: proves the microphone stays out of every page that
 * must not open it (CLAUDE.md, "Three entries" rule 1).
 *
 * 1. `getUserMedia` appears only in the app/record entry chunks or the shared
 *    `mic-*.js` chunk (vite.config.ts names it).
 * 2. No HTML page other than /app and /record reaches a getUserMedia chunk
 *    through static imports — only through a dynamic `import()` (the tone
 *    checker's engine, loaded on the Start tap).
 *
 * Exits non-zero on a violation. Usage: npm run check:mic-chunks
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");
const MIC_OK = /^(app|record|mic)-[\w-]+\.js$/;
const MIC_PAGES = new Set(["app.html", "record.html"]);

const js = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
const src = new Map(js.map((f) => [f, readFileSync(join(ASSETS, f), "utf8")]));
const hasMic = (f: string) => src.get(f)?.includes("getUserMedia") ?? false;

let failed = false;
const fail = (msg: string) => {
  console.error(`✗ ${msg}`);
  failed = true;
};

for (const f of js) if (hasMic(f) && !MIC_OK.test(f)) fail(`getUserMedia in ${f}`);

/** Static imports only: `from"./x.js"` and bare `import"./x.js"`, never `import("./x.js")`. */
function staticImports(f: string): string[] {
  const code = src.get(f) ?? "";
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([\w.-]+\.js)["']/g)) out.add(m[1]);
  return [...out];
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...staticImports(f));
  }
  return seen;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "assets" ? [] : htmlFiles(p);
    return name.endsWith(".html") ? [p] : [];
  });
}

let pages = 0;
for (const html of htmlFiles(DIST)) {
  const rel = relative(DIST, html);
  if (MIC_PAGES.has(rel)) continue;
  pages += 1;
  const text = readFileSync(html, "utf8");
  const entries = [...text.matchAll(/\/assets\/([\w.-]+\.js)/g)].map((m) => m[1]);
  for (const e of entries) {
    for (const f of closure(e)) if (hasMic(f)) fail(`${rel} statically loads ${f} (getUserMedia)`);
  }
}

if (failed) process.exit(1);
console.log(
  `✓ getUserMedia only in: ${js.filter(hasMic).join(", ")}; ${pages} site pages load none of it up front`,
);
