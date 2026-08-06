# CLAUDE.md — FlappyTone

Browser game where the player's voice is the controller. Live pitch (f0) drives a bird's Y position; the player flies through corridors shaped like Mandarin tone marks by producing the matching tone.

Full spec: @docs/PRD.md — read it before implementing a slice, not before every task.

## Stack

React 18 + TypeScript + Vite + Tailwind. Canvas 2D. Web Audio API. No backend, no accounts, no persistence except calibration in `localStorage`.

## Hard rules — these are not defaults, do not drift back to them

1. **The game loop is `requestAnimationFrame` outside React.** React renders the shell, menus and end screen only. Never call `useState` per frame. Game state lives in a mutable object held in a `useRef` or a module singleton.
2. **`AudioWorkletNode` only.** `ScriptProcessorNode` is deprecated — do not use it, and do not "fall back" to it. If `AudioWorklet` is unsupported, show an unsupported-browser screen.
3. **All pitch math in semitones, never raw Hz.** Pitch perception is logarithmic. `semitones = 12 * Math.log2(f0 / f0Center)`.
4. **Every audio API call sits behind an explicit user gesture.** iOS Safari requires a gesture for both `getUserMedia()` and `AudioContext.resume()`. This is the most common silent failure — test it on a real iPhone, not the simulator.
5. **`src/pitch/` must have zero Web Audio dependencies.** It takes `Float32Array` frames in and returns pitch state out — a pure module. This is what makes it testable offline against WAV fixtures. Web Audio lives only in `src/audio/`, which feeds `src/pitch/`. Never import `AudioContext` inside `src/pitch/`.
6. **Tunable constants live in `src/game/tuning.ts`, not as bare module constants.** Anything the Lab should be able to move during a session — pacing, cue timing, collision sustain, utterance thresholds, dot dynamics, gate lengths — is a field on that singleton, with its default equal to the shipped value. Production never calls `setTuning`. Re-introducing an `export const` for something of this kind takes the knob away from the person tuning it.
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** `src/dev/Lab.tsx`, `Soundboard` and `GateLogPanel` are all gated this way so Rollup drops the subtree. A query-param flag is *not* a gate on its own — `?gatelog` and `?soundboard` both shipped to production for exactly that reason, and a guard *inside* a component only hides it, it does not remove it. Gate the JSX at the usage site as well. Check the whole boundary after touching it:
   ```bash
   npm run build
   for s in TuningPanel "copy gate log" soundboard flappytone.gatelog; do grep -l "$s" dist/assets/*.js; done   # must print nothing
   ```
8. **When the signal is unclear, the game says "couldn't hear that" — it never scores the player wrong.** A gate whose longest voiced run is under `MIN_UTTERANCE_MS` (180ms, merging gaps under 120ms) is neutral: no points, no heart lost. The test is utterance *duration*, not voiced fraction — a 600ms gate can never be 60% voiced by a 400ms syllable, and the old fractional floor was firing on half of all real attempts. Confidently failing a correct speaker is the single fastest way to lose a user.

## Layout

```
src/
  pitch/      pure DSP — detection, smoothing, octave correction, Hz→semitone→Chao. NO Web Audio.
  audio/      AudioWorklet setup, mic permission, calibration capture. Feeds src/pitch/.
  game/       loop, entities, gate generation, collision, scoring. NO React.
  render/     canvas draw calls. Pure functions of game state.
  ui/         React components: menus, HUD overlay, calibration, game over.
  analytics/  what a play session sends home. session.ts is pure; client.ts is the only impure part.
  dev/        the Lab (dev-only tuning instance) + CLI analysis scripts.
fixtures/     WAV files for offline tests — see docs/TESTING.md
docs/         PRD.md, TESTING.md
```

Unlike `src/dev/`, **`src/analytics/` ships**. It is in the bundle, not behind
`import.meta.env.DEV`.

## Commands

```bash
npm run dev            # vite dev server
npm run test           # vitest
npm run analyze <wav>  # print ASCII contour for a fixture — use this to "see" pitch output
npm run typecheck
```

## The clip inventory

Reference clips are recorded by Jane at `/record` (a separate Vite entry,
`record.html` → `src/record/`), not cut by hand. The loop is:

```bash
npm run pull-recordings [session]  # Blob -> fixtures/recordings/<session>/ (gitignored)
npm run make-clips                 # -> public/ref/<id>.wav + manifest.json, with a review report
```

The word list comes from a two-column TSV (hanzi, pinyin) via
`npm run import-words`; `id` and `tone` are derived, never hand-written.

**`src/record/wordlist.ts` is a registry, not a generated file.** The importer
merges into it: a word already there keeps its id, and only new words mint one.
Ids of words dropped from the list stay reserved. This is load-bearing — `id` is
the blob key, the clip filename and the manifest key, so an id that moves
relabels audio that is already recorded. With 是/事/市 all `shì`, recomputing
from list order turned `shi4b` from 事 into 试 the moment a word was inserted.

Three more rules hold this together:

1. **`src/dev/clipCut.ts` is the only cutter.** `make-ref-clips` (the four
   shipped `ma` clips) and `make-clips` (everything Jane records) both call it,
   so the demo audio, the corridor shape and the timeline both run on are one
   measurement. PRD §6 calls their agreement an invariant; two past failures
   came from those three disagreeing. After touching it, regenerate and check
   `git diff public/ref` is empty.
