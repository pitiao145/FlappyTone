# FlappyTone — Share feature (v1) — implementation spec

Status: ready to build. No backend. Author: brainstormed 2–3 Sep 2026.

## Why
The 1 Sep LINE send produced unprompted screenshot-sharing of the game-over
screen — people already want to show their result. This ships a proper share
button so that behaviour is one tap instead of a manual screenshot, before the
wider Reddit / Jane's-network push. Honest caveat: retention floor is ~6%, so
sharing amplifies a leaky bucket — ship the cheap version, instrument it hard,
let the data decide whether to invest further (v2 dynamic OG image, etc.).

This spec has THREE parts:
1. Share button + generated card image on the game-over screen.
2. The share text + tracked link that rides with the image.
3. The challenge landing: opening a `?c=<score>` link lands on Play with a
   "beat X" screen and a post-run "did you beat it?" result.

---

## Part 1 — Share button + card image (GameOver.tsx)

### UI
- Add a **Share** button to `src/ui/GameOver.tsx`. Reuse the existing
  `ShareIcon` from `src/ui/icons.tsx`. Place it near the Retry/Home menu
  (primary weight — it's the action we're promoting this sprint), or directly
  under the score pair. Decide placement in review; leaning: a full-width
  "Share result" button above Retry.
- On tap: generate the PNG, then call `navigator.share`. Show a "Sharing…" /
  spinner state on the button while the blob renders (font load + draw is
  fast but non-zero).

### The card image — how it's generated
Do NOT screenshot the DOM. Draw the card on a fixed offscreen canvas so every
device produces identical pixels.

- **Canvas: fixed 1080 × 1920** (9:16 story format). Independent of the phone's
  screen size — a small iPhone and a large Android export the same file.
- **Fonts must be loaded before drawing**, or canvas falls back to a system
  font: `await document.fonts.ready` (and, to be safe, explicitly
  `await document.fonts.load("900 1px Fraunces")` + Hanken weights used) before
  the first `fillText`.
- **Mascot + tone marks are SVG** → rasterize onto the canvas. Two options:
  (a) keep small pre-rendered PNGs of the Pip + 4 tone glyphs and `drawImage`
  them, or (b) build an SVG string, load it as an `Image` via a data URL, and
  `drawImage`. Prefer (b) for the tone marks (reuse `TONE_PATHS` from
  `toneIcons.tsx`, tint per state) and a single embedded PNG/SVG for the Pip.
- Export: `canvas.toBlob(cb, "image/png")` → a `File` for `navigator.share`.
- Put this in a new module, e.g. `src/share/renderCard.ts`
  (`renderShareCard(stats, history): Promise<Blob>`), kept out of the render/
  game hot path. Pure-ish: takes the numbers, returns a blob.

