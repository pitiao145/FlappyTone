/**
 * Build-time render of every indexable page in the route table
 * (`src/site/routes.ts`). Two kinds of route:
 *
 * - `shell: "own"` (`/`, the legal pages) keep their own HTML entry and are
 *   prerendered in place, as before (`index.html`, `privacy-policy.html`, …).
 * - `shell: "site"` routes share one HTML shell (`site.html`) and one client
 *   entry (`src/site/main.tsx`). After the build writes `dist/site.html`, this
 *   plugin copies it to `dist/<path>/index.html` once per route, with that
 *   route's `<html lang>`, head tags (`siteFiles.ts`'s `headTags`) and body,
 *   then deletes `dist/site.html`.
 *
 * It also emits `sitemap.xml` and `llms.txt` from the same table.
 * `app.html`/`record.html` are not in the table — noindex JS shells.
 *
 * The app ships an empty `<div id="root">`, so a crawler that fetches `/` sees
 * the head and nothing else. Google renders JavaScript, but on a discretionary
 * second pass a young subdomain with no inbound links does not reliably get,
 * and link-preview bots (X, Slack, LINE, iMessage) never run JS at all.
 *
 * **This renders the real component, not a copy of its copy.** The first
 * attempt emitted a hand-written block of `brand.ts` strings with its own
 * inline styles; even styled to match, the swap to React's version was a
 * visible flash of a different document. Now `renderToStaticMarkup(<Landing/>)`
 * runs at build time and the result goes *inside* `#root`, so the first paint
 * is the landing page — same markup, same class names, and `App.css` is a
 * render-blocking `<link>`, so it is already styled. React then replaces it
 * with an identical tree.
 *
 * How it runs: Node cannot import `.tsx`, so `transformIndexHtml` kicks off a
 * nested Vite SSR build of `prerenderEntry.tsx` to a scratch directory outside
 * `dist/`, imports the result, and calls it. Two aliases keep that bundle
 * honest — `DemoLoop` becomes a static placeholder (it is a rAF canvas loop
 * with nothing to draw in Node), and `import.meta.env.DEV` is false there, so
 * no dev subtree can be reached from it either.
 *
 * Production build only. In `vite dev` the page is served by the module graph
 * anyway and there is no crawler to serve.
 */

import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { ROUTES, routeFor, type SiteRoute } from "../site/routes.ts";
import { headTags, jsonLdTags, llmsTxt, sitemapXml } from "../site/siteFiles.ts";

const ROOT_DIV = '<div id="root"></div>';
const HEAD_MARK = "<!--SITE_HEAD-->";
const LANG_MARK = "%SITE_LANG%";
const SITE_SHELL = "site.html";

type PrerenderModule = {
  renderLanding: () => string;
  renderTerms: () => string;
  renderPrivacy: () => string;
  renderSitePage: (path: string) => string;
  siteJsonLd: (path: string) => object[];
};