2. **`takeDetector` and `clipCut` must find the same voiced run.**
   `takeDetector.test.ts` pins this against Jane's four captures to the
   millisecond. If one moves and the other doesn't, the shared segmentation is
   broken, not the test.
3. **`clipReview.ts` flags, it never blocks.** Its tests assert that Jane's four
   shipped clips pass clean — anything that flags those is measuring the wrong
   thing, which both of its original heuristics were.

## Play analytics

Every session writes one JSON file to Blob at
`analytics/<day>/<sessionId>.json`. Read it back with:

```bash
npm run pull-analytics [YYYY-MM-DD]   # Blob -> fixtures/analytics/ (gitignored)
npm run report-runs [YYYY-MM-DD]      # funnel, per-tone outcomes, quit histogram
```

**Production reports; a dev build does not.** A dev session is you flying the
same four gates twenty times, and mixing that in would move the numbers the
tuning decisions are read from. `?analytics` forces it on in dev — needed
because the durability paths (offline retry, `sendBeacon` on tab close) can
otherwise only be exercised by deploying. Note a Vercel **preview** deploy is a
production build, so playing on a preview URL does report.

To exercise it locally you need `npm run dev:api` (`vercel dev`), **not**
`npm run dev` — plain Vite does not serve `api/`, so the POST 404s, and the
client treats any 4xx as a payload the server will never accept and drops the
session. It looks like it worked and nothing arrives.

```bash
npm run dev:api        # http://localhost:3999/?analytics
```

The trade: `vercel dev` serves plain HTTP, which is a secure context on
`localhost` (so the mic works) but **not** over the LAN — so it cannot be used
for on-phone testing. `npm run dev` has HTTPS via basic-ssl for the phone but no
`api/`. On-device analytics testing therefore means a preview deploy, where
reporting is on by default.

Five rules hold this together:

1. **`src/analytics/session.ts` decides what is sent, and nothing else does.**
   `AnalyticsEvent` is a closed discriminated union, so a forbidden field is a
   type error rather than a review someone has to catch. Never sent: audio,
   per-frame pitch or contour data, raw user-agent, IP, geolocation, cookies.
   `api/analytics.ts` re-enforces this from the other side by requiring every
   event to be a **flat object of primitives** — the shape bulk data would
   arrive in is refused, so no blocklist of field names has to be maintained.
2. **localStorage is the source of truth; the network is a mirror.** A session
   is deleted locally only once the server acknowledges it, and the next page
   load re-sends whatever is still queued. `sendBeacon` alone does not survive
   airplane mode or a force-quit; the retry-on-load is what makes it lossless.
   Every flush PUTs the whole session to the same key with `allowOverwrite`, so
   a retry is a plain repeat — **there is deliberately no dedupe logic on
   either side, and adding any would be a sign the idempotence broke.**
3. **Analytics never breaks a run.** Every entry point in `client.ts` swallows
   its own failures, the same posture `saveGateLog` takes for quota errors. If
   this code can throw into a caller, that is the bug.
4. **Consent is checked before an id is minted**, not after. Opting out in
   Settings erases the queue and the anonymous player id immediately.
5. **A disabled build stores nothing**, rather than storing and withholding.
   `initAnalytics` leaves `deps` null, so every entry point no-ops — no id, no
   queue, no listener — and a dev run will not drain a queue a production build
   left on the same origin.

`api/analytics.ts` is public and unauthenticated — it has to be, since every
player posts to it and a bundled secret is not a secret. Its defence is the size
cap, the strict id regex, and the schema. `validate()` is the security boundary
and is tested directly in `api/_analytics.test.ts`.

**Node-only CLI scripts must be listed in `tsconfig.app.json`'s `exclude` and
`tsconfig.node.json`'s `include`.** Skipping this leaks `@types/node` into the
DOM project, where `setInterval` starts returning `Timeout` and unrelated files
fail to compile. For the same reason `session.ts` restates `MicErrorKind`
instead of importing it — importing would drag Web Audio into a graph the Node
report has to typecheck. `session.test.ts` pins the two together.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). `chen_*`/`tan_*` were recorded speaker-into-mic and that round trip is a confound — don't rest a conclusion on them. The synthetic `fixtures/tone*.wav` prove nothing about real voices.

## Working style

- One vertical slice per session, in the order in PRD §12. A slice ends with something runnable and committed.
- Build the dev panel (`src/dev/`) in the first slice, not last. It shows live f0, clarity, RMS, voiced flag, smoothed Y and Chao value.
- **Tune in the Lab, ship from the diff.** `npm run dev` → title → `lab`. The play tab runs a throwaway game beside sliders over `src/game/tuning.ts`; "copy diff as TS" prints exactly the fields that moved, for pasting into `DEFAULT_TUNING`. A value that has not been flown is not tuned.
- When a tuning constant changes (smoothing alpha, clarity threshold, tolerances), run the fixture tests and report which golden snapshots moved.
- Ask before adding a dependency. The whole app should need: react, vite, tailwind, pitchy, and a WAV decoder for tests.

## Out of scope for v1 — do not build these

Speech recognition or syllable verification · accounts, backend, leaderboards · tone sandhi, multi-syllable words, sentences · native app builds · listening/perception drills · monetisation.

## Known limitations — do not try to "fix" these silently

- Humming beats the game. There is no syllable verification in v1. This is a known, accepted trade-off.
- Creaky voice breaks f0 tracking, and creak concentrates on Tone 3. Mitigations are specced in PRD §6 — extended grace period, wider tolerance, "couldn't hear that" instead of a zero. Do not paper over it with interpolation that invents pitch data.
