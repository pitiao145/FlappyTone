# FlappyTone: landing page content, IA & capture pass (SDD plan)

Written 11 Aug 2026. Companion file: `docs/redesign/footer-template.tsx` (also
in this handoff) — a reference implementation to adapt, not to drop in
unmodified.

## Relationship to `redesign/ink-tones`

This is a **separate work item** from the ink-tones visual pass. Ink-tones is
scoped to colors/type/hover-states only — its own Global Constraints
explicitly forbid touching React structure or copy. This plan does the
opposite: it changes section order, hero CTAs, and adds new copy and a new
component. **Do not run these two plans on the same commits.** Land or merge
`redesign/ink-tones` first, then branch this work from `main` (or rebase onto
it) so the two histories stay untangled. If ink-tones is still in flight when
this starts, coordinate rather than interleaving commits on the same branch.

## Context

`Landing.tsx` renders from `brand.ts` (copy) and `tokens.css` (color) by
design — see both files' header comments. Every task below follows that
convention: **new copy goes into `brand.ts`, not as a literal string in JSX.**
A task that hardcodes a string instead of adding it to `brand.ts` is not done.

## Global Constraints (bind every task)

- Never touch corridor/gate geometry, collision detection, scoring, trail/dot
  physics math, or the rAF loop structure in `src/ui/Game.tsx`,
  `src/render/world.ts`, `src/render/scene.ts`, or `src/game/*`. Nothing in
  this plan needs to.
- `src/pitch/*` stays Web-Audio-free — never import anything there.
- Use only existing tokens from `src/ui/tokens.css` (`--surface`,
  `--surface-panel`, `--ink`, `--ink-muted`, `--ink-soft`, `--accent`,
  `--accent-ink`, `--line`, `--radius-pill`, `--radius-md`, `--font`,
  `--font-display`, `--text-*`, `--space-*`, etc.). If a task needs a color or
  spacing value with no existing token, add it to `tokens.css` and say so in
  your report — don't invent an inline literal.
- Every interactive element (button, link-as-button, form input) needs a
  visible `:hover` and `:focus-visible` state, matching the conventions
  already in `App.css` (see `.pause-menu .link:hover` as the reference
  pattern, same as the ink-tones plan used).
- No browser-based QA available. Verify every task with
  `npm run typecheck && npm run build && npm run test`. All three must pass
  before a task is reported DONE.
- Commit your own task's work when done — `git add` the specific files you
  touched, not `-A`. Check `git status` first.
- All new/changed copy lives in `src/brand.ts`. All new component logic
  belongs in its own file under `src/ui/`, imported into `Landing.tsx` — don't
  grow `Landing.tsx` into a monolith.

---

## Task 1: Cut "Settings" from the hero CTA row

File: `src/ui/Landing.tsx` (the `hero-actions` div, around line 86-96).

A cold visitor has never played once — offering app configuration as a
top-level hero choice next to Play and Tutorial is dead weight in the
highest-value spot on the page. Settings is already reachable from inside the
app (pause menu / Title screen); it doesn't need a marketing-page entry point.

1. Remove the "Settings" button from `.hero-actions`. The row becomes two
   buttons: **Play** (primary, unchanged) and **Tutorial** (secondary,
   unchanged).
