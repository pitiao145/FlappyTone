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
7. **Dev tooling lives behind `import.meta.env.DEV` and stays out of `dist/`.** `src/dev/Lab.tsx` and `GateLogPanel` are both gated this way so Rollup drops the subtree. A query-param flag is *not* a gate on its own — `?gatelog` and `?soundboard` both shipped to production for exactly that reason, and a guard *inside* a component only hides it, it does not remove it. (Both params are gone now; `GATE_LOG_ENABLED` is the `DEV` literal alone, which is what was doing the work.) Gate the JSX at the usage site as well. Check the whole boundary after touching it:
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

**A gate is built from a word, not a tone.** `manifest.json` carries each
clip's `durationS` and its corridor `polyline`; `src/game/words.ts` parses it,
`shapeForWord` turns it into the corridor, and `reference.ts` fetches the audio
by word id. `public/ref/` is the shipped inventory and nothing else — the four
`ma` anchors moved to `fixtures/anchors/`, because 麻 `má` has id `ma2` and both
cutters were writing `public/ref/ma2.wav`.

**The clip is the take; the corridor is the voiced part of it.** `make-clips`
copies `fixtures/recordings/<session>/<id>.wav` to `public/ref/<id>.wav`
verbatim, apart from a 15ms fade at each end for click-free edges. Nothing is
cut. Every attempt to define the audio by voicing failed the same way, twice:
first at the front (an aspirated onset carries no pitch, so `chang2` played as
"hang"), then at the back, worst on the tone where voicing detection is weakest
— `yuan3` shipped as 453ms of a 1495ms take, `ni3` 474 of 1495, `wo3` 367 of
1389, because creak reads as unvoiced. Median loss across the 120 takes was
360ms. The raw takes carry a median of 64ms of lead silence and none at the
end, so there was never dead air worth cutting.

Voicing still defines the **corridor**: `durationS`, `polyline` and `contour`
are measured over the voiced window alone, exactly as before, so shipping the
takes moved audio and nothing else — all 120 polylines are byte-identical
across the change. `clipCut` still cuts for the four anchors; for `make-clips`
it only measures, reporting `toneStartMs` and `sourceMs` so the tone window can
be located inside the file.

That makes three clocks on one cue, and they must not be folded together:

| manifest | `run.ts` | what it is |
|---|---|---|
| `clipS` | `durationMs` | the whole file — how long the world freezes and the mic stays shut |
| `onsetS` | `sweepDelayMs` | file start → tone start; the dot holds through it |
| `durationS` | `sweepMs` | the tone window; the gate and the corridor |

`clipS` is not `onsetS + durationS` — there are 106–832ms of audio after the
tone window ends. Reading the cue's length off the tone window is what let a
cue play into a live mic. And `onsetS` is bounded by `clipS`, never by
`durationS`: seven words have more lead-in than tone, and the old bound zeroed
exactly those. `reference.ts` re-derives none of the three — it used to re-trim
each clip at 3% of peak, a leftover from the audio-cmn mp3s.

**Level comes from the tone mark, shape from the recording.** Her T4 onsets
reach ~330Hz against a T1 at ~215 — reproducibly, across both sessions — so a
contour normalised against her own voice puts "high level" T1 at chao 3.3.
`src/dev/clipNormalize.ts` maps each tone's cohort as a body onto the canonical
Chao span: the differences between that tone's 30 words survive, only their
shared height is taken from the mark. Contours are measured against a
deliberately wide range (`MEASURE_RANGE_SEMITONES`) and clamped once, after
placement — clamping first destroys the anchors.

**Tone 3 corridors are no longer synthetic (16 Aug 2026).** They used to be:
22 of her 30 T3 takes measured as a falling third that never rises, so a T3
gate flew one citation polyline while cueing her actual word — the only place
demo and corridor disagreed. That "22 of 30" reading was itself the defect:
`clipCut.ts`'s voicing rescue (`TONE_3_RESCUE`) and run-merge gap
(`TONE_3_MERGE_GAP_MS`, 600ms) were both too narrow for T3's creaky trough, so
the rise was being discarded before it was ever measured, not absent from her
speech. Raw-trace diagnostics on the raw captures confirmed a real rise on
every word checked. With that fixed, all 30 T3 words measure a real
dip-and-rise, `shapeForWord` no longer special-cases tone 3, and the citation
fallback in `gates.ts` is gone — every tone, including 3, flies its own
recording's shape.

Five more rules hold this together:

1. **`src/dev/clipCut.ts` is the only measurement.** `make-ref-clips` (the four
   anchor `ma` clips, now `fixtures/anchors/`) and `make-clips` (everything Jane
   records) both call it, so the corridor shape and the timeline the demo runs
   on are one measurement. PRD §6 calls their agreement an invariant; two past
   failures came from those disagreeing. It is still a cutter for the anchors
   only — `make-clips` uses its offsets and ignores its samples. After touching
   it, regenerate and check `git diff fixtures/anchors` is empty, and that the
   `polyline`/`contour` fields of `manifest.json` did not move.
2. **`takeDetector` and `clipCut` must find the same voiced run.**
   `takeDetector.test.ts` pins this against Jane's four captures to the
   millisecond. If one moves and the other doesn't, the shared segmentation is
   broken, not the test.
