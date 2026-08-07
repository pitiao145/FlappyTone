/**
 * Build-time prerender of the landing copy into `index.html`.
 *
 * The app ships an empty `<div id="root">`, so a crawler that fetches `/` sees
 * the head and nothing else. Google renders JavaScript, but on a discretionary
 * second pass a young subdomain with no inbound links does not reliably get,
 * and link-preview bots (X, Slack, LINE, iMessage) never run JS at all. This
 * plugin writes the page's text into the HTML at build time.
 *
 * Two rules hold it together:
 *
 * 1. **It may import `src/brand.ts` and nothing else.** No game, render, audio
 *    or pitch imports — it is plain data to plain HTML. If it ever needs the
 *    engine, the design is wrong.
 * 2. **The block is genuinely visible**, never `display:none` or `hidden`.
 *    Content hidden from users is discounted or read as a spam signal, so
 *    hiding it would be both risky and pointless. `App`'s mount effect removes
 *    it after React has committed, so there is no blank frame.
 *
 * Despite living in `src/dev/`, this runs in Vite's Node process, not the
 * browser bundle — nothing here reaches `dist/assets/`.
 */

import type { Plugin } from "vite";
import { brand } from "../brand.ts";

/** HTML-escape every interpolated string. Copy is data, not markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const p = (s: string) => `<p>${esc(s)}</p>`;

/**
 * Styling for the block.
 *
 * This is the page's first paint — `App.css` and `tokens.css` both arrive with
 * the bundle, so nothing here can reference a custom property; the values are
 * the tokens' own, copied literally. What matters is that it *matches the real
 * hero*: same 760px column, same 16px page padding, same `h1` clamp, same
 * accent on the tagline. React then replaces it with a layout that starts in
 * the same place at the same size, so the swap reads as the rest of the page
 * arriving rather than as a flash of a different document.
 *
 * Keep it in step with `.landing` / `.landing-hero` in `src/App.css` if those
 * move. (Values from `src/ui/tokens.css`: --surface #05070a, --ink #dfe5ec,
 * --ink-muted #9aa4b0, --ink-dim #6b7684, --accent #60cdff.)
 */
const STYLE = `
#prerender {
  background: #05070a;
  color: #dfe5ec;
  font: 16px/1.5 system-ui, sans-serif;
  padding: 16px 16px 48px;
}
#prerender .pr-col { width: 100%; max-width: 760px; margin-inline: auto; }
#prerender .pr-mark {
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0 0 48px;
}
#prerender h1 {
  font-size: clamp(1.9rem, 7vw, 2.7rem);
  line-height: 1.12;
  margin: 16px 0 12px;
  font-weight: 700;
  text-wrap: balance;
}
#prerender .pr-tagline { font-size: 1.4rem; color: #60cdff; margin: 0 0 12px; }
#prerender h2 { font-size: 1.4rem; margin: 48px 0 12px; font-weight: 600; }
#prerender h3 { font-size: 1.2rem; margin: 24px 0 8px; font-weight: 600; }
#prerender p { margin: 0 0 12px; color: #9aa4b0; line-height: 1.6; max-width: 52ch; }
#prerender ul { margin: 0 0 12px; padding-left: 18px; color: #9aa4b0; line-height: 1.6; }
#prerender li { margin-bottom: 6px; }
#prerender .pr-foot { color: #6b7684; font-size: 0.85rem; margin-top: 48px; }
`.trim();

/** The landing page's text, in document order, as static HTML. */
function renderStatic(): string {
  const tones = ([1, 2, 3, 4] as const)
    .map((t) => {
      const info = brand.tones[t];
      return `<li>${esc(info.pinyin)} ${esc(info.hanzi)} — tone ${t}: ${esc(info.cue)}</li>`;
    })
    .join("");

  return [
    // Inside the block, not before it, so removing the block removes the CSS
    // with it and leaves nothing behind in the DOM.
    `<div id="prerender"><style>${STYLE}</style><div class="pr-col">`,
    // The wordmark row is the nav's first line, so the top of the page does
    // not jump when React swaps the real nav in over it.
    `<p class="pr-mark">${esc(brand.name)}</p>`,
    `<h1>${esc(brand.headline)}</h1>`,
    `<p class="pr-tagline">${esc(brand.tagline)}</p>`,
    p(brand.pitch),
    p(brand.requirement),

    `<h2>How it works</h2>`,
    ...brand.howItWorks.map(
      (s) => `<h3>${esc(s.title)}</h3>${p(s.body)}`,
    ),
    `<ul>${tones}</ul>`,

    `<h2>${esc(brand.visualiser.title)}</h2>`,
    p(brand.visualiser.body),

    // Flattened rather than wrapped in <details>: collapsed copy counted
    // against the sibling project's thin-content read. The React page keeps
    // its disclosure; this does not.
    `<h2>${esc(brand.mobile.title)}</h2>`,
    p(brand.mobile.summary),
    p(brand.mobile.body),
    p(brand.mobile.meantime),
    `<ul><li>${esc(brand.mobile.ios)}</li><li>${esc(brand.mobile.android)}</li></ul>`,
    p(brand.mobile.note),

    `<h2>What it doesn't do</h2>`,
    `<ul>${brand.limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,

    `<p class="pr-foot">${esc(brand.attribution)}</p>`,
    `</div></div>`,
  ].join("");
}

export function prerenderLanding(): Plugin {
  return {
    name: "prerender-landing",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // The game entry only. `record.html` is Jane's booth: noindex twice
        // over, and it must stay that way.
        const file = ctx.filename.replace(/\\/g, "/");
        if (file.includes("record")) return html;
        if (!file.endsWith("index.html")) return html;
        return html.replace(
          '<div id="root"></div>',
          `${renderStatic()}<div id="root"></div>`,
        );
      },
    },
  };
}
