# Report: 25 SEO page CTAs: game demo overlay vs signup

- Result: done (code and automated checks). Lighthouse, screenshots and the manual checks are for Pierre (see below).

## What changed
- `src/ui/landing/TryItNow.tsx`: the one demo, with new optional props `surface` ("landing" | "overlay"), `page`, `seedId`, `onClose`. The LP calls `<TryItNow />` as before, so its default path is the same. Overlay mode opens straight on the voice choice, has no arrow or caption, flies the seed word first (first round only), sends the end screen's "Sign up free" to `/app?src=<page>`, and closes the overlay on "Exit demo". Closing mid-run stops the run and the mic (existing unmount path) and tracks `exited`.
- `src/ui/landing/tryItNow.css` (new): the Try it now rules, moved out of `sky.css` unchanged, so the overlay can load them. `sky.css` keeps everything else.
- `src/ui/landing/demoSeed.ts` (new): `playableSeed` (1 or 2 syllables and in wordsFallback.json, else null) and `seededRound`.
- `src/site/DemoCta.tsx` (new, in the page chunk): `DemoTrigger` (overlay CTA: a `/#demo` link in the prerendered HTML, a real `<button aria-haspopup="dialog">` once the page runs) and `trackSignupCta`.
- `src/site/DemoOverlay.tsx` + `demoOverlay.css` (new, loaded on the tap): a native modal `<dialog>`. Full screen at ≤560px, a centred 640px modal above that. Close button, Esc and backdrop click close it. Focus is trapped by the modal dialog. `src/site/modal.ts` locks page scroll and returns focus to the trigger.
- `src/site/Pip.tsx`: `PipCta` has `to="demo"` (default, a button that opens the overlay, optional `seedId`) or `to="signup"` (link). Labels sit in one place, `PIP_CTA_LABEL`: overlay "Try it now, free", signup "Play FlappyTone free".
- `src/site/WordViewer.tsx`: "Try it" opens the overlay, seeded with that word (the viewer stays open under it).
- Pages: `SayWord.tsx` (PipCta seeded with `cards[0].id`), `ToneTest.tsx` (play link → overlay; round result stays signup with `?weak=`), `ToneVisualizer.tsx` (all four CTAs → signup, plus the feature line), `pages.tsx` + `src/ui/Nav.tsx` (new optional `onPlayLinkClick`, for nav tracking only).
- `src/site/site.css`: `sticker-button`, `.word-viewer-try` and the tone-test link also style the `<button>` form; `.tc-app-features`.
- Row 9 signup copy: `src/app/authGate.ts` `weakPairLine()`, and `AuthScreen` shows it as the signup subtitle. It is a subtitle only (one optional prop); no other auth-screen change.
- `src/analytics/session.ts`, `posthog.ts`: tracking (below). `docs/ARCHITECTURE.md`: "Three entries" rule 1 and "Play analytics" rule 1.
- Tests: `src/ui/landing/demoSeed.test.ts`, `src/site/modal.test.ts`, `src/site/ctaRouting.test.tsx`.

