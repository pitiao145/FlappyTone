# Game Over screen — design handoff

Redesign of the run-over screen + leaderboard, mobile and desktop. Goal: kill the crowding, keep every insight, make it a conversion moment (play again / share / signal progress). Screens referenced by badge (`6a` mobile spec, `6b` desktop spec, `1d`/leaderboard sheet, `4b` confirm modal) are in `Game Over Redesign.dc.html` and the attached screenshots.

## Scope

- Rewrite **`src/ui/GameOver.tsx`** layout (logic/props unchanged — see "Data" below).
- Restyle **`src/ui/JoinBoardModal.tsx`** → the confirm sheet (`4b`).
- Restyle **`src/ui/Leaderboard.tsx`** → the unified sheet (`1d`).
- No new colors, radii, shadows, or fonts — everything resolves from **`src/ui/tokens.css`**. The token file already carries the "indie-hacker sticker" card language (`--shadow-sticker*`); this design leans on it. Do not hardcode hex.

## Design language (all from tokens.css)

- **Cards = sticker cards:** `2px solid` border in the card's own ink, hard offset shadow, no blur. Default ink card → border `--ink`, shadow `--shadow-sticker`. Coach card → border `--accent`, jade shadow (`--shadow-sticker-jade`, scale to `4px 4px 0` on mobile). Leaderboard/CTA (Pro-flavoured) → border `--beak`, shadow `--shadow-sticker-pro`.
- Surfaces: page `--surface`, inset tiles `--surface-panel`/`--surface-deep`, cards `#fff` (paper-white on paper — acceptable, matches Progress).
- Type: numerals & titles `--font-display` (Fraunces 600), everything else `--font` (Hanken). Score uses `tabular-nums`.
- Radii `--radius-md` (cards), `--radius-pill` (buttons). Spacing from `--space-*`.
- Primary/jade buttons `--accent` bg / `--accent-ink` text, border `--accent-bright`. Gold/share buttons `--beak` gradient, border/shadow `--warn-strong`/`--beak`. Danger accents (weak-tone) `--danger`.
- **Tone marks:** reuse the existing **`ToneMarkIcon`** (`src/ui/toneIcons.tsx`) — do NOT use the placeholder line-glyphs in the mock. **Share icon:** existing **`ShareIcon`** (`src/ui/icons.tsx`).

## Module inventory (order + render rule)

Mobile is one vertical stack (`6a`); desktop is a header band + 3 columns (`6b`). Same modules, same rules, different arrangement. Tags: **ALWAYS** = every run; **COND** = only when its rule is true.

| # | Module | Rule | Existing source of truth |
|---|--------|------|--------------------------|
| 1 | Score + best + multiplier | ALWAYS | `stats.score`, `history.bestScore` (`loadRunHistory`), `isNewBest = stats.score >= history.bestScore`. On new best, swap eyebrow to "New personal best" (see `1b`). |
| 2 | Share & challenge | ALWAYS | `shareRunResult` / `downloadShareCard` (`src/share/share.ts`), `renderShareCard`. |
| 3 | Coach callout (weak tone + Practise) | COND — a weak tone exists | `toneBreakdown(stats)` + `takeaway(stats)` (`src/game/scoring.ts`). Practise → `onVisualiser()`. |
| 4 | Tone-accuracy grid (4 tiles) | ALWAYS | `toneBreakdown(stats)` per-tone %. Weak tone tile outlined in `--danger`. Uses `ToneMarkIcon`. |
| 5 | Leaderboard slot (CTA ↔ rank/preview) | ALWAYS when `boardEligible` (`mode==="game" && stats.score>0`) | see "Leaderboard flow". |
| 6 | Recalibration | COND — `suggestion !== null` | `suggestion: RangeHalves`, `suggestionIsFirst`; apply → `onRecalibrate(settings)` via `saveSettings`. Friendlier copy when `suggestionIsFirst`. |
| 7 | Feedback ("How's it feeling?") | COND — `feedbackEligible` (`loadDailyRuns().count>=3 && !hasShownFeedbackToday()`) | on pick → `track` `run_feedback` w/ `sentiment` + `mode`, then `markFeedbackShown()`. |
| 8 | Primary actions — Home / Play again | ALWAYS | `onHome()`, `onRetry()` (respect `busy`). Mobile: sticky footer above nav. |

Recal (6) and feedback (7) can show together — they do not suppress each other (unchanged). On mobile they sit below the leaderboard slot; on desktop they stack under the leaderboard in column 3.

## Leaderboard flow (module 5 + modals)

Preserve the current logic in `GameOver.tsx`; only the surfacing changes.

- **Already joined** (`hasJoined()` → true): score is submitted silently every run (`submitScore(stats.score)`, keeps best). Slot shows the **rank row** (mobile, `5b`) / **mini preview + "View leaderboard"** (desktop, `5d`) → opens the sheet `1d`. No modal.
- **Not joined, on a personal best** (`isNewBest` — today's `joinOffer` trigger): slot shows the gold **"Post your score" CTA card** (`5a`/`5c`). Tapping opens the **confirm sheet `4b`** (restyled `JoinBoardModal`), which shows the minted `boardName` (`displayName()`) and projected rank, then `joinBoard()` + `submitScore()`.
- **Not joined, not a best:** slot collapses (or shows a passive "View leaderboard" link to `1d`). Do not nag.
- `boardError` stays dev-only, unchanged.

**Leaderboard sheet `1d`** (restyle `Leaderboard.tsx`): bottom sheet on mobile, centered modal on desktop. Top 3 with medals, `· · ·`, then the player's own row pinned and highlighted in `--accent`. Header "Weekly leaderboard · resets Monday". Data via `getBoard()` / `myUserId()` (`src/data/leaderboard.ts`) — unchanged.

## Layout specifics

**Mobile (`6a`)** — 390px-class frame. Bird (`Bird-up-no-halo.png`) breaks out above the score card's top-left, rotated ~-6°. Content scrolls; actions + bottom nav pinned. Keep hit targets ≥44px.

**Desktop (`6b`)** — center a max ~1200px panel over the paused canvas. Header band: bird + big score left, `Home` / `Share` / `Play again` right (Play again is the visual primary). Below: `grid-template-columns: 1fr 1.15fr 1fr` — col 1 coach, col 2 tone grid, col 3 stacks leaderboard → recal → feedback. Reflow to a single column under ~900px.

## Data / props — unchanged

Keep the `GameOver` `Props` contract and all reads exactly as today: `stats` (`RunStats`), `busy`, `onRetry`, `onHome`, `onFineTune`, `onVisualiser`, `settings`, `suggestion`, `suggestionIsFirst`, `onRecalibrate`, `mode`, `challengeScore`. `onFineTune` is the "some tones felt out of reach?" shortcut — hang it off the recal card or the coach card, not a standalone row. If `challengeScore != null`, show a compact "chasing N" line near the score (challenge state); it was requested but is lowest priority.

## Out of scope / open

- Placeholder tone glyphs in the mock → replace with `ToneMarkIcon`.
- Emoji in feedback chips are illustrative; swap for brand icons if preferred.
- Copy may be tightened but keep it factual; no invented stats.
