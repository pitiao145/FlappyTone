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
 * Styling for the block. It is the page's first paint, before `App.css` has
 * loaded, so it should read as deliberate rather than as unstyled markup —
 * which also makes this a real LCP improvement, not just an SEO tax.
 */
const STYLE = `
#prerender {
  background: #05070a;
  color: #e6ecf2;
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  margin: 0;
  padding: 3rem 1.25rem 4rem;
  min-height: 100vh;
}
#prerender > * { max-width: 44rem; margin-inline: auto; }
#prerender h1 {
  font-size: clamp(1.9rem, 6vw, 2.75rem);
  line-height: 1.15;
  margin: 0 0 0.75rem;
}
#prerender h2 { font-size: 1.4rem; margin: 2.5rem 0 0.5rem; }
#prerender h3 { font-size: 1.05rem; margin: 1.5rem 0 0.25rem; }
#prerender p { margin: 0 0 0.75rem; color: #b9c4d0; }
#prerender h1 + p { color: #e6ecf2; font-size: 1.15rem; }
#prerender ul { margin: 0 0 0.75rem; padding-left: 1.1rem; color: #b9c4d0; }
#prerender li { margin-bottom: 0.4rem; }
#prerender .prerender-foot { color: #8895a3; font-size: 0.85rem; margin-top: 3rem; }
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
    `<div id="prerender"><style>${STYLE}</style>`,
    `<h1>${esc(brand.headline)}</h1>`,
    p(brand.tagline),
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

    `<p class="prerender-foot">${esc(brand.attribution)}</p>`,
    `</div>`,
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
