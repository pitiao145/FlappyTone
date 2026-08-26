import type { Plugin, Connect } from "vite";

/**
 * The extra entries, and the clean URLs they are served at in production.
 * `index.html` is not here — Vite already serves it at `/`.
 */
const ENTRIES: Record<string, string> = {
  "/app": "/app.html",
  "/record": "/record.html",
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
export function prettyUrls(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url) {
      // Query and hash are preserved: `?intent=visualiser` rides along.
      const [path, rest] = req.url.split(/(?=[?#])/, 2) as [string, string?];
      const target = ENTRIES[path] ?? ENTRIES[path.replace(/\/$/, "")];
      if (target) req.url = target + (rest ?? "");
    }
    next();
  };

  return {
    name: "pretty-urls",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
