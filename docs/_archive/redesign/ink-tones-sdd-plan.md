# FlappyTone: Ink Tones Redesign — remaining phases (SDD plan)

Branch: `redesign/ink-tones` (already checked out, already ahead of `main` with
tokens + a bugfix-sweep commit). Do not create a worktree — this repo's
session works in place; commit directly to `redesign/ink-tones`.

## Context

Phase 1 (design tokens, palette values, font loading) and an initial bugfix
sweep are already committed on this branch (commits `08354b6` and the one
after it). `src/ui/tokens.css` now carries the ink-tones palette (jade
`--accent:#3ea88f`, vermillion `--danger:#e2543d`, warm paper `--ink:#f5f1ea`
on `--surface:#100d0e`), and `App.css` references these tokens throughout, so
most components already picked up the new palette automatically. What
remains is: consolidating/restyling the nav, reskinning the remaining
screens' spacing/type, adding missing UI elements (heart icons, listening
badge), migrating the last hardcoded canvas colors, and — newly requested —
auditing every interactive control for a hover state.

## Global Constraints (bind every task)

- **Never touch corridor/gate geometry, collision detection, scoring, trail/
  dot physics math, or timing constants** in `src/render/world.ts`,
  `src/render/scene.ts`, `src/game/*`, or the rAF loop structure in
  `src/ui/Game.tsx`. Only literal color values feeding `palette.ts` tokens
  and surrounding DOM/CSS may change. If a task's brief asks you to touch a
  color literal in `world.ts`, change only the color value on that exact
  line — not opacity math, not gradient stop positions, not geometry.
- `src/pitch/*` must stay Web-Audio-free — never import anything there.
- Any dev-only UI must stay gated behind `import.meta.env.DEV` at both the
  import site and the JSX usage site (see `src/dev/Lab.tsx` for the existing
  pattern). If you add or touch dev-only UI, after your change run:
  `npm run build && for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done`
  — must print nothing.
- Use only the existing design tokens in `src/ui/tokens.css` (`--surface`,
  `--surface-panel`, `--surface-deep`, `--canvas-backdrop`, `--ink`,
  `--ink-muted`, `--ink-soft`, `--ink-dim`, `--accent`, `--accent-rgb`,
  `--accent-ink`, `--accent-bright`, `--good`, `--warn`, `--danger`,
  `--danger-strong`, `--line`, `--line-soft`, `--line-strong`,
  `--radius-pill`, `--radius-md`, `--radius-sm`, `--font`, `--font-display`,
  `--font-mono`, `--text-*`, `--space-*`). Do not invent a new hex/rgba
  literal when an existing token expresses the same color — extend
  `tokens.css` with a new named token (and its `-rgb` twin if canvas-facing)
  only when no existing token fits, and say so in your report.
- `src/render/palette.ts:15-37`'s `FALLBACK` object must stay in sync with
  any token you add — it is what DOM-less contexts (tests, `npm run
  analyze`) read instead of `:root`.
- No browser-based QA. Verify every task with `npm run typecheck`,
  `npm run build`, and `npm run test`. All three must pass before a task is
  reported DONE.
- Every interactive control (button, link styled as a button, pill,
  dropdown item) must have a visible `:hover` state and a `:focus-visible`
  state, distinct from its resting state, using the existing tokens (e.g.
  a border-color or background shift toward `--accent`/`--ink`). This
  applies retroactively to controls other tasks style or restyle — if you
  add a new button-like element, give it hover/focus states in the same
  commit.
- Commit your own task's work when done (`git add` the specific files you
  touched, not `-A` blindly — check `git status` first for anything
  unrelated). Do not amend or rebase prior commits on this branch.

---

## Task 1: Hover and focus states for every button/pill in App.css

`src/ui/tokens.css` and `src/App.css` already carry the ink-tones palette,
but almost none of the button-like selectors in `App.css` have a `:hover` or
`:focus-visible` rule — resting-state colors only. Fix this globally, one
pass, rather than per-screen.

