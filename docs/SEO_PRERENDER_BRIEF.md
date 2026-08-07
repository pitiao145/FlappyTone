# SEO prerender brief — make the landing page crawlable

Handoff spec. Implement in one pass; it is a single vertical slice and ends with a deployed, verifiable result.

## The problem

`index.html` ships an empty `<div id="root">`. Everything on the landing page —
hero, demo, "How it works", the four tone contours, the limits, the attribution —
exists only inside the JS bundle. A crawler that fetches the URL receives the
title and the PWA metas and nothing else. Verified against production on 7 Aug:

```
$ curl -s https://flappytone.pierrebuilds.dev/
title: FlappyTone
meta-viewport, meta-theme-color, meta-apple-mobile-web-app-*
(no body content)
```

Google renders JavaScript, but on a delayed second pass that it allocates at its
own discretion — a young subdomain with no inbound links is precisely who does
not get it. Link-preview bots (X, Slack, LINE, iMessage) **never** run JS at all,
so the share preview is permanently empty until tags exist in the HTML.

The sibling project (EasyCard) was deindexed for the adjacent reasons — thin
crawlable content plus a brand-name `h1` — and has not recovered in three
months. Avoid the repeat.

## Goal

The raw HTML served at `/` contains the landing page's text, a keyword-bearing
`<title>` and `h1`, a description, Open Graph and Twitter tags, and a canonical.
Everything a human sees today must still look and behave exactly as it does now.

## Hard constraints

1. **No new dependencies.** CLAUDE.md: ask before adding one. This needs none.
2. **`src/brand.ts` stays the single source of landing copy.** The prerender is
   generated *from* it. Do not duplicate strings into `index.html` by hand.
3. **The prerender must import only `src/brand.ts`.** No imports from
   `src/game/`, `src/render/`, `src/audio/`, `src/pitch/`. It is plain data →
   plain HTML. If it needs the game engine, the design is wrong.
4. **Do not hide the prerendered block with `display:none` or `hidden`.**
   Content hidden from users is devalued or treated as a spam signal, so it is
   both risky and ineffective. It must be genuinely visible during load.
5. **`record.html` is untouched.** It is `noindex` twice over (`X-Robots-Tag` in
   `vercel.json` and a meta tag in the file) and must stay that way — no
   prerender, no OG tags, no sitemap entry.
6. **Do not touch `src/pitch/`, the game loop, or the tuning constants.**
7. Dev-tooling boundary (CLAUDE.md rule 7) must still hold after the build.

---

## Task 1 — Prerender the landing copy into `index.html`

Add a Vite plugin using the `transformIndexHtml` hook. Put it in
`src/dev/prerender.ts` and register it in `vite.config.ts`.

```ts
// src/dev/prerender.ts (sketch — not final code)
import { brand } from '../brand.ts'

export function prerenderLanding(): Plugin {
  return {
    name: 'prerender-landing',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Only the game entry. record.html must not receive this.
        if (!ctx.filename.endsWith('index.html')) return html
        if (ctx.filename.includes('record')) return html
        return html.replace('<div id="root"></div>', renderStatic() + '<div id="root"></div>')
      },
    },
  }
}
```

`renderStatic()` emits a `<div id="prerender">` containing, in document order:

- `<h1>` — the new SEO headline (Task 3)
- `brand.tagline` and `brand.pitch` as paragraphs
- `brand.requirement`
- `<h2>How it works</h2>` + each `brand.howItWorks` entry as `<h3>` + `<p>`
- the four tones: `TONE_INFO` pinyin/hanzi/cue **as literal strings written in
  the plugin**, not imported from `game/gates.ts` (constraint 3). If that
  duplication is unacceptable, move the pinyin/hanzi/cue text into `brand.ts`
  and have `gates.ts` read it from there — that is the better fix.
- `<h2>{brand.visualiser.title}</h2>` + body
- `<h2>{brand.mobile.title}</h2>` + body, meantime, ios, android — **flattened,
  not inside `<details>`**. Collapsed content counted against EasyCard's
  thin-content read; the React page can keep its `<details>`, the prerender
  should not.
- `<h2>What it doesn't do</h2>` + `brand.limits`
- the footer attribution line for Jane's recordings

Escape all interpolated text (`&`, `<`, `>`, `"`).

**Styling.** Include a small inline `<style>` scoped to `#prerender` — background
`#05070a`, readable type, sensible max-width and spacing. Around 30 lines. The
block is the page's first paint, before `App.css` loads, so it should look
deliberate rather than like unstyled markup. This is a genuine LCP improvement,
not just an SEO tax.

**Removal.** In `App`, add a mount effect:

```ts
useEffect(() => { document.getElementById('prerender')?.remove() }, [])
```

This fires after React has committed, so there is no gap where the screen is
blank. It is idempotent, so StrictMode's double-invoke in dev is harmless.

**tsconfig.** `vite.config.ts` is in `tsconfig.node.json`'s `include`, so
importing `src/brand.ts` pulls it into the node project as well as the app one.
`brand.ts` is pure data with no DOM references, so it should be clean — but add
`src/brand.ts` and `src/dev/prerender.ts` to `tsconfig.node.json`'s `include` and
confirm `npm run typecheck` passes. CLAUDE.md flags this exact cross-project
hazard; do not skip the check.

---

