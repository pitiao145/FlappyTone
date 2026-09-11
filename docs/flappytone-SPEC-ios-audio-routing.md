# SPEC — iOS audio routing: loud cues + mic-loss recovery

**Status:** Implemented on branch `fix/ios-audio-routing`, **pending on-device
verification and tuning** (the checklist below is not yet run). Written after
on-device measurement (Sept 2026). Scope: **iOS only** (Safari, Chrome-iOS =
WebKit, installed PWA). Nothing here changes desktop or Android behaviour.

What landed:
- **Phase 1** — `mic.ts`/`session.ts`: the AudioContext + capture worklet are
  persistent; only the `MediaStream` is released/re-acquired
  (`releaseStream`/`acquireStream`, `releaseMicStream`/`acquireMicStream`).
- **Phase 2 (Fix A)** — the game releases the mic during each cue on iOS
  (`isIOS()` gate), waits `tuning().cueReleaseMs` for the route to flip, plays
  the clip on the speaker, then re-acquires. `run.ts` carries the leading
  `playDelayMs` so freeze/trace/audio stay in sync (`render/world.ts`).
- **Phase 3 (Fix B)** — `mic.ts` reports loss (track `ended`/`mute`, ctx
  `interrupted`); `session.ts` coordinates proactive recovery + a `MicStatus`
  the UI subscribes to (`ui/MicStatus.tsx` banner in the game HUD).

**Not yet done:** the Visualiser and Calibration cue paths still play through
the live-mic (earpiece) route — a documented follow-up, not covered here.
Tunables (`cueReleaseMs`) still need flying on a real iPhone.

This spec covers two mic/audio issues that share one fix surface:

1. **Reference cues play out of the earpiece, quiet.** On iOS a live
   `getUserMedia` stream forces the whole process into a voice-processing
   (`play-and-record`) route, so all output — including the demo clip the
   player must hear — goes to the top earpiece at call volume instead of the
   bottom speaker.
2. **The mic intermittently goes "deaf" after an OS interruption** (call, Siri,
   another app) with no recovery, because nothing in the app detects a dead
   mic track or an interrupted `AudioContext`.

## Confirmed root cause (measured, not assumed)

Measured on a physical iPhone via `Console.app` (device tethered):

- During gameplay, `audiomxd` logs
  `cmsmSetVADRouteConfiguration ... routeToBuiltInSpeakerKey = 'NO'` — output
  is on the earpiece, under the voice-processing route.
- Physically verified: a FlappyTone cue comes out of the **top of the phone**
  (earpiece); a Spotify track comes out of the **bottom** (speaker).

So this is a **routing** problem, not a volume/attenuation problem. That rules
out the tempting cheap fix:

- **Makeup gain does NOT fix it** — a louder earpiece is still the earpiece.
- **A separate output-only `AudioContext` does NOT fix it** — the iOS audio
  session is **process-wide**, driven by whether any live `getUserMedia` track
  exists, not by which `AudioContext` plays the sound.
- **`track.enabled = false`, disconnecting the source node, or
  `navigator.audioSession.type` hints do NOT fix it** — the track stays live,
  so the session stays `play-and-record`.
- There is **no web equivalent of native `defaultToSpeaker` /
  `overrideOutputAudioPort(.speaker)`** on iOS as of Safari 18.4.

The only lever that returns output to the loud speaker is **releasing the
capture session** — stopping the mic's `MediaStreamTrack`s — so the OS route
reverts to `playback` (speaker). That is the basis of Fix A.

Sources behind the design: WebKit bugs 179363 / 204106 (muted-track /
`NotReadableError` on a second `getUserMedia`), 212040 / 215884 (mute-without-
unmute; PWA hash-navigation re-prompt), W3C Audio Session explainer, and the
Sam Eddy iOS-audio-sessions writeup for the ~300ms route "cling".

## Design principles

1. **One mic at a time, never two.** Never hold two live `getUserMedia`
   streams, and never call `getUserMedia` while a previous stream's tracks are
   still live — that is the muted-track / `NotReadableError` landmine. Always
   fully `.stop()` before re-acquiring.
2. **A persistent playback `AudioContext` and worklet.** The `AudioContext` and
   the capture `AudioWorkletNode` live for the whole run. Only the
   `MediaStream` + its `MediaStreamAudioSourceNode` are released and
   re-acquired. This keeps cue playback stable, avoids re-`addModule`, and makes
   re-acquire cheap. (A bare `AudioContext` with no live mic track infers the
   `playback` route — loud speaker — which is what we want during a cue.)
