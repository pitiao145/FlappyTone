# Handoff: Progress screen redesign (+ Free/Pro pricing)

## Overview
Redesign of the `/app` "Progress" screen (`src/ui/Progress.tsx`). It keeps the same data and structure as today's screen but restyles it in a bolder, "indie-hacker" gamified visual language (thick ink borders, hard offset "sticker" shadows, solid-fill pill badges), reorders a couple of sections, merges the tone-evolution charts into a tabbed accuracy card with a real line chart, and adds a Free-vs-Pro pricing section that replaces the individual "🔒 Soon" fake doors.

## About the design files
The bundled file (`Progress Section.dc.html`) and the screenshots in `screenshots/` are **design references**, not production code — it's a standalone HTML/React-in-browser prototype. Your task is to **recreate this design inside the existing FlappyTone React/TypeScript app**, using its existing components, CSS token system, and file structure (see exact file/line references below) — not to copy the HTML/inline-style markup as-is.

## Fidelity
**High-fidelity.** Colors, spacing, type treatment, copy, and interaction behavior (tabs, tone picker) should be recreated pixel-close using the values below. Layout should reflow the same way the current screen does (single column on mobile, wider on desktop) — no new breakpoints are required beyond what's already in `App.css`.

## Screenshots
- `screenshots/01–04-*.png` — full page, in scroll order (top → pricing footer)
- `screenshots/05-*.png` — pricing section detail (Free / Pro cards)
- `screenshots/06-accuracy-progress-tab.png` — the new "Accuracy progress" tab with the line chart and tone picker

## What's changing vs. today's screen

