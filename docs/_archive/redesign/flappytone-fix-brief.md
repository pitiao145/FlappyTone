# FlappyTone — Fix Brief for Coding Agent

Compiled from a live walkthrough of `localhost:5173` (desktop 1440px, mobile 390px), DOM/CSS audit, and console/network checks. Ordered by severity. Each item has enough detail to action directly — file/selector guesses are omitted since I don't have repo access; the agent should locate by the class names and text quoted.

---

## P0 — Functional bugs

1. **"Play" button on the app menu screen requires two clicks to register.**
   First click does nothing (no navigation, no console error); second click works. Likely a stale event listener, a focus-steal from a prior transition, or a double-render on mount. Repro: from landing page → "Play now" → app menu screen → click "Play" pill once (nothing happens) → click again (game loads).

2. **The homepage's autoplaying demo widget (top-right "no sound, no microphone" preview) is flaky across navigations.**
   On first load it renders fully (score, hearts, gear/pause icons, word display, listen badge, pitch curve). After navigating away (e.g. into the game) and back to the landing page — or on a hard reload — it sometimes renders only the lower graph portion, with the score/icons/word missing. Looks like a race condition in whatever drives the demo loop (interval/rAF starting before its DOM refs exist, or state not resetting on remount). Needs to render consistently every time, not just on the lucky first paint.

## P1 — Visual/layout bugs

3. **Sticky header clips the content directly beneath it.**
   On scroll (and especially after clicking an in-page nav anchor like "How it works"), the section heading/paragraph directly under the sticky nav is partially hidden behind it. Classic missing `scroll-margin-top` on anchor targets, or content padding not accounting for the fixed header's height. Every anchor-linked section (`#play`, `#how-it-works`, etc.) needs top scroll offset equal to the header height.

4. **Tone-mark glyphs (ˉ ˊ ˇ ˋ) render as nearly invisible in the "How it works" copy.**
   The line "ˉ ˊ ˇ ˋ are pitch diagrams…" shows almost nothing before "are pitch diagrams" — the spacing-modifier-letter glyphs aren't rendering visibly in the current font stack (system-ui/Arial fallback likely doesn't include usable glyphs for these at the given weight/size, or they're being rendered at near-zero opacity/color by mistake). Verify actual computed color/opacity first; if it's a genuine font-coverage gap, swap in a font (or inline SVG) that reliably renders these four marks — this line is doing real explanatory work and currently reads as broken.

3. **No consistent font-family is set at the base level.**
   `body`/`#root` have no explicit `font-family`, so any element that isn't individually given a font class falls back to the browser default (**Times**, confirmed via computed styles — 48 elements on the app-menu screen alone). This is why the app-menu screen and the "mobile nav" overlay look like a different, unstyled app: they're literally rendering in Times/Arial instead of the intended typeface. Fix: set `font-family` once on `html` or `body` (matching whatever the intended base font is — looks like it should be **Hanken Grotesk**, which is already loaded and used elsewhere) and remove the need for every component to re-declare it.

4. **Three visually distinct UI languages exist in the same app**, which reads as unfinished/inconsistent rather than intentional:
   - The marketing landing page: dark background, small pill buttons, sans-serif, blue accent.
   - The in-app main menu (reached via "Play now"): dark background, large full-width pill buttons, hamburger icon, a lot of unused vertical space (menu is pinned near the top of a tall dark viewport instead of vertically centered or filling the space intentionally).
   - The mobile nav overlay (hamburger menu): light background pills, bold serif text (this is the Times fallback from #7), buttons vertically centered with large dead space above — doesn't match either of the other two.
   These need to be unified under one set of design tokens (see design section below) rather than living as three separate stylesheets/components.

3. **Redundant/ambiguous header navigation on mobile.** The mobile header shows both a "Play ⌄" dropdown pill and a separate hamburger icon. Unclear what's split between them — likely to confuse first-time users about which one opens navigation vs. starts the game.

4. **Game viewport is a narrow fixed-width column on desktop**, leaving large dead black space on either side (roughly 500px of unused space per side at 1440px width). Fine as a deliberate "phone-shaped" constraint, but currently reads as unstyled/broken rather than intentional — needs a real background treatment or layout to make the choice look deliberate (see design notes).

## P2 — Content/UX polish

3. **"home page" link inside the in-game pause/settings overlay is unstyled plain text** — no button/link affordance (no underline, no color distinction, no hover state visible), sitting below a styled "quit" button. Either style it consistently with other actions or merge its function into an existing control.

4. Heading hierarchy on the landing page itself is clean (H1 → H2 → H3, no skipped levels) — no action needed there, flagging only so it's not "fixed" unnecessarily.

3. One `<img>` without alt text was detected on the landing page — locate and add descriptive `alt`.

---

## Notes on what's NOT a bug

**The "lab" tuning panel and the debug telemetry text (`unheard 1/1 · missed early 0`, etc.) are dev-environment only and not shipped to production** — confirmed by Pierre. I flagged these from a locally-served dev build without realizing that context; no action needed on either.

During the audit, several stray headings ("Ready to wrap up?", "What's still on your mind?", etc.) and extra font families (Newsreader/Georgia) showed up in a DOM-wide scan. These traced back to `#disconnect-widget-root` / `#dc-overlay` — a **browser extension's injected UI**, not part of the app. Excluded from the above; mentioning so nobody goes hunting for it in the codebase.

## Copy quality
Worth calling out separately from the bugs: the actual writing on this site is good — specific, a little wry, no generic "unlock your potential" filler. "What it doesn't do" candidly stating the tool's limits is the opposite of AI-slop marketing copy. Don't let a design pass sand that voice down.
