/**
 * The site pages' CTA routing (brief 25). A visitor who has not played or
 * spoken yet gets the Try it now demo in an overlay on the same page
 * (`DemoTrigger`); one who already got a personal result, or chose Play in
 * the nav, goes to /app, which is signup (`trackSignupCta` on those links).
 *
 * This file is in the pages' initial chunk, so it stays small: the overlay
 * and the game load on the tap (`import("./DemoOverlay.tsx")`).
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { captureGameEvent } from "../analytics/posthog.ts";
import type { SeoCta } from "../analytics/session.ts";

type Overlay = typeof import("./DemoOverlay.tsx");

/** Prerender (server snapshot) vs the live page (client snapshot); nothing changes later. */
const noSubscribe = () => () => {};

/** Where an overlay CTA goes without JS (or if the overlay fails to load). */
export const DEMO_FALLBACK_HREF = "/#demo";

function track(page: string, cta: SeoCta, target: "overlay" | "signup"): void {
  try {
    captureGameEvent({ type: "seo_cta_click", page, cta, target });
  } catch {
    // Analytics never breaks the page.
  }
}

/** For a signup CTA's `onClick`: the link itself leaves for /app. */
export function trackSignupCta(page: string, cta: SeoCta): void {
  track(page, cta, "signup");
}

/**
 * An overlay CTA. The prerendered HTML (and the first client render) is a
 * link to the landing page's demo, so it works without JS; once the page is
 * live it is a real button that opens the overlay.
 */
export function DemoTrigger({
  page,
  cta,
  seedId = null,
  className,
  onOpen: onOpenExtra,
  children,
}: {
  page: string;
  /** Called on each tap, before the overlay loads (a page's own analytics). */
  onOpen?: () => void;
  cta: SeoCta;
  /** A word to fly first; the demo ignores it if the game cannot fly it. */
  seedId?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [mod, setMod] = useState<Overlay | null>(null);
  const [open, setOpen] = useState(false);

  const onOpen = () => {
    onOpenExtra?.();
    track(page, cta, "overlay");
    import("./DemoOverlay.tsx")
      .then((m) => {
        setMod(m);
        setOpen(true);
      })
      .catch(() => window.location.assign(DEMO_FALLBACK_HREF));
  };

  return (
    <>
      {live ? (
        <button type="button" className={className} data-cta="overlay" aria-haspopup="dialog" onClick={onOpen}>
          {children}
        </button>
      ) : (
        <a className={className} data-cta="overlay" href={DEMO_FALLBACK_HREF}>
          {children}
        </a>
      )}
      {/* On <body>, not inside the article: the page's `.screen button`,
          `.legal-body` and jade `.pip-cta` rules must not restyle the demo. */}
      {open &&
        mod &&
        createPortal(<mod.DemoOverlay page={page} seedId={seedId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
