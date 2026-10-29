---
status: done
notion_task: https://app.notion.com/p/40635e5140dd81de9070ccabdf8f75d5
risk: low
---
# 25 SEO page CTAs: game demo overlay vs signup

## Goal
/app is now behind login (brief 24), so every "Try it" / "Play FlappyTone free" on the learn and tool pages sends cold visitors straight to signup. Route each CTA by one rule:
- **Visitor hasn't played or spoken yet → open the game demo in an overlay on the same page.**
- **Visitor already used a tool (got a personal result), or chose "Play" in the nav → /app (signup).**

The overlay is the existing Try it now demo, not a new game: same 5 gates, same end screen with the gold signup card naming the weakest tone.

## Context / files to read first
- CLAUDE.md; docs/DECISIONS.md entries on the Try it now demo, the guest clip ticket and SEO pages; docs/briefs/reports/23-*.md and 24-*.md
- src/ui/landing/TryItNow.tsx, DemoGameOver.tsx, miniGame.ts, sky.css (the demo, its end screen, `wordSequence`)
- src/site/: pages.tsx (Nav), Pip.tsx (`PipCta`), WordViewer.tsx + WordButtons.tsx (word "Try it"), pages/ChineseTones.tsx, SayWord.tsx, ToneMarks.tsx, ToneTest.tsx, ToneVisualizer.tsx, sayWords.ts, exampleClips.ts, NotFound.tsx
- src/toneder/cta.ts (`gameHref`, weak pair)
- src/ui/appLink.ts (`appHref`, `?src=` attribution)
- workers/clips/src/routes/clip.ts (guest ticket rules: min_tier + sampler/level gate)
- src/data/wordsFallback.json (words the demo can build without a fetch)

## 1. Extract the demo into a reusable overlay
- Pull the demo's game + end screen out of TryItNow into a component that can render **inline** (the LP hero, unchanged) or as an **overlay** (new). One source of truth; the LP demo must look and behave exactly as today.
- Overlay: full-screen on phones, centred large modal on desktop, close button + Esc + backdrop close, focus trapped and returned to the trigger, body scroll locked. Closing stops the mic and the run (existing stop path).
- **Load on click only.** The overlay and game code must not be in the SEO pages' initial bundle (lazy import on the CTA click, like the LP demo's mic chunk). Check the build output and state the SEO page chunk sizes before/after in the report.
- Keep the voice-choice step before the mic opens. The end screen's "Sign up free" goes to /app (signup) carrying `?src=<page path>`.

## 2. Seed the run with the page's word (only when playable)
- New optional input: a starting word id. The run flies that word first, then easy words from the usual demo pool (`wordSequence`, no repeats).
- Seed only if the word is **playable in the game** (1 or 2 syllables; neutral is fine inside a 2-syllable gate) **and present in wordsFallback.json**. Otherwise use the standard pool. Today that means 對不起 (duibuqi403), 不客氣 (bukeqi444) and 沒關係 (meiguanxi210) get **no seed** (3 syllables, not playable in any mode yet).
- **Test (required):** for every word id used on /say/* and /chinese-tones (sayWords.ts, exampleClips.ts), assert: it's in wordsFallback.json; it would pass the clips Worker's guest rules (min_tier `free`, and either in a sampler list or in no `tocfl*` list); and the seed helper returns it if playable / skips it if not. A new SEO word that breaks this must fail the test.

## 3. Route every CTA (table approved by Pierre, 29 Oct)
| # | Page | CTA | Goes to |
|---|---|---|---|
| 1 | All site pages | Nav "Play" | /app (signup), unchanged |
| 2 | 404 | Nav "Play" | /app (signup), unchanged |
| 3 | /chinese-tones | Word viewer "Try it" | **Overlay**, seeded with that word |
| 4 | /chinese-tones | Bottom PipCta "Play FlappyTone free" | **Overlay** |
| 5 | /say/* | Word viewer "Try it" | **Overlay**, seeded with that word |
| 6 | /say/* | Bottom PipCta "Fly the word with your voice" | **Overlay**, seeded with the page's main word |
| 7 | /say hub | Bottom PipCta "Practise the words out loud" | **Overlay** |
| 8 | /tools/tone-marks | Bottom PipCta "Now say them out loud" | **Overlay** |
| 9 | /tools/tone-test | Round result "Your weak spot … → train it in the game" | /app (signup), keep `?weak=` |
| 10 | /tools/tone-test | Link "Play the game: say the tones with your voice" | **Overlay** |
| 11 | /tools/tone-test | Bottom PipCta "Now say them: fly with your voice" | **Overlay** |
| 12 | /tools/tone-visualizer | "Practise in the full visualizer" (above stage) | /app (signup) + feature line (below) |
| 13 | /tools/tone-visualizer | Good result "Now fly it…" | /app (signup) |
| 14 | /tools/tone-visualizer | Ok/bad result "Practise in the full visualizer" | /app (signup) + feature line |
| 15 | /tools/tone-visualizer | Bottom PipCta "Practise, then play" | /app (signup) |

- `PipCta` gets a way to open the overlay instead of a link (e.g. `action="demo"`); keep it a real button for overlay CTAs and a real link for signup CTAs. Keep the "Play FlappyTone free" label for overlay CTAs, or improve it if a clearer label fits ("Try it now, free"); keep copy in one place.
- Without JS, overlay CTAs should still go somewhere useful: `/#demo`.
- **Signup screen copy for row 9:** if brief 24's auth screen can show a source-specific subtitle, show the weak pair ("Your weak spot is 2nd vs 3rd. Sign up free to train it."). If that needs auth-screen changes beyond a subtitle, skip it and say so.

## 4. Visualizer tool: say what the full visualizer adds
Near rows 12 and 14, one short line naming what the in-app visualizer has that the free tool doesn't. **Verify each feature in src/ui/Visualiser.tsx and tiers before naming it**; only list what exists (candidates: scoring/accuracy, more words per tone, tone pairs, word lists). Copy in the page's copy source, not hardcoded twice.

## Tracking
- Overlay: `tool_summary` / `tool_cta_click` keep working; add `surface: "overlay"|"landing"`, `page` (path) and `seeded` (word id or null).
- New `seo_cta_click` {page, cta (row id/name), target: "overlay"|"signup"} for every routed CTA. Keep existing tone-test `ctaClick` events.

## Constraints
- Ask first: push, deploy, new dependency, any change to the clips Worker or Supabase.
- The LP demo must not change in look or behaviour. The game in /app must not change.
- The overlay never writes anything (no score submit, no stats, no daily-run count), same as the LP demo.
- SEO page performance: no game code in initial page load; Lighthouse performance on /say/nihao and /chinese-tones not worse than before (note scores in the report).
- Don't "fix" items under Known limitations.

## Acceptance checks
- `npm run build`, `npm run typecheck`, tests pass (lint: known video/ errors aside). New tests: seed-word test above; overlay opens/closes and restores focus; CTA routing per the table (overlay vs link).
- Manual (Pierre), desktop + 375px: each overlay CTA opens the demo; /say/xiexie starts with 謝謝; /say/duibuqi uses the normal pool; end screen signup lands on the auth screen with `?src=`; close mid-run stops the mic; LP demo unchanged; tone-test result and visualizer CTAs go to signup.

## Report back with
Files changed · bundle sizes for SEO pages before/after · Lighthouse scores before/after · which words seed and which fall back · feature line text and where each feature was verified · tracking added · screenshots (overlay desktop + mobile)