1. Grep `src/App.css` for every rule targeting a clickable element: bare
   `button` (there is no shared `.btn` class yet — each screen has its own
   selector), `.primary`, `.nav-cta-btn`, `.nav-cta-item`, `.nav-hamburger`,
   `.nav-link`, `.nav-shady-btn`, `.mic-stop`, `.pause-menu .link`,
   `.options-reveal`, `.resume-button`, `a` used as a button (e.g.
   `.landing-nav-links a`, `.landing button.link`), and any `.screen
   button`/`.menu button` rules. Confirm the actual full list by reading the
   file — this list is a starting point, not exhaustive.
2. For each, add (or extend an existing empty) `:hover` and `:focus-visible`
   rule. Conventions to follow, matching what's already used elsewhere in
   the file (e.g. `.pause-menu .link:hover` added in the prior commit — use
   it as the reference pattern):
   - Primary/filled buttons (background is `var(--accent)`): hover
     brightens slightly, e.g. `background: color-mix(in srgb, var(--accent)
     88%, white)` — this exact pattern already exists at `App.css:1067` for
     one button, reuse it for other primary buttons that lack it.
   - Outline/ghost buttons (transparent background, colored border/text):
     hover shifts `border-color` toward `var(--ink-soft)` or `var(--accent)`
     and `color` toward `var(--ink)`/`var(--accent-bright)`.
   - Plain text/link-styled buttons: hover adds or brightens an underline,
     or shifts color toward `var(--ink)`.
   - Destructive buttons (`--danger` family, e.g. `.mic-stop`): hover
     strengthens toward `var(--danger-strong)`, never toward `--accent`.
   - `:focus-visible` (not bare `:focus` — mouse clicks should not show a
     focus ring) gets a visible outline or box-shadow using `var(--accent)`
     at partial opacity, e.g. `outline: 2px solid var(--accent); outline-
     offset: 2px;` — consistent across all of them, one rule fits most; add
     it per-selector only where the outline needs repositioning (e.g. pill
     buttons may want `outline-offset: 3px` to clear the rounded corner).
   - Respect existing `:disabled` rules — hover/focus states must not
     apply when a button is disabled (`:hover:not(:disabled)` if the
     selector doesn't already exclude it structurally).
3. Do not change any element's resting-state (non-hover, non-focus) colors,
   layout, or markup — this task is additive CSS only.

Verification: `npm run typecheck && npm run build && npm run test`. No unit
test covers hover CSS — the pass/fail signal here is that none of the three
commands regress. Report which selectors you added hover/focus to (a list is
fine, not full diffs).

---

## Task 2: Reskin nav chrome + resolve the ambiguous mobile Play/hamburger pairing

Files: `src/ui/Nav.tsx`, `src/App.css` (selectors: `.landing-nav`,
`.nav-cta*`, `.nav-hamburger*`, `.nav-mobile-menu*`, `.nav-shady*`,
`.nav-app`).

Read `src/ui/Nav.tsx` in full first. Two triggers exist side by side in the
bar on narrow viewports: `.nav-cta` (the "Play ⌄" pill, which opens a
dropdown with "Web" / "iOS coming soon" — clicking "Web" calls the `onPlay`
prop, which navigates into the game) and `.nav-hamburger` (opens
`.nav-mobile-menu`, a portal to `document.body` listing the page's nav
sections from `brand.sections`). **Do not remove or merge either trigger —
they open different content and the Play pill's "expand into two options"
behavior is explicitly required to stay exactly as it is.** The fix-brief's
complaint is that the two are visually/semantically ambiguous side by side,
not that they're redundant in content. Resolve it by making them read as
two clearly distinct affordances, not by cutting one:

1. Restyle `.nav-cta-btn` as a filled jade pill (`background: var(--accent)`,
   `color: var(--accent-ink)`, `border-radius: var(--radius-pill)`) so it
   reads as the primary action.
2. Restyle `.nav-hamburger` as a plain icon-only ghost button (no
   background at rest, `color: var(--ink-muted)`) with a visible hover state
   (`color: var(--ink)`, subtle `background: var(--surface-panel)`) so it
   reads as secondary/utility, distinct from the filled Play pill next to
   it.
3. Add an `aria-label` to `.nav-hamburger` if one is missing (check current
   JSX — `Nav.tsx:241` already sets one conditionally; confirm it's present
   in both open/closed states) and consider adding a short visible label
   (e.g. "Menu") next to the icon on wider mobile widths if there's room —
   optional, only if it doesn't crowd the bar at 375px width.
4. Restyle `.nav-cta-menu` (the Web/iOS dropdown) and `.nav-mobile-menu`
   (the section-links overlay) with the new surface tokens
   (`--surface-panel` background, `--line` border, `--radius-md` corners)
   so they read as one consistent design language rather than each having
   ad hoc styling.
5. Restyle `.landing-nav` itself: background using `--surface` with the
   existing `color-mix` blur treatment (keep the sticky blur, just retint
   it), border-bottom using `--line`.
6. Add hover/focus states to every new/restyled interactive element here
   per Task 1's conventions (if Task 1 already covered `.nav-*` selectors,
   verify they still look right against the new colors from this task
   rather than re-adding).

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 3: Reskin Title, Settings, PauseOptions, GameOver, Calibration, HowTo