## Routing as built
| # | CTA | Goes to |
|---|---|---|
| 1 | Nav Play (site pages) | /app?src=… (tracked `nav_play`) |
| 2 | 404 Nav Play | /app (unchanged; the 404 has no JS, so no tracking) |
| 3, 5 | Word viewer "Try it" | overlay, seeded with the word |
| 4, 7, 8, 11 | Bottom PipCta | overlay |
| 6 | /say/* PipCta | overlay, seeded with the page's main word |
| 9 | Tone-test round result | /app?src=/tools/tone-test&weak=2-3 + signup subtitle |
| 10 | Tone-test "Play the game…" link | overlay |
| 12–15 | Visualizer CTAs | /app (signup); feature line under 12 and 14 |

## Seed words
- Seed: 謝謝 xiexie40, 你好 nihao33, 再見 zaijian44, 請 qing3, 元 yuan2, and all 22 /chinese-tones example words (single syllables and two-syllable examples).
- Fall back to the standard pool: 對不起 duibuqi403, 不客氣 bukeqi444, 沒關係 meiguanxi210 (3 syllables).
- The test checks every id in sayWords.ts and exampleClips.ts: it is in wordsFallback.json, it passes the Worker's guest rules (min_tier `free`, plus in a sampler list or in no `tocfl*` list; the rule is copied into the test because the Worker is a separate toolchain), and `playableSeed` returns it only if it has 1 or 2 syllables.

## Feature line (visualizer)
"The full visualizer adds real words for each tone, two-syllable tone pairs and TOCFL word lists, each with our native speaker's recording. Free with an account."
- Real words for each tone: `tiers.ts` free `wordsPerTone: 5`, `visualiserPerTone: true`; word rail in `Visualiser.tsx` (`visualiserListWords`).
- Tone pairs: `Visualiser.tsx` "Tone pairs" tab (`visualiserPairWords`, two-syllable words).
- TOCFL lists: `Visualiser.tsx` `selectedLevels`; free `beginner.levels: [1, 2]`.
- Recording: `Visualiser.tsx` plays each word's clip (`loadClip`, `playToneCue`).
The text is one constant, `APP_FEATURES` in `ToneVisualizer.tsx`.

## Tracking
- `tool_summary` and `tool_cta_click` (try-now) add `surface` ("landing" | "overlay"), `page` (route path or null) and `seeded` (the overlay's seed word id, or null; it stays set for later rounds of the same overlay).
- New `seo_cta_click {page, cta, target}`, global tier, sent instantly. `cta`: `nav_play`, `viewer_try`, `pip_cta`, `tone_test_result`, `tone_test_play_link`, `visualizer_above_stage`, `visualizer_result_good`, `visualizer_result_retry`.
- The tone test's existing `tool_cta_click` events still fire (the play link sends `persistent` from the overlay button).
- The overlay sends `tool_used` try-now events like the LP, but not `landing_cta_clicked`.

## Bundle sizes (initial assets of /say/hello; /chinese-tones and /tools/tone-test load the same set)
- Before: 591,982 B raw / 172,119 B gzip.
- After: 594,295 B raw / 172,967 B gzip (+2.3 kB raw, +0.85 kB gzip). Rollup split the shared chunks differently (posthog is now inside a `settings` chunk), so compare the totals, not chunk by chunk.
- Loaded on the tap only: `DemoOverlay` 1.0 kB + 0.6 kB CSS, `TryItNow` 12.2 kB + 3.1 kB CSS, then `miniGame` and the game modules, as on the LP.
- No `startMiniGame`, `getUserMedia`, `AudioWorklet`, wordsFallback or demo CSS in the page's initial JS. The `PitchTracker` string was already in the site chunk before this brief (a lazy-import reference).
- LP initial: 205,420 → 207,960 B gzip. Most of this is chunk reshuffling; the moved demo CSS is now its own `TryItNow-*.css` file, and the LP still loads it up front.

## Lighthouse
Not run. The Lighthouse CLI is not installed (installing it would add a dependency), the DevTools MCP audit leaves out performance, and `vite preview` serves self-signed HTTPS, which the DevTools browser refuses. Please run Lighthouse on /say/hello and /chinese-tones (production or preview deploy) and compare them with the current live scores. The initial load changed by +0.85 kB gzip and no new request happens before a tap, so I expect no change.

## Checks
- `npm run typecheck`: pass.
- `npm run test`: 118 files, 1568 tests pass (51 new).
- `npm run lint`: 4 errors, all in `video/` (known). The files I touched have no new errors and no new warning types.
- `npm run build`: pass. Hard rule 7 grep prints nothing.
- The overlay writes nothing (no score submit, stats or run count). It is the LP demo's code path.

## Needs Pierre's eyes
- Screenshots: not taken (your standing rule: you check UI). Please capture the overlay at desktop and 375px.
- The manual list from the brief: each overlay CTA, /say/thank-you starts with 謝謝 (the brief says /say/xiexie, but the route is /say/thank-you), /say/sorry uses the normal pool, the end-screen signup lands on the auth screen with `?src=`, closing mid-run stops the mic (check on a real iPhone), the LP demo is unchanged, and the tone-test result and visualizer CTAs go to signup.
- Copy choice: overlay PipCtas say "Try it now, free" (signup ones keep "Play FlappyTone free"). Change `PIP_CTA_LABEL` if you prefer the old label.
- CLAUDE.md hard rule 13 says "two exceptions: the visualizer engine and the landing's Try it now". The Try it now demo now also loads on site pages (still lazy, on a tap). I updated ARCHITECTURE.md, but I did not change the hard-rule text in CLAUDE.md. That wording is your decision.

## Follow-ups
- PostHog: add `surface` as a breakdown on the Try it now insights, and add an `seo_cta_click` funnel (overlay open → `tool_summary` → signup).
