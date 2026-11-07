import { brand } from "../brand.ts";

/**
 * Real quotes from players, as brand.ts has them. Never add one nobody said.
 * The avatars are roster birds (docs/bird-design/roster), not the players.
 * Shown on the landing page's proof row and, one at a time, on the demo's
 * end screen.
 */
export const TESTIMONIALS = [
  { text: brand.notTextbook.quote, who: brand.notTextbook.quoteAttribution, bird: "lu_rou_fan" },
  { text: brand.tonePairs.quote, who: brand.tonePairs.quoteAttribution, bird: "boba" },
  { text: brand.pricing.quote, who: brand.pricing.quoteAttribution, bird: "ji_pai" },
].map((q) => ({ ...q, who: q.who.replace(/^—\s*/, "") }));

export type Testimonial = (typeof TESTIMONIALS)[number];

/** In memory: each demo end screen on this page load shows the next quote. */
let shown = 0;
export function nextQuoteIndex(): number {
  return shown++ % TESTIMONIALS.length;
}