/** Build `prerenderEntry.tsx` for Node once and import it. */
async function loadPrerenderModule(root: string): Promise<PrerenderModule> {
  // Imported lazily and by name so this module stays cheap for `vite dev`.
  const { build } = await import("vite");
  const react = (await import("@vitejs/plugin-react")).default;

  // Inside the project, not os.tmpdir(): the SSR bundle leaves react and
  // react-dom external, so it has to sit somewhere Node's resolver can still
  // find node_modules from. Not under dist/ — nothing here ships.
  const outDir = resolvePath(root, "node_modules/.flappytone-prerender");
  await mkdir(outDir, { recursive: true });
  try {
    await build({
      root,
      // configFile: false — otherwise this build reads vite.config.ts, finds
      // this plugin in it, and recurses.
      configFile: false,
      logLevel: "warn",
      plugins: [react()],
      resolve: {
        alias: [
          {
            // Matched against the import specifier (`./DemoLoop.tsx`), not the
            // resolved path — a pattern anchored to `src/ui/` silently never
            // fires and the real canvas loop renders instead. It must also
            // consume the *whole* specifier: a regex matching only the tail
            // leaves the leading `./` glued to the replacement.
            find: /^.*DemoLoop\.tsx$/,
            replacement: resolvePath(root, "src/dev/demoStub.tsx"),
          },
        ],
      },
      build: {
        ssr: resolvePath(root, "src/dev/prerenderEntry.tsx"),
        outDir,
        emptyOutDir: true,
        minify: false,
      },
    });

    const entry = pathToFileURL(join(outDir, "prerenderEntry.js")).href;
    return (await import(entry)) as PrerenderModule;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

function renderRoute(mod: PrerenderModule, route: SiteRoute): string {
  return route.render === "renderSitePage" ? mod.renderSitePage(route.path) : mod[route.render]();
}

/** The shell with one route's lang, head and (optionally) body filled in. */
export function fillShell(
  html: string,
  route: SiteRoute,
  markup?: string,
  jsonLd: readonly object[] = [],
): string {
  if (!html.includes(HEAD_MARK) || !html.includes(LANG_MARK) || !html.includes(ROOT_DIV)) {
    throw new Error(`prerender: ${SITE_SHELL} is missing a marker`);
  }
  const head = jsonLd.length ? `${headTags(route)}\n    ${jsonLdTags(jsonLd)}` : headTags(route);
  // A function replacer: a `$` in the JSON-LD must not read as a pattern.
  let out = html.replace(LANG_MARK, route.lang).replace(HEAD_MARK, () => head);
  if (markup !== undefined) out = out.replace(ROOT_DIV, `<div id="root">${markup}</div>`);
  return out;
}

/** `dist/<path>/index.html` for a site route (root is never a site route). */
function siteOutFile(outDir: string, route: SiteRoute): string {
  return join(outDir, route.path.replace(/^\//, ""), "index.html");
}

export function prerenderLanding(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let isBuild = false;
  let mod: Promise<PrerenderModule> | null = null;
  const prerender = () => (mod ??= loadPrerenderModule(root));

  return {
    name: "prerender-landing",
    configResolved(config) {
      root = config.root;
      outDir = resolvePath(config.root, config.build.outDir);
      isBuild = config.command === "build";
    },
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        const file = ctx.filename.replace(/\\/g, "/");
        const basename = file.slice(file.lastIndexOf("/") + 1);
        if (basename === SITE_SHELL) {
          // Dev: fill the head for the requested route, no body (the module
          // graph renders it). Build: leave the markers for writeBundle.
          if (isBuild) return html;
          const path = (ctx.originalUrl ?? "/").split(/[?#]/)[0];
          const route = routeFor(path);
          return route ? fillShell(html, route) : html;
        }
        if (!isBuild) return html;
        // Only `shell: "own"` routes get baked in here. `app.html` and
        // `record.html` are not in the route table, so a future rename can't
        // accidentally start prerendering them.
        const route = ROUTES.find((r) => r.shell === "own" && r.entry === basename);
        if (!route) return html;
        if (!html.includes(ROOT_DIV)) {
          // Better a loud build than a silent regression to an empty page.
          throw new Error(`prerender: could not find an empty #root in ${basename}`);
        }
        const markup = renderRoute(await prerender(), route);
        return html.replace(ROOT_DIV, `<div id="root">${markup}</div>`);
      },
    },
    generateBundle() {
      if (!isBuild) return;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml() });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llmsTxt() });
    },
    async writeBundle() {
      if (!isBuild) return;
      const shellPath = join(outDir, SITE_SHELL);
      const shell = await readFile(shellPath, "utf8");
      const m = await prerender();
      for (const route of ROUTES.filter((r) => r.shell === "site")) {
        const file = siteOutFile(outDir, route);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          file,
          fillShell(shell, route, renderRoute(m, route), m.siteJsonLd(route.path)),
        );
      }
      // The bare shell has no route of its own; serving it would be an
      // empty duplicate page.
      await unlink(shellPath);
    },
  };
}