Files: `src/App.css` (selectors scoped to `.title-screen`, `.menu`,
`.settings-screen` or equivalent, `.pause-menu`/`.pause-options`,
`.gameover-screen` or equivalent, `.calibration-screen` or equivalent,
`.howto-screen` or equivalent — read `src/ui/Title.tsx`, `src/ui/
Settings.tsx`, `src/ui/PauseOptions.tsx`, `src/ui/GameOver.tsx`, `src/ui/
Calibration.tsx`, `src/ui/HowTo.tsx` first to get the exact class names each
one renders, since some may not match the guessed names above).

Apply the type and spacing side of the redesign that Phase 1's token swap
didn't cover on its own:

1. Headings (`h1`/`h2` at minimum, `h3` where it reads as a section title
   rather than a label) get `font-family: var(--font-display)` — add this
   once, scoped to `.screen h1, .screen h2` (there's already a `.screen h1`
   / `.screen h2` / `.screen h3` block around `App.css:61-73` — extend it
   rather than adding a parallel rule) so it applies to every screen that
   uses the shared `.screen` wrapper without per-screen repetition.
2. Audit spacing on each of the six screens against the `--space-*` scale —
   replace any bare pixel values you find in the selectors above with the
   nearest token (`--space-1` through `--space-6`), unless the value is
   intentionally not on the scale (e.g. a 1px hairline border) — leave
   those.
3. `Choice.tsx` (the shared segmented-control button-group used by
   `Settings.tsx` and `PauseOptions.tsx`) — check whether its selected/
   unselected states use tokens already; if not, wire them to `--accent`
   (selected) and `--ink-muted`/`--surface-panel` (unselected), and add
   hover/focus states per Task 1's conventions.
4. Do not change any of these screens' React structure, props, or logic —
   this is CSS/class-name-level only. If a screen's existing markup makes a
   requested style impossible without a structural change, skip that one
   item, note it in your report, and continue with the rest.

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 4: Heart icons as SVG + wire into Game.tsx HUD

Files: `src/ui/icons.tsx`, `src/ui/Game.tsx` (hearts render around
line 451-462 per earlier exploration — confirm exact lines by reading the
file first, they may have shifted).