1. **Visual language**: soft `1px` borders + tinted badges → thick `2px` solid ink borders + hard offset box-shadows (no blur) on every card, and solid-fill (not tinted) pill badges. Border radius goes from 14px/8px to ~20px/16px.
2. **Streak card**: no longer shows a "🔒 Soon"/Pro badge. It's a free feature; add a small warning line instead: *"⚠️ Saved only on this device — clearing your browser data resets it."*
3. **All lock badges & unlock CTAs drop the price** (just "🔒 Pro" / "Unlock with Pro"). Price appears **only** in the new pricing section.
4. **Section order**: Overview → **Accuracy (tabbed)** → **Run history** → Leaderboard → **Pricing**. (Today's order has the tone-evolution grid between accuracy and leaderboard, and no run-history reorder or pricing section.)
5. **Accuracy card becomes tabbed**: Tab 1 "Accuracy per tone" = today's bar chart (free). Tab 2 "Accuracy progress" = **replaces** the old 4-chart tone-evolution grid with a single line chart (gridlines, axis labels, area fill, dot markers — "Chart.js style") plus 4 toggle buttons (Tone 1–4) to switch which tone's series is plotted. This tab stays Pro-locked.
6. **New pricing section** at the bottom: two cards, Free (light) and Pro (dark, ink-filled, jade hard-shadow), each a bullet list, Pro has a big pill CTA ("Join EarlyBird") and the actual price.

## Screens / Components

### Overview: streak + level + stat strip
Source: `Progress.tsx` lines ~48–95 (JSX), styled via `.teaser-card`, `.teaser-card-soon`, `.stat-row`, `.stat-tile` in `App.css` (~lines 4606–4703).
- Two cards side by side (`flex-wrap`, `gap: 20px`, each `flex: 1 1 320px`), each: `padding: 28px 26px`, `border-radius: 20px`, `background: var(--surface-panel)`, `border: 2px solid var(--ink)`.
- Streak card: shadow `box-shadow: 6px 6px 0 rgba(36,29,21,0.12)`. Content: 🔥 emoji (1.8rem) → "3 days" (2.8rem, weight 900) → "streak" (0.85rem, `--ink-muted`) → warning line (0.78rem, `--warn-strong`, "⚠️ Saved only on this device — clearing your browser data resets it.").
- Level card: shadow `box-shadow: 6px 6px 0 rgba(200,138,60,0.35)` (beak-tinted, signals "Pro"). Header row: "LEVEL" label (uppercase, 0.8rem, bold) + a **solid-fill** badge — `background: var(--warn)`, `color: var(--surface)`, `border: 2px solid var(--ink)`, `border-radius: 999px`, text "🔒 Pro" (no price). Big number "Level 4" at 2.8rem/900. Progress bar: `height: 10px`, `border-radius: 999px`, `border: 2px solid var(--ink)`, fill `background: var(--warn)` at 45% width.
- Stat strip below: 4 tiles in a `flex-wrap` row (`flex: 1 1 160px` each), each `border-radius: 16px`, `border: 2px solid var(--ink)`, `background: var(--surface-panel)`, no shadow. Number at 2.2rem/weight 900 (drop `--font-display`, use `--font` bold), label uppercase 0.8rem `--ink-muted`.

### Accuracy (tabbed) card
Source: replaces `Progress.tsx` lines ~98–169. New local state needed: `activeTab: "accuracy" | "progress"`, `selectedTone: 1|2|3|4`.
- Outer card: same sticker treatment, `box-shadow: 6px 6px 0 rgba(36,29,21,0.12)`.
- Tab row: two pill buttons, `padding: 10px 22px`, `border-radius: 999px`, `border: 2px solid var(--ink)`. Active: `background: var(--ink)`, `color: var(--surface)`. Inactive: transparent background, ink text. When tab 2 is active, show the same solid Pro badge in the header row (right-aligned).
- **Tab 1 "Accuracy per tone"**: identical to today's `.breakdown` rows, but bar track gets `border: 2px solid var(--ink)` and `height: 12px`; bar-fill colors stay `Tone 1 #3b6fa0 / Tone 2 var(--accent) / Tone 3 var(--beak) / Tone 4 var(--danger)`.
- **Tab 2 "Accuracy progress"**: NEW. Above the chart, 4 small pill toggle buttons ("Tone 1"–"Tone 4"), same pill styling as the tabs but smaller (`padding: 8px 18px`, `font-size: 0.88rem`); active button fills with that tone's color. Below, a single line chart (SVG or a charting lib — Chart.js/Recharts are fine if already available, otherwise hand-rolled SVG is acceptable): X axis = time (mock dates, e.g. 8 points spanning ~3 weeks), Y axis = accuracy % with gridlines at 0/25/50/75/100 and labels on the left, a filled area under the line at ~12% opacity of the tone's color, a 3px line, and 5px dot markers (paper-fill, tone-color stroke) at each data point. This is mock/placeholder data for now — no real time-series accuracy data exists yet in `runHistory.ts`.
- CTA link under tab 2 content only: "🔒 Compare against your own attempts — unlock with Pro" (dashed top border separator, no price).

### Run history (moved up, right after Accuracy)
Source: `Progress.tsx` lines ~171–209 (unchanged data/logic), same sticker card treatment. "Last 5 runs" badge becomes solid-fill jade (`background: var(--accent)`, `color: var(--surface)`). Outcome badges (`out of hearts`) become solid-fill `var(--danger)` / `var(--surface)` text instead of the current tinted style. CTA text drops the price: "🔒 See all {n} runs & trends — unlock with Pro".

### Leaderboard
Source: `Progress.tsx` lines ~140–169 (today's leaderboard block — note: order changes, this now comes after Run history). Same sticker card, beak-tinted shadow like the Level card (signals "Pro"). Badge same solid "🔒 Pro" treatment, no price. CTA: "🔒 Compete weekly — unlock with Pro".

### Pricing section (NEW)
No current equivalent — new section at the bottom of the screen, anchor id `pricing` (the various "unlock with Pro" links point here).
- Centered heading "Free today, more with Pro" + one-line subhead about EarlyBird.
- Two cards side by side (`flex-wrap`, `gap: 24px`, `flex: 1 1 340px` each):
  - **Free card**: light (`--surface-panel`), same sticker border/shadow, heading "Free" + subtext, then a checklist (✓ in jade, `padding-left: 26px` per item) of: 5 runs a day · Access to all current words · Tone accuracy for your last 5 runs · Last 5 runs of history · Game modes: shuffle, tone drill, learn · Sharing your results · HSK/TOCFL word lists *(coming soon, dimmed)*.
  - **Pro card**: dark (`background: var(--ink)`, `color: var(--surface)`), `box-shadow: 8px 8px 0 var(--accent)` (no blur, jade offset). Header row: "Pro" + price (`$19` bold, "one-time, EarlyBird" small muted beside it). Checklist (✓ in beak color) of: Unlimited runs · Accuracy per tone across every run, plus its evolution over time · Your average tone shape, and how it evolves over time · Weekly leaderboards · Full run history & trends · Custom word lists · Vocab mode. Below: a big pill CTA button, full width, `background: var(--accent)`, `color: var(--surface)`, `border: 2px solid var(--surface)`, `box-shadow: 4px 4px 0 rgba(0,0,0,0.3)`, label "Join EarlyBird". Footnote below in muted small text: "Later, Pro moves to credits — enough to fly for a week or a month. EarlyBirds keep full access."

## Interactions & behavior
- Tab switch (Accuracy per tone ↔ Accuracy progress): simple local state toggle, no animation required (a quick fade/slide is a nice-to-have, not required).
- Tone picker in tab 2: local state toggle; switching redraws the line/area/dots and updates the active button's fill to that tone's color.
- All "🔒 …" CTA links scroll/link to the pricing section (`#pricing`).
- No new loading/error states — this screen already renders from local data synchronously.

## Design tokens (all already exist in `src/ui/tokens.css` — no new colors needed)
- Surfaces: `--surface #f7f1e3`, `--surface-panel #efe6d1`
- Ink: `--ink #241d15`, `--ink-muted #6b6151`, `--ink-dim #a89a80`
- Accent (jade): `--accent #1c7a63`
- Beak (orange): `--beak #c98a3c`
- Semantic: `--warn #a8672a` / `--warn-strong #8a5320`, `--danger #a3341f`
- Tone colors (not currently tokenized — same values used in `dev/WordGates.tsx` `TONE_COLOR`, just darker/saturated for strokes): Tone 1 `#3b6fa0`, Tone 2 `var(--accent)`, Tone 3 `var(--beak)`, Tone 4 `var(--danger)`.
- Fonts: `--font` (Hanken Grotesk) for everything in this redesign — numbers/headings move from `--font-display` (Fraunces) to bold/black weights (700–900) of `--font`. Fraunces is only kept for the page's own `<h2>Your progress</h2>` title, unchanged from today.
- **New radius scale for this screen only** (or bump the shared tokens if you want this everywhere): cards 20px, small pills/inputs 16px, badges/buttons stay `--radius-pill` (999px).
- **New shadow pattern** (not tokenized today, hard/no-blur offset shadows): default card `6px 6px 0 rgba(36,29,21,0.12)`; "Pro-flavored" cards (Level, Leaderboard) `6px 6px 0 rgba(200,138,60,0.35)`; Pro pricing card `8px 8px 0 var(--accent)`; CTA button `4px 4px 0 rgba(0,0,0,0.3)`.

## Assets
No new image/icon assets — all iconography is emoji (🔥🔒🥇🥈✓⚠️), consistent with the current screen's existing emoji use.

## Files
- Design reference: `Progress Section.dc.html` (open directly in a browser — it's a self-contained React-in-HTML prototype; the "Plan state" tweak panel toggles the locked/unlocked Pro view for reference).
- Screenshots: `screenshots/`
- Codebase files to change (read but not modified in this handoff):
  - `src/ui/Progress.tsx` — main structure/logic changes, new tab + tone-picker state
  - `src/App.css` — `.progress-card`/`.progress-card-soon` (~4704), `.teaser-card`/`.teaser-card-soon` (~4633), `.stat-tile`/`.stat-row` (~4606), `.badge*` (~4566), `.leaderboard-row`, `.run-history-row`, `.progress-card-cta` (~4740+) — border/shadow/badge treatment
  - `src/ui/tokens.css` — radius scale (and optionally add shadow tokens)
  - New: a small chart-drawing helper (sibling to `src/ui/toneAverageChart.ts`) for the tab-2 line chart, since the existing canvas charts don't have axes/gridlines/a tone picker