3. **`clipReview.ts` flags, it never blocks.** Its tests assert that Jane's four
   anchor clips pass clean — anything that flags those is measuring the wrong
   thing, which both of its original heuristics were.
4. **`f0Center` is measured per session, not read from `speakers.json`.** That
   file is a measurement of one sitting and pitch drifts between them: against a
   stale 168 for a session she recorded at 201, six T1 clips came out as a flat
   line pinned at chao 5. `measurePitchReference` pools the session's own voiced
   frames.
5. **`manifest.test.ts` is the seam between the cutter and the game.** Nothing
   else connects them, and a renamed field surfaces as an empty inventory —
   which degrades to the tuning defaults and looks exactly like the game
   working.

## Play analytics

Gameplay and traffic analytics both go through PostHog now
(`src/analytics/posthog.ts`), proxied through this domain at `/relay/...`
(`vercel.json`) rather than hitting `us.i.posthog.com` directly — ad/tracker
blockers (Brave, uBlock's EasyPrivacy list) block PostHog's own domains by
name, and without the proxy that silently drops every event from a blocked
player, not a random sample. Read the funnel/per-tone/quit-histogram numbers
as live PostHog Insights, not a local report script — there is no
`pull-analytics`/`report-runs` anymore.

This replaced a Vercel Blob-backed pipeline (one JSON file per session,
`npm run pull-analytics` + `npm run report-runs`) that hit Blob's Hobby-plan
"advanced operations" cap as player volume grew, because every flush was a
`put()`. See the migration design doc for the full reasoning and the
reliability trade accepted along the way.

**Production reports; a dev build does not.** A dev session is you flying the
same four gates twenty times, and mixing that in would move the numbers the
tuning decisions are read from. `?analytics` forces it on in dev, matching
`initPostHog`'s own enable check. Note a Vercel **preview** deploy is a
production build, so playing on a preview URL does report.

Four rules hold this together:

1. **`src/analytics/session.ts` decides what a gameplay event can contain, and
   `posthog.ts`'s `before_send` re-enforces it at the transport boundary.**
   `AnalyticsEvent` is a closed discriminated union, so a forbidden field on a
   gate/run/calibration event is a type error rather than a review someone has
   to catch; `before_send` then reduces every *sent* property on those event
   names to that same closed set, dropping PostHog's own `$`-prefixed defaults
   ($current_url, $browser, $device_id, etc.). Never *sent by this app's code*:
   audio, per-frame pitch or contour data, raw user-agent, precise geolocation,
   cookies. Country-level geo (`$geoip_country_name`/`code` only) is the one
   deliberate exception on the geolocation front — it answers a real open
   product question (PRD §14: Taiwan vs. Beijing reference audio) at a
   re-identification risk no higher than the `device` bucket already sent.
   City, region, and lat/long are stripped by `before_send` regardless. Raw IP
   is a separate matter: the PostHog project (id 426310, "Default project") is
   **shared across several of Pierre's apps**, not FlappyTone-specific, and its
   `anonymize_ips` project setting is deliberately left as the other apps had
   it rather than changed on FlappyTone's behalf — check the current value
   with `project-get` before assuming either way, and raise any change with
   Pierre first since it is project-wide, not scoped to this app. Marketing
   events (CTA clicks, `$pageview`) are untouched by the `before_send`
   allowlist — it only applies to the gameplay event names.
2. **Analytics never breaks a run.** Every entry point in `client.ts` and
   `posthog.ts` swallows its own failures, the same posture `saveGateLog`
   takes for quota errors. If this code can throw into a caller, that is the
   bug.
3. **Consent is checked before capture starts**, not after, and it is one flag
   for both traffic and gameplay events — `setSharingEnabled`/
   `setPostHogConsent` are two names for the same toggle. Opting out in
   Settings resets the PostHog id and stops capture immediately.
4. **A disabled build stores nothing.** `initPostHog` never starts the SDK
   outside production (or `?analytics`), so every capture call is a true
   no-op — no id, no queued events, no listener — and a dev run cannot leak
   into the numbers a production build reports.

**The accepted reliability gap:** PostHog's JS SDK does not persist a queue
across a tab close, force-quit, or offline period — unlike the Blob pipeline's
old localStorage-backed retry-on-load, which existed specifically to survive
that. The mitigation is a short batch window (`request_queue_config.flush_interval_ms`,
250ms) plus `send_instantly` on `run_end`, which shrinks the loss window to
"the last event or two before a crash" rather than a whole unflushed session.
This is a deliberate trade for not maintaining that machinery, not an
oversight — do not silently try to rebuild the old durability queue on top of
PostHog.

**Node-only CLI scripts must be listed in `tsconfig.app.json`'s `exclude` and
`tsconfig.node.json`'s `include`.** Skipping this leaks `@types/node` into the
DOM project, where `setInterval` starts returning `Timeout` and unrelated files
fail to compile. For the same reason `session.ts` restates `MicErrorKind`
instead of importing it — importing would drag Web Audio into a graph the
payload module has to stay free of, the same separation `src/pitch/` keeps.
`session.test.ts` pins the two together.

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). The synthetic `fixtures/tone*.wav` prove nothing about real voices.

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