## Task 2 — Head metadata in `index.html`

**Already done as of `b496357` and `1e5cab3` — do not redo, do not "improve":**

- `<meta name="description">` — present and keyword-bearing.
- Full Open Graph set: `og:title`, `og:description`, `og:image` (absolute),
  `og:image:width`/`height`/`alt`, `og:url`, `og:type`, `og:site_name`.
- `twitter:card=summary_large_image`. **Do not add `twitter:title`,
  `twitter:description` or `twitter:image`** — the Twitter card spec falls back
  to the `og:` tags when the `twitter:` equivalents are absent, so adding them
  is duplicated copy with two places to drift.
- `public/og.png` (1200×630), regenerated from `src/dev/og-source.svg` per
  `docs/BRAND.md`.
- Favicon set: `favicon.svg`, `icons/icon-32.png` PNG fallback,
  `apple-touch-icon.png`, 192/512/maskable-512.

**Still missing — add these two:**

```html
<title>Practice Mandarin Tones With Your Voice — FlappyTone</title>
<link rel="canonical" href="https://flappytone.pierrebuilds.dev/" />
```

The title is the last brand-only string in the head. Note the inconsistency it
creates today: `og:title` reads "FlappyTone — Mandarin tone trainer" while
`<title>` reads "FlappyTone". The share preview describes the product; the
search result does not. Bring the title up to match.

Canonical points at the bare URL, **not** `?app=1` — that variant is the PWA
start URL and must not become the canonical.

`src/brand.ts`'s header comment lists three files that "cannot read TypeScript
and must be edited by hand alongside a rename." Update that list: `index.html`
now also carries the description and OG copy, and `public/robots.txt` /
`public/sitemap.xml` are new hand-edited files.

---

## Task 3 — Fix the `h1`

`src/ui/Landing.tsx` currently renders:

```tsx
<h1>{brand.name}</h1>   // → "FlappyTone"
```

"FlappyTone" is a coined word with no search demand. This is the same mistake
that contributed to EasyCard's deindexing, where the `h1` was the brand name.

Add `brand.headline` — suggested: `"Practice Mandarin tones with your voice"` —
and render that as the `h1`. Demote `brand.tagline` to a `<p>`. The brand name
stays in `Nav`'s wordmark, where it already lives and where it belongs.

Keep the visual hierarchy as close to current as possible; this is a semantics
change, not a redesign.

---

## Task 4 — `robots.txt` and `sitemap.xml`

`public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /record
Sitemap: https://flappytone.pierrebuilds.dev/sitemap.xml
```

Do not disallow `/assets/` — Google needs the JS and CSS to render.

`public/sitemap.xml`: one `<url>` for `/`, **`lastmod` hardcoded to a real
date**. Do not generate it from `new Date()`. EasyCard's sitemap set
`lastModified: new Date()`, so every deploy falsely claimed the page had
changed; Google learns to distrust `lastmod` and then ignores it entirely.

---

## Task 5 — `SoftwareApplication` JSON-LD

One `<script type="application/ld+json">` in `index.html`: `name`,
`description`, `url`, `applicationCategory: "EducationalApplication"`,
`operatingSystem: "Any"`, `offers` with `price: "0"`.

**Do not add `FAQPage`.** Google deprecated FAQ rich results, and a controlled
study found no AI-citation uplift from it. It is dead weight.

---

## Acceptance criteria

```bash
npm run build
npm run typecheck
npm run test                                    # 136+ tests still green

# the landing text is in the HTML
grep -c "tone mark" dist/index.html             # >= 1
grep -c "humming will beat it" dist/index.html  # >= 1
grep -o "<title>[^<]*</title>" dist/index.html  # contains "Mandarin"
grep -c "rel=\"canonical\"" dist/index.html     # >= 1
grep -c "<h1" dist/index.html                   # >= 1

# regression guard — these already pass, they must keep passing
grep -c "og:image" dist/index.html              # >= 1
grep -c "twitter:card" dist/index.html          # >= 1
grep -c 'name="description"' dist/index.html    # >= 1
test -f dist/og.png && echo "og.png shipped"

# the recording booth is untouched
grep -c "prerender" dist/record.html            # 0
grep -c "og:image" dist/record.html             # 0
grep -c "noindex" dist/record.html              # >= 1

# dev tooling still absent (CLAUDE.md rule 7)
for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do
  grep -l "$s" dist/assets/*.js
done                                            # must print nothing
```

Then after deploying:

```bash
curl -s https://flappytone.pierrebuilds.dev/ | grep -i "tone mark"
```

If that returns nothing, neither does Google, and the task is not done.

**Manual checks:** load `/` with JS enabled — it must look and behave exactly as
before, with no visible leftover of the prerendered block. Load `/?app=1` — it
must still open straight into the game. Install to the home screen — still opens
into the game, not the landing page.

---

## Out of scope

- Any move to Next.js, Astro, Vike, or SSR. One page does not justify a
  framework migration.
- New landing sections, new routes (`/about`, `/faq`, `/how-to-play`), or a
  blog. More thin URLs on a subdomain with no authority makes things worse.
- Content expansion. The tone-explainer material is the right next addition, but
  it is a separate pass — this one is purely about making what exists visible.
- `FAQPage` schema.
- Changing the game, the tuning, or the mic-gesture flow.
