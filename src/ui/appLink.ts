/**
 * The one place that knows where the game lives.
 *
 * The marketing site (`/`) and the game (`/app`) are separate Vite entries, so
 * moving between them is a real page navigation rather than a screen change.
 * `vercel.json` rewrites `/app` to `/app.html` in production and the
 * `prettyUrls` plugin does the same for dev and preview, so this is one
 * spelling everywhere — no `import.meta.env.DEV` branch, and no URL that only
 * exists in one of the two builds.
 */
export const APP_PATH = "/app";

/** What the game should do on arrival, when the landing page sent you there. */
export type AppIntent = "visualiser";

export function appHref(intent?: AppIntent): string {
  return intent ? `${APP_PATH}?intent=${intent}` : APP_PATH;
}

/**
 * Leave for the game.
 *
 * `assign` rather than `replace`: Back should return to the landing page, which
 * is where the player came from and, for a first-time visitor, the only thing
 * behind them.
 */
export function goToApp(intent?: AppIntent): void {
  window.location.assign(appHref(intent));
}

/**
 * The way back out to the marketing site.
 *
 * Not a bare "/": inside an installed app every load of "/" still looks like a
 * launch, so the legacy-install redirect in `index.html` would bounce this
 * straight back to the game and the link would read as broken. `?site` tells
 * that redirect this one was deliberate.
 */
export const SITE_HREF = "/?site";
