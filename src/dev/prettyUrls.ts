import type { Plugin, Connect } from "vite";
import { ROUTES } from "../site/routes.ts";
import { llmsTxt, sitemapXml } from "../site/siteFiles.ts";

/**
 * The extra entries, and the clean URLs they are served at in production.
 * `index.html` is not here — Vite already serves it at `/`.
 */
const ENTRIES: Record<string, string> = {
  "/app": "/app.html",
  "/record": "/record.html",
  "/terms-of-service": "/terms-of-service.html",
  "/privacy-policy": "/privacy-policy.html",
};

/**
 * Gives `vite dev` and `vite preview` the same clean URLs `vercel.json`
 * rewrites in production.
 *
 * Without this the dev server only answers to the raw filenames, so a link had
 * to spell `/app.html` in dev and `/app` in production. That difference is not
 * cosmetic: the two builds then exercise different URLs, and anything keyed on
 * the path — the legacy-install redirect, a PostHog `$pathname` breakdown, a
 * `?intent=` hop — is being tested against a URL that never ships.
 *
 * A rewrite, not a redirect: the address bar keeps the clean URL, exactly as
 * Vercel's does. The raw `/app.html` still works, as it does in production.
 */
/**
 * Every `shell: "site"` route. Dev serves it from the shared shell; in
 * `vite preview` it is the real `dist/<path>/index.html` the build wrote
 * (`dist/site.html` no longer exists there). Preview needs the explicit map
 * because its SPA fallback answers `/chinese-tones` with `index.html` before
 * looking for the folder; Vercel serves the folder's index.html itself.
 */
const SITE_ROUTES = ROUTES.filter((r) => r.shell === "site");
const SITE_DEV: Record<string, string> = Object.fromEntries(
  SITE_ROUTES.map((r) => [r.path, "/site.html"]),
);
const SITE_PREVIEW: Record<string, string> = Object.fromEntries(
  SITE_ROUTES.map((r) => [r.path, `${r.path}/index.html`]),
);

function rewriter(entries: Record<string, string>): Connect.NextHandleFunction {
  return (req, _res, next) => {
    if (req.url) {
      // Query and hash are preserved: `?intent=visualiser` rides along.
      const [path, rest] = req.url.split(/(?=[?#])/, 2) as [string, string?];
      const target = entries[path] ?? entries[path.replace(/\/$/, "")];
      if (target) req.url = target + (rest ?? "");
    }
    next();
  };
}

/** Dev only: the build generates these into dist/ (see prerender.ts). */
const generatedFiles: Connect.NextHandleFunction = (req, res, next) => {
  const path = req.url?.split(/[?#]/)[0];
  if (path === "/sitemap.xml" || path === "/llms.txt") {
    res.setHeader(
      "Content-Type",
      path === "/llms.txt" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8",
    );
    res.end(path === "/llms.txt" ? llmsTxt() : sitemapXml());
    return;
  }
  next();
};

export function prettyUrls(): Plugin {
  return {
    name: "pretty-urls",
    configureServer(server) {
      server.middlewares.use(generatedFiles);
      server.middlewares.use(rewriter({ ...ENTRIES, ...SITE_DEV }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriter({ ...ENTRIES, ...SITE_PREVIEW }));
    },
  };
}