1. In `src/ui/icons.tsx`, add a `HeartIcon` functional component following
   the exact pattern of the existing `PauseIcon`/`PlayIcon`/`GearIcon` in
   that file (same file, same export style, same prop shape — read the file
   first and match it exactly). It needs a `filled` boolean prop: filled
   renders a solid heart in `var(--danger)` (`fill="currentColor"`, no
   stroke needed if the existing icons don't stroke), unfilled renders an
   outline heart (`fill="none" stroke="currentColor"`), sized to match the
   existing icons' `width`/`height`/`viewBox` conventions in that file.
2. In `Game.tsx`, find where hearts are currently rendered in the HUD (grep
   `heart` in the file — case-insensitive, since it may currently be an
   emoji "❤️"/"♡" or a CSS-only shape). Replace with `<HeartIcon
   filled={i < livesRemaining} />` (adjust the exact prop/variable names to
   match what's actually in the surrounding code — read it first) mapped
   over the heart count. **Do not touch how the heart count itself is
   computed or updated** — only the render, which must stay driven by
   whatever state/ref the current code already reads.
3. Style the new icons in `App.css` (color via `var(--danger)` for filled,
   `var(--ink-dim)` or similar for the outline, sizing/gap consistent with
   the rest of the HUD).

Verification: `npm run typecheck && npm run build && npm run test` —
`src/ui/Game.tsx`-adjacent tests, if any exist, should still pass unchanged
since this is a render-only swap.

---

## Task 5: In-game status line using the existing per-tone hint copy

Files: `src/ui/Game.tsx`, `src/game/gates.ts` (read-only reference —
`TONE_INFO` is exported here, wrapping `src/brand.ts:75-79`'s `cue` field
per tone), `src/App.css`.

1. In `Game.tsx`, find the HUD's syllable/tone display (search for where
   the target syllable — pinyin/hanzi — is currently shown during a gate,
   and where `TONE_INFO` may already be imported/used for the tutorial-mode
   cue text). Add a status line beneath it, shown during normal play (not
   only tutorial mode — confirm current behavior first: if `TONE_INFO`'s
   cue is currently only rendered when a tutorial flag is set, this task is
   to make the format `say {pinyin} — {cue}` available on the standard HUD
   too, without removing whatever tutorial-only variant exists if it
   differs in wording).
2. Reuse `TONE_INFO[tone].pinyin` and `TONE_INFO[tone].cue` — do not invent
   new copy or duplicate the cue strings into `Game.tsx`.
3. Style it as a subtle single line at the bottom of the play area (the
   design reference: a quiet, secondary-colored line, `var(--ink-muted)` or
   `var(--ink-soft)`, small text size) — it must not visually compete with
   the corridor/canvas or overlap the HUD's existing score/hearts row.
4. This line is DOM/HUD chrome, not canvas — it must not affect the rAF
   loop, gate timing, or scoring in any way. If wiring it in requires
   reading which gate/tone is currently active, use whatever ref/state the
   existing HUD already reads for the syllable display — do not add new
   game-state plumbing.

Verification: `npm run typecheck && npm run build && npm run test`.

---

## Task 6: Migrate remaining hardcoded canvas colors to palette tokens

Files: `src/render/world.ts`, `src/render/palette.ts`.

`src/render/palette.ts:15-37` already centralizes most canvas colors via
CSS custom properties with a `FALLBACK` object for DOM-less contexts
(tests, `npm run analyze`). These literal (non-token) colors remain in
`src/render/world.ts` as of this plan being written — **re-confirm the
exact line numbers by reading the file first, they may have shifted since
this plan was drafted**:
- `~line 94` — `"rgba(210, 200, 140,"` (gate outcome "ok")
- `~line 96` — `"rgba(180, 180, 190,"` (gate outcome "unheard")
- `~line 203` — `rgba(6, 8, 12, ...)` (fade backdrop)
- `~line 344` — `"rgba(6, 8, 12, 0.97)"` / `"rgba(8, 10, 15, 0.82)"`
- `~line 474-478` — `rgba(255, 220, 120, ...)` (gate edge glow)
- `~line 554` — `rgba(255, 255, 255, ...)`
- `~line 662` — `rgba(190, 200, 215, ...)`

For each: read the surrounding draw call fully before touching it. Confirm
it is a color-only literal (a fill/stroke/rgba argument), not something
that also encodes geometry, timing, or an opacity curve tied to animation
progress — if a literal's numeric values are doing double duty (e.g. the
alpha channel is animated over time by code elsewhere in the same
expression), only replace the RGB triplet, never the animated alpha
expression.

