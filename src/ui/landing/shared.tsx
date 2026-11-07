import { useMemo } from "react";
import type { Tone } from "../../game/gates.ts";
import { wordsFromCatalog, wordsOfTone, type Word } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { goToApp, type AppIntent } from "../appLink.ts";

/**
 * The landing page's plumbing: the bundled words for its tone cards, the CTA
 * events (`landing_cta_clicked`, the names the dashboards already read), the
 * torn-edge helper.
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
