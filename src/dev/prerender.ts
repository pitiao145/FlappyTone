/**
 * Build-time render of static, indexable pages: the landing page into
 * `index.html`, and the legal pages into `terms-of-service.html` /
 * `privacy-policy.html`. See `PRERENDER_ENTRIES` below for the full set —
 * `app.html`/`record.html` are deliberately not in it.
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

import { mkdir, rm } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";

const ROOT_DIV = '<div id="root"></div>';

/**
 * Entries this plugin knows how to prerender, keyed by the built HTML
 * filename and naming the export in `prerenderEntry.tsx` that renders it.
 * `app.html` and `record.html` are deliberately absent — noindex JS shells,
 * per CLAUDE.md's landing-split rules. An entry not in this map is left
 * alone, not silently skipped-and-forgotten: see the explicit check below.
 */
const PRERENDER_ENTRIES: Record<string, keyof PrerenderModule> = {
  "index.html": "renderLanding",
  "terms-of-service.html": "renderTerms",
  "privacy-policy.html": "renderPrivacy",
};

type PrerenderModule = {
  renderLanding: () => string;
  renderTerms: () => string;
  renderPrivacy: () => string;
};

/** Build `prerenderEntry.tsx` for Node and run it. Returns the markup. */
async function renderEntryHtml(
  root: string,
  exportName: keyof PrerenderModule,
): Promise<string> {
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
    const mod = (await import(entry)) as PrerenderModule;
    return mod[exportName]();
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

export function prerenderLanding(): Plugin {
  let root = process.cwd();
  let isBuild = false;

  return {
    name: "prerender-landing",
    configResolved(config) {
      root = config.root;
      isBuild = config.command === "build";
    },
    transformIndexHtml: {
      order: "post",
      async handler(html, ctx) {
        if (!isBuild) return html;
        // Only entries in PRERENDER_ENTRIES get baked in. `app.html` and
        // `record.html` are noindex JS shells and must stay that way — they
        // are absent from the map, not special-cased here, so a future
        // rename can't accidentally start prerendering them.
        const file = ctx.filename.replace(/\\/g, "/");
        const basename = file.slice(file.lastIndexOf("/") + 1);
        const exportName = PRERENDER_ENTRIES[basename];
        if (!exportName) return html;
        if (!html.includes(ROOT_DIV)) {
          // Better a loud build than a silent regression to an empty page.
          throw new Error(
            `prerender: could not find an empty #root in ${basename}`,
          );
        }
        const markup = await renderEntryHtml(root, exportName);
        return html.replace(ROOT_DIV, `<div id="root">${markup}</div>`);
      },
    },
  };
}
