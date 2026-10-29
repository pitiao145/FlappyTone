import { useId, useMemo, useState } from "react";
import type { Tone } from "../../game/gates.ts";
import { wordsFromCatalog, wordsOfTone, type Word } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { goToApp, type AppIntent } from "../appLink.ts";
import { useNewsletterSubscribe } from "../useNewsletterSubscribe.ts";

/**
 * The landing page's plumbing: the bundled words for its tone cards, the CTA
 * events (`landing_cta_clicked`, the names the dashboards already read), the
 * torn-edge helper and the newsletter form.
 */

export const TONES: Tone[] = [1, 2, 3, 4];

/** Every CTA leaves for /app: a batched click would not survive the navigation. */
const INSTANT = { instant: true } as const;

export function useWordsByTone(): Map<Tone, Word[]> {
  return useMemo(() => {
    const words = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
    const map = new Map<Tone, Word[]>();
    for (const t of TONES) map.set(t, wordsOfTone(words, t));
    return map;
  }, []);
}

/** Fire the landing CTA event, then leave for /app (with an intent, or Play). */
export function go(cta: string, location: string, intent?: AppIntent) {
  capturePostHogEvent("landing_cta_clicked", { cta, location }, INSTANT);
  goToApp(intent);
}

/** Fire the landing CTA event, then leave for a site page (e.g. the free visualizer tool). */
export function goToPage(cta: string, location: string, href: string) {
  capturePostHogEvent("landing_cta_clicked", { cta, location }, INSTANT);
  window.location.assign(href);
}

/**
 * A torn paper edge as a `clip-path` polygon: seeded value noise along the top
 * and/or bottom edge, straight sides. Deterministic per seed, so the prerender
 * and the client agree.
 */
export function tornEdge(seed: number, edges: "top" | "bottom" | "both" = "both", depth = 1.4): string {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const steps = 36;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    const jt = edges !== "bottom" ? rand() * depth : 0;
    const jb = edges !== "top" ? rand() * depth : 0;
    top.push(`${x.toFixed(2)}% ${jt.toFixed(2)}%`);
    bottom.unshift(`${x.toFixed(2)}% ${(100 - jb).toFixed(2)}%`);
  }
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

export function NotifyForm({ className, cta, placeholder }: { className?: string; cta: string; placeholder: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const newsletter = useNewsletterSubscribe("mobile");
  if (newsletter.status === "success") {
    return <p className={className} role="status">You&rsquo;re on the list.</p>;
  }
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        newsletter.submit(email);
      }}
    >
      <label htmlFor={id}>Email address</label>
      <div>
        <input
          id={id}
          type="email"
          name="email"
          placeholder={placeholder}
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={newsletter.status === "loading"}
        />
        <button type="submit" disabled={newsletter.status === "loading"}>
          {newsletter.status === "loading" ? "Joining…" : cta}
        </button>
      </div>
      {newsletter.error && <p role="alert">{newsletter.error}</p>}
    </form>
  );
}