3. **Play cues through the `AudioContext` graph, not `<audio>`/SpeechSynthesis.**
   Already true. Keep it — `AudioContext` output resists demotion best.
4. **The mic is genuinely idle during a cue.** FlappyTone is call-and-response;
   the "listen" phase already freezes the world and ignores mic frames
   (`isCueAudible()`). Releasing the mic then costs the player nothing.
5. **Never score on unstable frames.** After a re-acquire, the first mic frames
   can be silent or garbage; scoring stays suppressed until voiced frames
   stabilise (the existing `isCueAudible()` gate already covers most of this
   window — extend it to cover re-acquire).
6. **Degrade, never break.** Any failure in the release/re-acquire dance falls
   back to "keep the mic as-is" — a quiet cue is worse than a dead game.

## Fix A — loud cues via release-during-cue

### The clean order of operations

The existing "listen" freeze (`updateCue` → `inCuePause`, held for the clip's
`cueDurationMsFor` length) becomes the window for the whole switch. A short,
**deliberate settle break** is added after the demo so the route and the mic
both have time to settle before the player speaks — which also gives the player
a beat to prepare (a UX win, per product direction).

Per gate, in order:

```
1. LISTEN phase opens (world freezes, HUD shows "listen…").
2. Release the mic:  stop() the MediaStream tracks, disconnect the source node.
                     Keep the AudioContext + worklet node alive.
3. Wait out the route cling:  ~300ms (tunable) for iOS to flip the process
                     route from earpiece back to the built-in speaker.
4. Play the cue:     playToneCue() on the persistent AudioContext — now on the
                     loud bottom speaker. Draw the demo trace as today.
5. SETTLE break:     after the clip ends, hold a short prepare beat
                     (settleMs, tunable, e.g. 250–500ms) — visually a
                     "get ready" moment; in the background, re-acquire the mic.
6. Re-acquire the mic:  getUserMedia (no re-prompt — same document), rebuild the
                     MediaStreamAudioSourceNode, connect to the existing worklet
                     node. This flips the route back to play-and-record; that is
                     fine, the cue is already done.
7. Warm-up guard:    keep scoring suppressed until voiced frames stabilise
                     (extend isCueAudible() to cover the re-acquire tail).
8. GATE opens:       the corridor arrives, the player speaks, mic drives the dot.
```

The two tunables (`routeClingMs`, `settleMs`) live in `src/game/tuning.ts` per
hard rule 6, so they can be flown in the Lab and set on a real device.

### Why the timing matters

- **Step 3 is mandatory.** iOS clings to the earpiece route for a few hundred
  ms after `stop()`; playing the cue immediately would still come out the
  earpiece. This delay is *inside* the freeze, so it costs no gameplay time.
- **Step 5/6 overlap the settle break with re-acquire**, so the mic is warm by
  the time the gate opens — the player never speaks into a cold mic.
- The whole dance happens while the world is frozen and the dot is idle, so
  there is no visible glitch beyond the intended "listen → get ready → go"
  rhythm.

### Architecture changes

`src/audio/` gains an explicit acquire/release lifecycle. Concretely
(names indicative, final shape decided in implementation):

- **`mic.ts` / `session.ts`:** split the current all-in-one `startMic`
  (ctx + getUserMedia + worklet + source, torn down together) into:
  - a persistent context+worklet that is created once, and
  - `acquireMicStream()` / `releaseMicStream()` that only add/remove the
    `MediaStream` + source node against that persistent worklet.
- `getMicSession().ctx` stays the cue-playback context (it already is), now
  guaranteed to have no live mic track during a cue.
- The generation/cancellation logic already in `session.ts` (the `generation`
  counter) extends to cover repeated release/acquire cycles cleanly.

### Trade-offs (accepted, to validate on device)

- A possible audible **route-switch pop** twice per gate (out for the cue, back
  for the mic). Only an on-device listen tells us if it is noticeable; if it is,
  a tiny fade or masking under the demo covers it.
- **Re-acquire warm-up** — mitigated by overlapping it with the settle break.
- More states to test than "open mic once and leave it." This is the real cost
  and the reason for the settle break: plenty of slack for everything to settle.

## Fix B — interruption recovery (Issue 2)

A real fix for the recoverable cases, graceful degradation for the OS-level
unrecoverable ones. Built on the same lifecycle as Fix A.

