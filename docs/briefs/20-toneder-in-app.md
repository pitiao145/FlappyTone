---
status: done
notion_task: https://app.notion.com/p/40135e5140dd8199b0e4c53bcf41b891
risk: needs-approval
---
# 20 TONEder in the app + SEO funnel CTA

## Goal
1. One shared TONEder component used by both the SEO page and the app, so UI tweaks happen in one place.
2. An in-app TONEder mode with a bigger word pool and a daily swipe cap per tier, to give an upgrade incentive.
3. The SEO page becomes a funnel: a personalised CTA after each round that sends players to the **game** (not the visualiser).

## Context / files to read first
- CLAUDE.md; docs/DECISIONS.md sections on tiers, guest rules, the tone test
- docs/briefs/15-tone-listening-test.md + reports/15-tone-listening-test.md
- src/site/pages/ToneTest.tsx, src/site/toneTest/{toneTest,profiles}.ts (+ tests)
- src/game/tiers.ts, src/ui/plan.ts (TIER_LIMITS), src/app/GameApp.tsx, src/app/GameNav.tsx

## Scope
**A. Shared component.** Extract the TONEder UI (cards, swipe, reveal, round summary) out of ToneTest.tsx into one component (e.g. src/toneder/). Inputs: the word pool, a swipe budget, and an `onRoundDone` / `onCta` hook. The SEO page and the app both use it, and there is no duplicated UI. The SEO page must look and behave the same after the refactor.

**B. In-app mode.** A separate TONEder entry in the app nav. It is standalone: no stats, XP, streaks or DB writes.
- Daily swipe cap: guest 30, free 50, Pro unlimited. Put it in TIER_LIMITS (one place) and count it in localStorage per day. A guest with cleared storage can get around this, which is acceptable for now.
- Word pool: guest uses the 76 guest-playable single-syllable words; free and Pro use all 211 published words. Opening the 211 to free/Pro needs a membership/RLS change. **Ask first**: propose the migration and stop before applying it. Until then, ship with the 76 for every tier.
- When the cap is hit, show a screen with the cap and an upgrade CTA (guest: create an account; free: Pro). Pro gets the Spoken style.

**C. SEO funnel CTA.** After each round: "Your weak spot: Tone X vs Tone Y → train it in the game (211 words)". The CTA opens the game. If the game can start filtered to that tone or pair, deep-link to it; if not, open the plain game and say so in the report (do not build a game filter in this brief). Also add a lighter persistent "Play the game" CTA on the page. The SEO word set stays at 40.

**D. Tracking (PostHog, counts only).**
- SEO page: `tool_cta_click {tool:"tone-test", weak_pair, placement}`.
- App: `toneder_swipe {tier, style}` (sampled or batched if noisy), `toneder_round_done {tier, correct}`, `toneder_cap_hit {tier}`, `toneder_upgrade_click {tier, from:"cap"}`, `app_open {source:"tone-test", weak_pair}` from the deep link (UTM or query param).

## Constraints
- Ask first: push, deploy, payments, DB schema/RLS, new dependency.
- Do not touch game scoring, the classifier, stats, or golden fixtures.
- Do not "fix" items listed under Known limitations.
- Commit in order: A refactor (no behaviour change), B, C+D.

## Acceptance checks
- npm test passes, including the existing toneTest/profiles tests.
- New tests: the cap per tier (30/50/unlimited, resets daily), the pool per tier, and that the CTA builds the right weak pair and URL.
- The SEO page /tone-test looks and behaves the same after step A (before/after screenshots).
- Phone and desktop screenshots of the in-app mode, the cap screen and the SEO CTA.

## Report back with
What changed (files, commits per step), the proposed migration (not applied), whether the game deep link filters, the event names added, screenshots, what needs Pierre's eyes, and follow-ups. Write it to docs/briefs/reports/20-toneder-in-app.md.
