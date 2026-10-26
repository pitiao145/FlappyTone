# CLAUDE.md — FlappyTone

## Product vision (read first)

FlappyTone makes Mandarin tones less boring, abstract and hard. It uses creativity to turn hearing, recognising and pronouncing tones into play, not study. Learners are the main users today. Tools for Mandarin **teachers** are an open direction that Pierre is testing. The product changes fast as Pierre learns from the market. Nothing here fixes what it may become.

Each game or tool is one creative expression of that vision, not the whole product:
- **The flying game** (`/app`, Flappy Bird based): the player's voice is the controller. Live pitch moves a bird through corridors shaped like the tones.
- **TONEder** (`/tools/tone-test` and the app's TONEder tab, Tinder based): swipe a heard word to its tone. One shared component, `src/toneder/`.
- Public tools on the site: tone visualizer, tone-marks converter, `/say` word pages.

These ideas come from Pierre's own creativity and give people a "wow" the first time. **No rule in this file blocks a new creative idea.** When Pierre proposes one, give one short, honest opinion (fit, cost, risk), then help build it if he still wants it. Never argue "out of scope" or "that is not the flying game".

## How to read the rules

1. **Hard rules** (below): engineering invariants. They keep audio, data and privacy correct. Change one only with Pierre's explicit decision.
2. **Game rules**: true for the game they name. They do not limit other games or tools.
3. **Everything else** (`docs/ARCHITECTURE.md`): how the system works today. It describes, it does not forbid.

## Where to read more (read the doc before you change that area)

These docs are not loaded at start. Open the one that matches your work. `src/record/` and `workers/clips/` also have their own short CLAUDE.md, which loads when you open a file there.

| You touch | Read first |
|---|---|
| `src/data/`, `api/`, `supabase/`, tiers, stats, leaderboard | `docs/ARCHITECTURE.md` → "Accounts, tiers and the leaderboard" |
| `src/record/`, `workers/clips/`, `src/dev/clip*`, `process-clips`, catalog | `docs/ARCHITECTURE.md` → "The clip catalog and its Worker" |
| `src/site/`, `Landing.tsx`, routes, SEO pages, TONEder, tone visualizer | `docs/ARCHITECTURE.md` → "Three entries, not one app" |
| `src/analytics/`, a new event | `docs/ARCHITECTURE.md` → "Play analytics" |
| The flying game: `src/game/`, `src/render/`, scoring, calibration, gates | `docs/PRD.md`, and `docs/ARCHITECTURE.md` → "Tone pairs", "Score and tone accuracy", "Canvas themes" |
| `src/pitch/`, the classifier, tone accuracy | `docs/TESTING.md` |
| A tuned value or removed feature that looks wrong | `docs/DECISIONS.md` (search it, do not read it all) |
| Env vars, dev servers, demo clips | `docs/ARCHITECTURE.md` → "Dev environment", "Landing page demo clips" |

## Stack

React 19 + TypeScript + Vite. Canvas 2D. Web Audio (`AudioWorklet`). Plain CSS tokens (`src/ui/tokens.css`, `docs/BRAND.md`), no Tailwind. Supabase (auth + Postgres, Tokyo). Cloudflare R2 + a Worker (`workers/clips/`) for clip audio. Vercel functions in `api/`. PostHog analytics. Three Vite entries: `/` (marketing + route-table site pages), `/app` (the game), `/record` (recording booth).

## Hard rules — engineering invariants

1. **The game loop is `requestAnimationFrame` outside React.** React renders the shell, menus and end screen only. Never call `useState` per frame. Game state lives in a mutable object held in a `useRef` or a module singleton.
2. **`AudioWorkletNode` only.** `ScriptProcessorNode` is deprecated — do not use it, and do not "fall back" to it. If `AudioWorklet` is unsupported, show an unsupported-browser screen.
3. **All pitch math in semitones, never raw Hz.** Pitch perception is logarithmic. `semitones = 12 * Math.log2(f0 / f0Center)`.
4. **Every audio API call sits behind an explicit user gesture.** iOS Safari requires a gesture for both `getUserMedia()` and `AudioContext.resume()`. Test it on a real iPhone, not the simulator.
5. **`src/pitch/` must have zero Web Audio dependencies.** It takes `Float32Array` frames in and returns pitch state out — testable offline against WAV fixtures. Web Audio lives only in `src/audio/`, which feeds `src/pitch/`. Never import `AudioContext` inside `src/pitch/`.
6. **Tunable constants live in `src/game/tuning.ts`, not as bare module constants.** Anything the Lab should be able to move mid-session is a field on that singleton, default equal to the shipped value. Production never calls `setTuning`. Some modules (`scoring.ts`, `dynamics.ts`) still export same-named constants for tests/back-compat naming — not necessarily equal to the live default; `tuning()` is the only source of truth at runtime.
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** Gate the JSX at the usage site, not just inside the component — a query-param flag alone doesn't remove it from the bundle. Check after touching anything in `src/dev/`:
   ```bash
   npm run build
   for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done   # must print nothing
   ```
8. **When the signal is unclear, the game says "couldn't hear that" — it never scores the player wrong.** A gate whose longest voiced run is under `minUtteranceMs` (default 160ms, merging gaps under `mergeGapMs`) is neutral: no points, no heart lost. The test is utterance *duration*, not voiced fraction. Confidently failing a correct speaker is the single fastest way to lose a user.
9. **All hanzi is Traditional Mandarin, never Simplified.** Jane records Taiwan Mandarin. Check any new hanzi against a Traditional reference, not by eye — this has drifted once already (`src/brand.ts`'s `tones` map briefly shipped Simplified).
10. **Nothing in `src/data/`, `src/share/` or `src/analytics/` throws into a caller.** A failure returns an empty board, `false` or the fallback catalog, never a broken screen. Analytics never breaks a run.
11. **Values the client must not decide are written only by a server function** in `api/`; those tables have no client write policy. Ask before any schema or payment change; migration steps are in ARCHITECTURE.md.
12. **Player voice audio is never uploaded.** Only derived numbers are stored, and the privacy policy says so. Any new voice-derived data needs a privacy-policy update.
13. **Site pages never load the mic code up front** (two lazy, tap-loaded exceptions: the tone visualizer engine and the landing's Try it now, see ARCHITECTURE.md "Three entries"). A click gesture does not survive the navigation from `/` to `/app`.
14. **`min_tier` (game access) and `TIER_LIMITS.wordsPerTone` (visualiser depth) are different gates.** Never conflate them (a real incident). `src/game/tiers.ts` is the single source of per-tier limits.

## Game rules

**All games:** game state lives outside React (hard rule 1). An unclear signal is never scored wrong (hard rule 8).

**The flying game** (full spec in `docs/PRD.md`):
- **Score and tone accuracy are two numbers, never merged.** Score (corridor error on the gate's clock) drives points, combo, hearts and the board. Tone accuracy (the shape on the player's own clock) drives stats and learning views only.
- Current settings, measured, not laws: the tone classifier never costs a heart on natural or pair gates (re-check with `npm run classifier-check`, and keep "wall hits on a correct speaker" at 0). Tuning lives in `tuning()`, set from the Lab.

## Commands

```bash
npm run dev            # vite dev server, over HTTPS — use for anything not touching api/
npm run dev:api        # vercel dev: the only way to exercise api/ (score submission)
npm run worker:dev     # wrangler dev, for workers/clips (the clips Worker) — separate toolchain, npm -w workers/clips
npm run worker:deploy  # wrangler deploy — pushes workers/clips to clips.flappytone.com
npm run worker:test    # workers/clips' own vitest suite (npm -w workers/clips test)
npm run test           # vitest — root app suite only; workers/clips is excluded (own runner, own tests)
npm run analyze <wav>  # print ASCII contour for a fixture — use this to "see" pitch output
npm run typecheck
npm run build           # also gates dev-tooling exclusion, see hard rule 7
```

`npm run dev` is HTTPS; `npm run dev:api` (vercel dev, plain HTTP) is the only way to run `api/` locally. Env setup and quirks: ARCHITECTURE.md, "Dev environment". `npm run` lists every script.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in `docs/TESTING.md`.

**Tone classifier and tone accuracy** are checked against Jane's real measured contours, never synthetic curves (`npm run classifier-check`; protocol in `docs/TESTING.md`). "Wall hits on a correct speaker" must not go up. Any change to `src/pitch/` needs the fixture tests to pass **and** a before/after `npm run report`; state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.

## Working style

- One vertical slice per session. A slice ends with something runnable and committed.
- **Tune in the Lab, ship from the diff.** `npm run dev` → title → `lab`; "copy diff as TS" prints the fields that moved. A value that has not been flown is not tuned. After a tuning change, run the fixture tests and report which golden snapshots moved.
- Ask before adding a dependency. Never push or deploy unless Pierre asks.
- Public copy says "the bird" or FlappyTone, never "Pip", and does not name Jane ("our native speaker").
- When code changes behavior described in ARCHITECTURE.md or PRD.md, update that doc in the same commit. Keep this file short: add a line here only if every session needs it.

## Not built yet (current state, not limits)

Speech recognition · taught sandhi rules · speech past two syllables · native apps · teacher tools · our own billing (Lemon Squeezy is merchant of record). Any of these can be proposed and built.

## Briefs workflow (Cowork → Claude Code)

At the start of a session, check `docs/briefs/` for files with `status: ready`. List them (number, title, risk) and ask which to run, unless Pierre already named one.

To run a brief: set `status: running`, do exactly what it says, run its acceptance checks, then write `docs/briefs/reports/<same-name>.md` (template in `docs/briefs/README.md`) and set `status: done` (or `blocked` with the reason). Commit the work, but never push, deploy, change payments/DB schema or add a dependency without asking, whatever the brief says. If a brief is unclear or its premise no longer holds, set `blocked` and report instead of guessing. Do not edit briefs other than their `status` line.