1. For backdrop/fade colors (`~203`, `~344`): these are near-black —
   replace with `--canvas-backdrop-rgb` (already a token, `18, 15, 16` as
   of the Phase 1 commit) composited at the same alpha the literal already
   used.
2. For the gate-outcome colors (`~94`, `~96`) and the gate-edge glow
   (`~474-478`): these don't have an obvious existing token (amber/gold and
   grey-blue respectively, used only for gate pass/fail feedback — not the
   corridor or trail itself, which the Global Constraints forbid touching).
   Add two new tokens to `tokens.css` for these (e.g. `--gate-ok-rgb`,
   `--gate-unheard-rgb`, `--gate-glow-rgb`), matching or gently warming the
   existing hues to sit with the ink-tones palette (do not invent wildly
   different colors — these are functional feedback colors, not
   decoration, and changing what "pass" vs "fail" looks like is exactly the
   kind of functional change the Global Constraints forbid). Add the same
   values to `palette.ts`'s `FALLBACK` object and its exported lookup so
   DOM-less tests keep working.
3. For `~554`, `~662` (near-white / grey-blue): use `--ink-rgb` if it
   exists as a token already, or add it if not (check `tokens.css` first —
   `--ink` currently has no `-rgb` twin; add one, matching the hex-to-rgb of
   `--ink: #f5f1ea` → `245, 241, 234`, and its `FALLBACK` entry).
4. Confirm with `git diff fixtures/anchors` — per CLAUDE.md this must stay
   empty (it will, since this task only touches `src/render/world.ts` and
   `src/ui/tokens.css`/`src/render/palette.ts`, not the clip-cutting
   pipeline, but confirm it explicitly in your report).

Verification: `npm run typecheck && npm run build && npm run test` — pay
particular attention to `src/render/world.test.ts` and any `palette`-
related tests: they assert on structure/values that must not shift beyond
color. If any such test hardcodes an old literal color as an expected
value, update the test's expected value to match the new token-derived
color (not the geometry/timing assertions in the same test) and say so
explicitly in your report.

---

## Task 7: "Listening…" badge with animated waveform bars

Files: `src/ui/Game.tsx`, `src/App.css`.

The reference screenshots show a small pill badge near the target syllable
reading "listening…" with a few animated vertical bars beside it (a live-
mic indicator). Check `Game.tsx` first for whatever badge/text currently
signals "the mic is live" during a gate — the fix brief describes this as
"previously just a text badge," so there is likely an existing element to
extend rather than build from scratch.

1. Find the existing listening-state text/badge in `Game.tsx`'s HUD JSX.
2. Add 3-4 small vertical bar elements (plain `<div>`s or an inline SVG,
   whichever matches how the rest of the HUD is built) beside the text,
   animated via CSS only (`@keyframes`, staggered `animation-delay` per
   bar) — a simple height/opacity pulse is sufficient, no JS-driven
   amplitude metering. This is a purely decorative indicator, not a real
   audio-level meter — it must not read from the mic's actual RMS/frame
   data (that would cross into `src/audio`/`src/pitch` territory the
   Global Constraints reserve for game logic).
3. Respect `prefers-reduced-motion` — wrap the animation in `@media (prefers-
   reduced-motion: no-preference)` or provide a static fallback, matching
   whatever convention the codebase already uses elsewhere (check
   `src/index.css`/`App.css` for an existing `prefers-reduced-motion`
   block — there is at least one, in `src/index.css`, for scroll-behavior;
   follow the same pattern).
4. Style the badge pill with `--surface-panel` background, `--accent`
   text/bar color, `--radius-pill` — and give it a subtle presence, not a
   dominant HUD element.

Verification: `npm run typecheck && npm run build && npm run test`.