2. Confirm `onSettings` is still used elsewhere in `Landing.tsx`'s props
   contract (it's passed in from `App.tsx` — check whether removing its only
   call site here means the prop becomes unused and needs removing from
   `Props`, or whether it's referenced elsewhere e.g. from `Nav`). If it
   becomes a dead prop, remove it end-to-end (the call site in `App.tsx` too);
   if it's used elsewhere, leave the prop and just drop the hero button.
3. While here: reword the demo caption in the `#demo` section from the flat
   "Demo of the game." to something that does work — move this string into
   `brand.ts` as `brand.demoCaption` and set it to:
   **"A real run — no sound needed to see the shape."**
   (This matches `DemoLoop.tsx`'s own internal doc comment describing the
   clip as "a real recorded run... on mute" — the caption should say that,
   not just label it.)

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 2: Promote and reframe the Tone Visualiser section

Files: `src/brand.ts` (the `visualiser` object), `src/ui/Landing.tsx`.

The four tone-average charts (`ToneAverageCard`, currently rendered inside
"How it works") are the most differentiated content on the page — real
measured data from a native speaker's actual recordings, mean + every take
overlaid. The Visualiser section that lets a visitor *use* that same
mechanism on their own voice is currently one paragraph + a plain button, the
same visual weight as "Mobile app" below it. Fix both the copy and the
prominence.

1. In `brand.ts`, rewrite `visualiser`:
   - `title`: **"Can't hear the difference between mǎ and mà? Watch it
     instead."**
   - `body`: **"Say a tone as many times as you like and watch every attempt
     stack on the target shape — no gates, no score, no pressure. It's the
     fastest way to see what your voice is actually doing."**
   - `cta`: **"Try the visualiser"** (was "Open the visualiser" — lower
     commitment framing).
2. In `Landing.tsx`, move the `#visualiser` `<section>` to appear
   immediately after the hero/demo row (`#demo`), before `#how-it-works`. See
   Task 3 for the full resulting order — do both moves together if it's less
   error-prone than two separate diffs.
3. Give the section a visual, not just text + button. Reuse the existing
   `ToneAverageCard` component (already used in "How it works") — render one
   or two tone cards inside the visualiser section itself so the payoff is
   visible before someone clicks through. Read `ToneAverageCard.tsx` first to
   confirm its exact props (`tone`, `words`) and reuse the same
   `wordsByTone` map `Landing.tsx` already builds — don't duplicate the data
   loading.
4. Do not change anything about the actual `Visualiser.tsx` screen (the one
   behind `onVisualiser`) — this task is landing-page-only.

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 3: Reorder landing page sections

File: `src/ui/Landing.tsx`, `src/brand.ts` (`sections` array, which drives the
nav — keep it in sync with the new order).

Current order: Hero → Demo → How it works (+ tone charts) → Play → Visualiser
→ Mobile → Limits → Footer.

Target order: **Hero → Demo → Visualiser (Task 2) → How it works (+ tone
charts) → Play → Coming soon / email capture (Task 4) → Limits → Mobile →
Footer (Task 6).**

Reasoning (for context, not to second-guess): capture the email ask *before*
"What it doesn't do" and "one syllable only" — a visitor who reads the honest
limits first and then hits a signup ask has already been half talked out of
it. The limits section itself is good copy and stays as-is, just moved later.
Mobile drops to second-to-last since it's the least load-bearing section on
the page (a `<summary>` disclosure that's mostly "not built yet").

1. Reorder the `<section>` blocks in `Landing.tsx` to match the target order.
2. Update `brand.sections` (used by `Nav.tsx` to build the nav bar) so its
   array order matches the new page order — the nav should read top-to-bottom
   the same as the page scrolls.
3. Confirm anchor links (`#how-it-works`, `#play`, `#visualiser`, `#mobile`,
   `#limits`) still resolve correctly after the move — these are plain
   `id`-based anchors, moving the DOM node doesn't break the id, but double
   check the nav's `desktopLink`/`mobileLink` hrefs in `Nav.tsx` still line up
   with `brand.sections`.

Verification: `npm run typecheck && npm run build && npm run test`. Manually
confirm (read the rendered JSX / diff) that nav order and page order match.

---

## Task 4: "Coming soon" section — placeholder email capture

Files: `src/brand.ts` (new section), new `src/ui/ComingSoon.tsx`,
`src/ui/Landing.tsx`, `src/App.css`.

**This is a placeholder, not a working subscribe form.** Pierre will wire the
actual submit target to a Kit (ConvertKit) form later — this task builds the
UI only. Do not add any submit handler that posts anywhere, do not add a
fetch call, do not add `@vercel/blob` wiring. A visible `// TODO(pierre): wire
to Kit form embed` comment at the point where a real `action`/`onSubmit` would
go is required.

1. Add to `brand.ts`, a new object (name it `comingSoon`):
   - `title`: **"More words, and your own tone history — coming next"**
   - `body`: **"Right now it's one syllable, four tones — enough to test
     whether the mechanic works. Next up: a bigger word list, and a page that
     shows how your tone shapes change over time as you practice. Want to
     know when it ships?"**
   - `placeholder`: **"you@example.com"**
   - `cta`: **"Notify me"**
   - `disclaimer`: **"Only for FlappyTone updates. No spam, unsubscribe
     anytime."**
   Add a matching entry to `brand.sections` (`id: "coming-soon"`, not in nav —
   this section doesn't need its own nav link, it's discovered by scrolling,
   same as "Play" and "What it doesn't do" aren't over-promoted in nav
   either — check `inNav` usage on comparable sections first and match that
   convention).
2. New component `src/ui/ComingSoon.tsx`:
   - A form with a labeled email `<input type="email">` and a submit
     `<button>`, styled as a primary action (reuse the `.primary` button
     convention).
   - `onSubmit` prevents default and does **nothing else yet** — no network
     call. Leave the TODO comment specified above at that exact line.
   - Disclaimer text rendered small/muted below the form (`--ink-muted` or
     `--ink-soft`, `--text-xs`), matching how `.note` elements read elsewhere
     on the page.
   - Accessible: label associated with the input (visually-hidden label or
     visible label — either is fine, but it must not rely on `placeholder`
     alone for a screen reader).
3. Wire it into `Landing.tsx` at the position established in Task 3, reading
   copy from `brand.comingSoon`.
4. Style in `App.css`: input and button get `:hover`/`:focus-visible` states
   per the Global Constraints. Match `--radius-md` on the input, `--radius-pill`
   on the submit button, consistent with buttons elsewhere on the page.

Verification: `npm run typecheck && npm run build && npm run test`. Confirm
in your report that no network request is wired — this section must be inert
until Pierre connects the real form.

---

## Task 5: Mic-privacy reassurance line

Files: `src/brand.ts`, `src/ui/Landing.tsx`.

The hero already states `brand.requirement` ("Needs a microphone and a quiet
room.") but says nothing about what happens to the audio — a real source of
hesitation for a stranger being asked for mic access with zero context.

1. Add a new `brand.privacyNote` string:
   **"Your voice is processed on your device and never uploaded or stored.
   (Anonymous play analytics are separate and optional — see Settings.)"**
2. Render it directly under `brand.requirement` in the hero (`.note` class,
   same styling tier — this is a second short trust line, not a new section).
3. Confirm the claim is actually true before shipping this copy: check
   `src/pitch/` (must stay Web-Audio-free, per Global Constraints, which is
   also the technical proof the claim is accurate) and confirm
   `src/analytics/session.ts` really is the only thing that leaves the
   device, and only when consented. If anything about this claim is wrong,
   flag it in your report rather than shipping inaccurate copy — this is a
   trust statement, it has to be true.

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 6: Footer — adapt from `docs/redesign/footer-template.tsx`

Files: `src/brand.ts`, new `src/ui/Footer.tsx` (adapt from the reference),
`src/ui/Landing.tsx`, `src/App.css`, `src/ui/icons.tsx`.

`docs/redesign/footer-template.tsx` (delivered alongside this plan) is a
reference extracted and adapted from
`easy-card-balance-checker/app/components/Footer.js` — read its header
comment in full first, it explains exactly what was kept, dropped, and why.
It is **not** production code — treat it as a structural/content starting
point to integrate properly, not a file to copy in verbatim.

1. Move the hardcoded copy in the reference into `brand.ts` as a new
   `footer` object: `blurb`, `builtBy`, and a `connect` array (href, label,
   external, icon-kind) — see the reference's `CONNECT_LINKS` for the exact
   four entries (pierrebuilds.dev, X, Buy Me a Bubble Tea, email). Keep the
   existing `brand.attribution` string as-is; it's unrelated to this new
   object and already correct.
2. Add four new icon components to `src/ui/icons.tsx` — `WebIcon`, `XIcon`,
   `CoffeeIcon`, `MailIcon` — following the exact pattern of the existing
   `PauseIcon`/`PlayIcon`/`GearIcon`/`HeartIcon` in that file (same export
   style, same prop shape). Port the SVG paths from the reference's
   `ConnectIcon` switch statement. Do not leave inline SVGs in the footer
   component itself — this codebase's convention is icons live in
   `icons.tsx`.
3. Build `src/ui/Footer.tsx` as a real component (not the reference's
   inline draft): brand blurb + built-by line, a "Connect" column of the four
   links using the new icons, then the existing Jane attribution line. Read
   from `brand.footer` and `brand.attribution`.
4. **No email capture in the footer.** Per Pierre's call, FlappyTone gets one
   ask on the page — the dedicated Task 4 section — not a second one here.
   If you're tempted to port EasyCard's "stay in the loop" footer box,
   don't; that's deliberately out of scope for this task.
5. Replace the current one-line `<footer className="landing-footer">` in
   `Landing.tsx` with `<Footer />`.
6. Style in `App.css`: extend the existing `.landing-footer` selector rather
   than starting a parallel naming scheme (the reference proposes
   `.footer-grid`, `.footer-brand`, `.footer-connect`, `.footer-link`,
   `.footer-attribution` — treat these as a starting proposal, adjust if the
   existing `.landing-footer` rules conflict). Links need `:hover` and
   `:focus-visible` states per the Global Constraints — the reference's
   EasyCard original used a background-tint-on-hover treatment on each link's
   icon chip; a token-based equivalent (`--surface-panel` background,
   `--accent` on hover) is the closest match in FlappyTone's palette.

Verification: `npm run typecheck && npm run build && npm run test`. Confirm
the X link points to `https://x.com/PierreBuilds`, the coffee link to
`https://www.buymeacoffee.com/pierrebuilds`, and both open in a new tab
(`target="_blank" rel="noopener noreferrer"`) — the reference has this right,
don't drop it during adaptation.

---

## Not in scope for this pass

- The Mobile section's `<details>` collapse — flagged in the earlier audit as
  a pattern to watch (it's what hurt EasyCard's crawlable-content read), but
  low priority and not blocking. Leave it as-is unless Pierre asks for it
  separately.
- Wiring the real Kit/ConvertKit form — Task 4 builds the UI only.
- SEO prerender / OG tags / sitemap — already specced separately in
  `docs/SEO_PRERENDER_BRIEF.md`, a different work item.
- The post-run in-app capture prompt (after N runs on `GameOver`) — needs a
  new localStorage run-counter that doesn't exist yet. Deliberately deferred
  to a follow-up pass after this one ships.