### Card layout (locked design — "Option C refined")
Top → bottom, centered, on `--surface` (#f7f1e3):
1. **`flappytone`** wordmark (Fraunces 700, `--ink`).
2. **Pip mascot** (the round jade bird PNG/SVG), drop shadow.
3. **Four tone cells** (2×2): each = tone-mark glyph + accuracy %. The player's
   best tone highlighted in jade (`--accent` #1c7a63), rest in `--ink`.
   Card shows raw per-tone accuracy from `toneBreakdown(stats)`.
4. **Big score**: "I scored" (kicker, `--ink-soft`) + the number in Fraunces
   900, gold. **Gold = `--beak` #c98a3c** (deep #a86c20) — the beak-gold family
   used by `.scorecard-best` in App.css. For a new-best card, the fresh-record
   plate uses `linear-gradient(180deg, #dca24b, #c98a3c)`; reuse that if the
   score tile on the card is styled as the gold plaque. (Mock used #b0771f —
   replace with #c98a3c.)
5. **"Can you beat me?"** (Fraunces 700).
6. **`flappytone.com` pill** (jade bg, `--surface` text) — CLEAN url, no params,
   no emoji. This printed url is the only link that survives image-only
   channels (IG/TikTok stories), so it must stay short + legible.
7. show a small **"★ new best"** tag by the score when
`stats.score >= history.bestScore` (recommended — a PB is the most shareable
moment). Wire off `isNewBest` already computed in GameOver.

### Analytics
- Add to the `AnalyticsEvent` union in `src/analytics/session.ts`:
  `| { type: "share_clicked"; mode: RunMode; score: number; is_best: boolean }`
- Fire `track({ type: "share_clicked", ... })` on button tap (before the
  share sheet opens, so a cancelled share still counts as intent).
- Follow the existing `run_feedback` pattern in GameOver for wiring.

---

## Part 2 — Share text + tracked link

### Copy (LOCKED)
> I'm improving my tones with FlappyTone, can you beat me?

### Payload
```
navigator.share({
  title: "FlappyTone",
  text:  "I'm improving my tones with FlappyTone, can you beat me? " +
         "https://flappytone.com/?ref=share&c=<score>",
  url:   "https://flappytone.com/?ref=share&c=<score>",
  files: [pngFile],
})
```
- Put the link INSIDE `text` AND pass `url` — behaviour varies by app; this way
  the link always appears (apps that build a preview use `url`; apps that don't
  still show it because it's in the text).
- `ref=share` → measurable inbound (see Part 3 analytics).
- `c=<score>` → the challenge param that drives the landing screen.
- Use the canonical domain `flappytone.com`.

### Fallbacks
- **No `navigator.canShare({ files })` support (mostly desktop):** fall back to
  `navigator.share({ text, url })` without the image; if `navigator.share` is
  absent entirely, `navigator.clipboard.writeText(text)` + a "copied!" toast.
- **Desktop nicety (optional):** also offer a "Download image" path
  (`URL.createObjectURL(blob)` → `<a download>`), since desktop share sheets are
  weak. Keep the copied-link toast as the guaranteed path.
- For the copied/text-only fallback, use the Wordle-style multi-line text block
  (score + emoji tone squares + link) so the paste still looks like something
  on its own.

---

## Part 3 — Challenge landing ("try to beat X")

### The hard constraint (read first)
`getUserMedia` (mic) is only granted inside a user gesture, and a gesture on the
page that shared the link does NOT survive the navigation — this is exactly why
`initialIntent()` in GameApp.tsx is "only ever a hint for the initial tab, never
an instruction to start." So a challenge link **cannot auto-start a live run.**
"Straight to play mode" = land on the **Play standby screen (`PlayHome`)** with
the challenge framing; the player's tap on Play is the gesture that opens the
mic. This is the honest, correct behaviour — not a compromise.

### Read the param
- Extend the existing URL-reading pattern (`initialIntent`, GameApp.tsx ~line
  108). Add a reader, e.g. `challengeScore(): number | null` — parse `c`,
  clamp to a sane integer range (reject absurd/negative/NaN), return null
  otherwise.
- On arrival with a valid `c`: initial screen = **Play** tab (`PlayHome`), not
  the default landing tab, and pass the challenge score down.
- Strip `c`/`ref` from the URL after reading (`history.replaceState`) so a
  refresh mid-session doesn't re-trigger the banner. Capture the value in state
  first.

### PlayHome — the "beat X" screen
- Thread a new optional prop `challengeScore: number | null` into `PlayHome`.
- When set, render a banner/card over the Play frame:
  > **Someone scored 1,425.**
  > Sing your Mandarin tones and try to beat them.  [ Play ▸ ]
- Copy must make sense to a COLD visitor who has never seen the game — name the
  mechanic ("sing your Mandarin tones"), not just "beat 1425". This is the same
  reason Part 2 copy names the mechanic.
- The existing Play button is the start gesture — no separate flow. Keep the
  challenge score in GameApp state so it survives into the run's game-over.

### Closing the loop through onboarding (calibration + tutorial CTAs)
A cold challenge visitor has never played, so their first Play tap routes them
through **calibration first** (the game is poor without it) — and possibly the
tutorial. The challenge framing must survive that detour, or the loop breaks the
moment they calibrate. So `challengeScore` has to persist in GameApp state
across calibration/tutorial (it already needs to survive into GameOver), and the
two end-of-onboarding screens get challenge-aware copy.

Both live in `src/ui/TutorialDone.tsx` (the `COPY` record, keyed by `variant`).
Thread `challengeScore: number | null` into it and, when set, override the copy:

- **End of calibration** (`variant: "calibration"`, shown after first-run
  calibration): default is "Your grid is ready / We've tuned the board to your
  voice. Let's try it out." → when a challenge is active:
  > **Your grid is ready**
  > You're tuned up. Now go beat that 1,425.   [ Beat the score ▸ ]  ·  [ Tutorial first ]
  The primary button (`onDone`) still leads straight into a real run — most
  challenge users will want to go straight in; the "Tutorial first" secondary
  stays.
- **End of tutorial** (`variant: "tutorial"`): default is "Good job! / …start
  playing for real. → Let's play." → when a challenge is active:
  > **Good job!**
  > You've got the hang of it — time to beat 1,425.   [ Beat the score ▸ ]

Only the copy/button label changes; the routing is unchanged. `calibrationVisualiser`
is untouched (visualiser path, not the scored game — no challenge there).

Implementation note: rather than duplicating the `COPY` record, pass
`challengeScore` in and pick challenge strings when non-null, falling back to the
existing `COPY[variant]` otherwise. Keep the number formatted with thousands
separators (`toLocaleString`), same as the banner and the card.

### Post-run result
- Carry `challengeScore` into `GameOver`. If the just-finished
  `stats.score >= challengeScore`, show a **"You beat it! 🎉 (target 1,425)"**
  banner; if not, **"So close — 1,425 to beat. Retry?"** nudging Retry.
- This closes the loop: the challenge is the reason they came, so the game-over
  must acknowledge it, and it feeds straight back into another Share (their new
  score becomes the next `c`).

### Analytics
- Add events to the union:
  `| { type: "challenge_landed"; target: number }`
  `| { type: "challenge_resolved"; target: number; score: number; beaten: boolean }`
- `challenge_landed` on valid `c` arrival; `challenge_resolved` at game-over when
  a challenge was active. Together with `ref=share` on the PostHog side, this is
  the full share → click → play → beat funnel. Without it we can't tell if
  sharing brings anyone back — that's the whole point of shipping cheap first.

---

## Build order (suggested)
1. `renderShareCard()` + the card (Part 1) — the visible, testable piece.
2. Share button + payload + analytics event (Parts 1–2).
3. Challenge param read + PlayHome banner + GameOver result (Part 3).
4. Fallbacks + desktop path.

## Out of scope (v2, only if v1 shows share appetite)
- Dynamic OG-image endpoint so the bare link unfurls into the card.
- Per-tone emoji block styling beyond the text fallback.
- Leaderboard (separate spec — sequenced right after this).

## Test / verify
- Unit: `challengeScore()` parsing (valid/invalid/clamp), card-data mapping.
- Manual: real `navigator.share` on iOS Safari + Android Chrome (files path),
  desktop fallback (clipboard/download), and a `?c=` cold-open in a fresh
  session that has never opened the mic (Part 3 constraint).
- Card render: `document.fonts.ready` actually resolves before draw (fonts not
  falling back), Pip + tone glyphs rasterize, 1080×1920 output.