The mic controller watches for loss and recovers **proactively** — it does not
wait for `unmute`, which on iOS frequently never fires:

- **Listen for:** each mic `MediaStreamTrack`'s `mute` / `ended`; the
  `AudioContext`'s `statechange` → `interrupted` (an iOS-specific state,
  distinct from the app's own gesture-driven `suspended`); and
  `visibilitychange`.
- **On foreground-return with a dead mic** (track `muted`/`ended`, or
  `ctx.state === "interrupted"`): stop the old tracks, re-acquire via
  `getUserMedia` (behind the next user gesture where iOS requires one), rebuild
  the source node, and `resume()`. If `resume()` will not leave `interrupted`,
  **recreate the `AudioContext`** as a last resort.
- **Surface a visible mic-status indicator** so a silent-input state is never
  invisible (consistent with hard rule 8 — "couldn't hear that", never score
  the player wrong). While the mic is known-dead, gates read neutral, not
  failed.
- **Unrecoverable case:** the reported "PWA works first launch, dead on re-open
  until the OS releases the mic" bug has no JS fix. Detect the persistently
  dead mic and show a "reopen the app" message rather than spinning silently.

## Guardrail (both fixes)

**Never mutate `location.hash` or call `pushState`/`replaceState` during a
run.** In an installed PWA a URL/hash change re-triggers the mic permission
prompt (WebKit 215884) and can mute the track (212040). FlappyTone routing is
already in-memory (`GameApp`'s `Screen` state), so this is a "keep it that way"
rule, not a change — but it must be stated, and any future deep-linking work
must respect it.

## What this does NOT fix

- The earpiece route **while the mic is live** — impossible on iOS web; the fix
  is to not have the mic live during a cue, not to redirect it.
- OS-level capture regressions (e.g. the iOS 26.1 beta 1 `AVAudioSession`
  capture breakage) — those are Apple bugs; the app can only detect and message.

## On-device verification checklist (only a real iPhone can settle these)

Per the repo rule "test on a real iPhone, not the simulator", and because
Claude cannot hear:

1. **Cue routing:** with Fix A, confirm cues now come out of the **bottom
   speaker** (physically, and via `Console.app`:
   `routeToBuiltInSpeakerKey = 'YES'` during the cue window).
2. **Pop:** listen for a route-switch pop at cue start/end; decide if masking
   is needed.
3. **Warm-up:** confirm the first utterance after the settle break is captured
   in full (no clipped onset) — the `preGateBufferMs` history seed plus the
   settle break should cover it.
4. **Tune `routeClingMs` / `settleMs` in the Lab** until the listen→ready→go
   rhythm feels clean and no cue leaks to the earpiece.
5. **Interruption recovery:** trigger a real interruption (call yourself, invoke
   Siri) mid-run and confirm the mic recovers on foreground return, with the
   status indicator reflecting the dead→alive transition.
6. **PWA re-open:** confirm behaviour of the installed PWA after backgrounding
   and after a cold re-open; confirm the "reopen the app" fallback appears only
   in the genuinely-unrecoverable case.

## Implementation phasing

- **Phase 1 — lifecycle refactor:** split `startMic` into persistent
  context/worklet + `acquireMicStream`/`releaseMicStream`; no behaviour change
  yet. Keep all existing tests green.
- **Phase 2 — Fix A (release-during-cue):** wire the release/cling/play/settle/
  re-acquire sequence into the cue path (`Game.tsx` cue block + `run.ts`
  `updateCue` freeze window), with `routeClingMs`/`settleMs` in `tuning.ts`.
  Ship for on-device tuning.
- **Phase 3 — Fix B (recovery):** track/context/visibility listeners,
  proactive re-acquire, mic-status indicator, PWA-dead fallback.

Fix A and Fix B share the lifecycle from Phase 1, so Phase 1 lands first and
both build on it.

## Confidence & open questions

- **High confidence (measured/documented):** the earpiece routing and its
  cause; that only releasing the mic restores the speaker; the muted-track and
  PWA-hash hazards.
- **Medium confidence (single writeup, verify on device):** the exact
  `routeClingMs` needed; whether a pop is audible; re-acquire warm-up time.
  These are Lab/device-tuned, not guessed.
- **Open:** exact cold-vs-warm re-acquire latency on current iOS (no published
  number — measure); whether the stuck-`interrupted` `AudioContext` still
  reproduces on current iOS (may force context recreation in Fix B).
