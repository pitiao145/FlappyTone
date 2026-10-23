# Report: 20 TONEder in the app + SEO funnel CTA
- Result: done, with one part held back for Pierre (the bigger word pool for free/Pro; see "Word pool" below). Nothing pushed or deployed. No DB, RLS, Worker or payment change. No new dependency.

## Commits (in the brief's order)
- `5dfa62a` A: refactor. `src/toneder/Toneder.tsx` is the shared UI (cards, swipe, reveal, round summary). `toneTest.ts`, `profiles.ts` and their tests moved from `src/site/toneTest/` to `src/toneder/`. Props: `words`, `swipesLeft`, `onSwipe`, `onRoundDone`, `capScreen`, `spokenLocked`/`onSpokenLocked`, `doneCta` (the CTA slot), `reporter`, `sharePath`. The page passes its reporter and the same visualizer link as before. No change to how it works.
- `b721c93` B: the in-app TONEder tab (`src/app/TonederScreen.tsx`, nav item "TONEder" after Play, screen `toneder`).
- `e4bea74` C+D: the page CTA and the funnel events.

## B. In-app mode
- Daily cap: `tonederSwipesPerDay` in `src/game/tiers.ts`: guest 30, free 50, Pro `Infinity`. Counted per local day on the device (`flappytone.toneder.swipes.v1`, `src/toneder/dailySwipes.ts`, never throws). A guest who clears storage gets a fresh count. The brief accepts this.
- The intro card shows "N swipes left today" when there is a cap. When the cap is hit, at Start or at Next, a cap card shows instead of the next card. Guest: "Create a free account" opens the existing signup screen. Free: "Go Pro" opens the EarlyBird modal with a new `toneder` surface (new copy in `EarlyBirdModal.tsx`).
- Spoken is Pro only. For guest and free the Spoken pill is dimmed. A tap on it opens the EarlyBird modal.
- Standalone: no stats, XP, streaks or DB writes.

### Word pool: no migration needed, but there is a different blocker
`poolForTier()` (`src/toneder/pool.ts`) gives the 76 guest-playable single-syllable words to every tier, as the brief says.
I checked the brief's premise: it does not hold as written. The Worker (`workers/clips/src/routes/clip.ts`) already serves more single-syllable published words to signed-in tickets. Counted against the bundled catalog: **guest 76, free 190, Pro 214**. Every published word is `min_tier='free'`, and the level gate lets free reach TOCFL 1–2 and Pro reach TOCFL 1–3. So **no membership or RLS migration is needed**. I am not proposing one.
The real blocker is on the client. TONEder plays clips through `src/site/wordAudio.ts`, which always gets a **guest** ticket (`POST /token` with no auth). To open the bigger pool:
1. In the app, get the ticket the game already uses (the one tied to the account's tier), not a guest ticket. For example, `wordAudio` could take a ticket provider.
2. In `poolForTier`, give free/Pro the words their tier can play.
3. Check which of those words also have a natural (Spoken) take. The fallback catalog does not record this. Today the 76 are known to have both styles.
This is a client-only change, with no schema change. I did not build it because the brief says to ask first. **Pierre's call.**

## C. SEO funnel CTA
- The end screen replaces the visualizer link with: "Your weak spot: **Tone 2** vs **Tone 3** → train it in the game (211 words)". The weak pair is the pair with the most misses, in either direction (`weakPair`, `src/toneder/cta.ts`). A perfect round shows "Perfect ear. Now say them: train in the game (211 words) →".
- Link: `/app?src=/tools/tone-test&weak=2-3`.
- **Deep link does not filter.** The game cannot start filtered to a tone or a pair from a URL (`?intent=` supports only visualiser, leaderboard, pairs and pricing, and `pairs` opens the Modes screen with no filter). As the brief says, the link opens the plain game. `weak` is used only for attribution, then removed from the URL.
- A light link under the tool, on the page at all times: "Hearing is half of it. Play the game: say the tones with your voice →". The bottom PipCta is unchanged. The page's word set stays at 40.
- "211 words" is a constant in the page copy, as the brief asked. Note that a guest in the game gets fewer words. See "Needs Pierre's eyes".

## D. Events (all global tier, counts only, added to `AnalyticsEvent`, `eventTier` and `APP_EVENTS`)
- `tool_cta_click {tool:"tone-test", weak_pair:"2-3"|"none", placement:"round_done"|"persistent"}`
- `app_open {source:"tone-test", weak_pair}`: once on arrival in `/app` when `?src=/tools/tone-test`
- `toneder_swipe {tier, style, count}`: **batched**. One event per style per round, and also when the player leaves the tab or the cap is hit.
- `toneder_round_done {tier, correct}`, `toneder_cap_hit {tier}` (once per mount), `toneder_upgrade_click {tier, from:"cap"|"spoken"}`. I added `from:"spoken"` to the brief's `from:"cap"` for the locked Spoken pill.

## Checks
- typecheck ✓ · `npm test`: 113 files / 1495 tests ✓, including the moved toneTest/profiles tests.
- New tests: `dailySwipes.test.ts` (30/50/unlimited, the daily reset, blocked storage), `pool.test.ts` (76 per tier, Traditional, includes the page's 40), `cta.test.ts` (weak pair, tie, perfect round, URL, parse).
- build ✓ · rule-7 grep: empty · `check:mic-chunks` ✓ (17 site pages, none loads mic code) · eslint: 0 errors. The page keeps its 2 old warnings. `dist/tools/tone-test/index.html` is prerendered with the new link.
- **Screenshots: not taken.** Pierre checks UI himself (standing instruction), so I took no before/after, phone or desktop screenshots. Below is the list to check.

## Needs Pierre's eyes
1. /tools/tone-test after step A: the page should look the same. After C, the end screen shows the weak-pair CTA in place of the visualizer link, and a new line under the tool.
2. /app → TONEder tab, on phone and desktop: fit inside the app column (`.toneder-screen`, max 760 px), the corners, the nav icon (two stacked cards), and the bottom-bar label width on small phones (6 items now).
3. Cap screen: set a guest to 30 swipes (or edit `flappytone.toneder.swipes.v1` to `{"day":"<today>","n":30}`). Check the copy and both buttons.
4. "211 words" in the CTA: a guest arriving in the game gets fewer words. Keep the number, or change it to something like "every word"?
5. The word-pool decision above (the guest ticket vs the tier ticket).

## Follow-ups
- Tier ticket for TONEder clips, then the bigger pool for free/Pro (see above).
- A game entry filtered by tone pair (for example `?intent=pairs&combo=2-3`), so the CTA can drop the player straight into their weak pair.
- In-app profiles: only the page's 40 words have dating-profile props and bios. The other 36 show the reveal without "About me".
