# FlappyTone — portfolio handoff

Everything another repo needs to write a project card for this, so it does not
have to read a game engine to find marketing copy. **This file is the source of
truth for how FlappyTone is described elsewhere.** If the pitch changes, change
it here and re-copy — do not edit a divergent version in the portfolio repo.

Copy below is written to be pasted. Nothing here is aspirational: if it says the
game does something, the game does it today.

---

## Facts

| | |
|---|---|
| Name | FlappyTone |
| Live | https://flappytone.com/ |
| Source | https://github.com/pitiao145/FlappyTone (private) |
| Status | Live, v1. Built 2–7 Aug 2026. |
| Type | Browser game / language-learning tool |
| Stack | React 19, TypeScript, Vite, Tailwind, Canvas 2D, Web Audio (`AudioWorklet`), `pitchy` for pitch detection |
| Hosting | Vercel, static + two small serverless routes (analytics, recording upload) |
| Backend | None to speak of. No accounts, no database. |
| Install | PWA — installs to the home screen from the browser, no store |

Four runtime dependencies total: `react`, `react-dom`, `pitchy`, `@vercel/blob`.

---

## One-liners

Pick by length.

**Short (card subtitle):**
> Your voice is the controller — a browser game for practising Mandarin tones.

**Medium (card body):**
> A browser game where your voice steers the bird. Live pitch detection maps
> what you sing or say onto the screen, and the corridors you fly through are
> shaped like Mandarin tone marks — so the obstacle and the lesson are the same
> object.

**Long (project page intro):**
> The four Mandarin tone marks (ˉ ˊ ˇ ˋ) are literally pitch-contour diagrams.
> FlappyTone takes that seriously: it tracks your pitch ~43 times a second and
> maps it straight to the bird's height, then asks you to fly through a corridor
> traced from the tone you are meant to produce. There is no "record, wait,
> get a score" step — the feedback is the position of the bird, frame by frame,
> and your flight path is your pitch contour drawn live.

---

## What is actually interesting about it

Three things, in the order I'd lead with. All three are real engineering
decisions with evidence behind them, not features.

**1. The corridors are measured from a speaker, not drawn from the tone marks.**
The first version traced the corridors from the diacritics — a Tone 4 was a
straight line from the top of the screen to the bottom. A native speaker could
not clear them, and the data said why: a real Tone 4 *holds* at the top for
about 60% of the syllable and then falls at roughly 95 semitones per second,
where the drawn corridor asked for a constant ~17. She cleared 90% of Tone 1
gates (the only shape with no rate demand) and 8% of everything else. The
corridors are now polylines measured from her recordings, and the reference
audio the game plays is those same takes — so the clip you hear, the shape you
fly and the timeline you are scored against are one measurement rather than
three that can disagree.

**2. When the signal is unclear, it says "couldn't hear that" rather than
scoring you wrong.** Creaky voice destroys pitch tracking, and creak
concentrates on Tone 3 — the tone learners already struggle with most. So a
gate that holds no voiced run long enough to judge is neutral: no points, no
life lost. Getting this threshold wrong is expensive in both directions; an
early version fired on roughly half of all attempts *while the player was
speaking*, because it demanded a fraction of voiced frames that syllables do not
contain. Confidently failing a correct speaker is the fastest way to lose
someone learning a language.

**3. The pitch pipeline is a pure module tested against real recordings.**
`src/pitch/` takes `Float32Array` frames in and returns pitch state out, with
zero Web Audio imports — which means it runs offline against a corpus of WAV
fixtures from a native speaker, and every tuning change reports what moved
across fit, lag, jitter and voiced percentage. I cannot hear, so "it sounds
right" was never available as evidence.

Runner-up, if there's room: the tuning constants live in a single mutable
singleton behind a dev-only Lab, so every pacing and threshold value can be
moved with sliders *while playing* and then exported as a diff to paste back
into the defaults. A value that has not been flown is not tuned.

---

## Honest limits — keep these, they are the point

The product states these itself, and a portfolio card that drops them is
overselling it.

- It checks your pitch contour, not your pronunciation. **Humming beats it.**
  It's a tone trainer, not a pronunciation checker.
- Single syllables only. No sandhi, no connected speech, no sentences.
- Tones are not only pitch — duration and voice quality carry real cues that a
  pitch-only game does not measure.

---

## Assets

All paths relative to this repo. **Copy the files into the portfolio repo** —
do not symlink or reference across repos, the deploy only bundles its own tree.

| File | What it is | Use for |
|---|---|---|
| `public/og.png` | 1200×630, the link-preview image | Project card thumbnail, hero |
| `public/favicon.svg` | The mark, vector | Favicon-sized card icon |
| `public/icons/icon-512.png` | Square raster mark | Anywhere a square icon is wanted |
| `docs/dot-trace-screenshots/` | Development captures of live pitch traces | A "how it works" figure, if the card has room |

`og.png` and the icons are generated from `src/dev/og-source.svg` — see
`docs/BRAND.md` to regenerate rather than editing the PNGs.

There is no gameplay video or GIF yet. If the card wants motion, that has to be
recorded; the landing page's demo panel is a canvas animation and cannot be
screenshotted into one.

## Palette

From `src/ui/tokens.css`, if the card should match the product.

| Token | Hex | Role |
|---|---|---|
| `--surface` | `#05070a` | Background |
| `--accent` | `#60cdff` | The dot, the buttons, the highlight |
| `--ink` | `#dfe5ec` | Body text |
| `--ink-muted` | `#9aa4b0` | Secondary text |

Type is `system-ui` throughout — there is no brand typeface to match.

---

## Do not claim

- Not "AI-powered" and not machine learning. It is signal processing —
  autocorrelation pitch detection with median filtering and octave correction.
  Saying otherwise is both wrong and the least interesting version of it.
- Not a pronunciation checker, and not speech recognition. There is no ASR.
- No user numbers. It went live 7 Aug 2026 and there are none worth quoting.
