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
6. **When the signal is unclear, the game says "couldn't hear that" — it never scores the player wrong.** A gate with >40% unvoiced frames is neutral: no points, no heart lost. Confidently failing a correct speaker is the single fastest way to lose a user.

## Layout

```
src/
  pitch/      pure DSP — detection, smoothing, octave correction, Hz→semitone→Chao. NO Web Audio.
  audio/      AudioWorklet setup, mic permission, calibration capture. Feeds src/pitch/.
  game/       loop, entities, gate generation, collision, scoring. NO React.
  render/     canvas draw calls. Pure functions of game state.
  ui/         React components: menus, HUD overlay, calibration, game over.
  dev/        dev panel + CLI analysis script.
fixtures/     WAV files for offline tests — see docs/TESTING.md
docs/         PRD.md, TESTING.md
```

## Commands

```bash
npm run dev            # vite dev server
npm run test           # vitest
npm run analyze <wav>  # print ASCII contour for a fixture — use this to "see" pitch output
npm run typecheck
```

## Testing

You cannot hear. Do not claim the pitch pipeline works based on reading the code.

Verify it by running `npm run analyze fixtures/captures/<file>.wav <f0Center>` and reading the ASCII contour, and by running the fixture tests. Full protocol in @docs/TESTING.md. Any change to `src/pitch/` requires the fixture tests to pass **and** a before/after `npm run report` comparison — state which of fit/lag/wiggle/voiced% moved, including the ones that got worse.

Ground truth is `fixtures/captures/jane_*.wav` (native Taiwanese speaker, direct mic). `chen_*`/`tan_*` were recorded speaker-into-mic and that round trip is a confound — don't rest a conclusion on them. The synthetic `fixtures/tone*.wav` prove nothing about real voices.

## Working style

- One vertical slice per session, in the order in PRD §12. A slice ends with something runnable and committed.
- Build the dev panel (`src/dev/`) in the first slice, not last. It shows live f0, clarity, RMS, voiced flag, smoothed Y and Chao value.
- When a tuning constant changes (smoothing alpha, clarity threshold, tolerances), run the fixture tests and report which golden snapshots moved.
- Ask before adding a dependency. The whole app should need: react, vite, tailwind, pitchy, and a WAV decoder for tests.

## Out of scope for v1 — do not build these

Speech recognition or syllable verification · accounts, backend, leaderboards · tone sandhi, multi-syllable words, sentences · native app builds · listening/perception drills · monetisation.

## Known limitations — do not try to "fix" these silently

- Humming beats the game. There is no syllable verification in v1. This is a known, accepted trade-off.
- Creaky voice breaks f0 tracking, and creak concentrates on Tone 3. Mitigations are specced in PRD §6 — extended grace period, wider tolerance, "couldn't hear that" instead of a zero. Do not paper over it with interpolation that invents pitch data.
