# Listen → Your turn phases + corridor width selector

**Date:** 2026-08-02 · **Status:** approved by Pierre

## Problem

1. The reference tone plays 300ms before a gate scrolls in, but nothing on
   screen separates "this is the example" from "sing now". Players start
   repeating the tone while the example is still sounding, or miss where the
   scoring window begins.
2. Corridor tolerance is hardcoded (`BASE_TOLERANCE_H = 0.12`); players can't
   pick a wider or narrower tunnel.

## Design

### 1. Listen → Your turn gate phases

Cue scheduling moves from `Game.tsx` into the pure `Run` (src/game/run.ts) so
it is testable and drives phases:

- `Run` fires the cue when the next gate's leading edge is ≤ `CUE_LEAD_MS`
  (300ms) from entering the screen — same timing as today, now computed inside
  `tickFrame`.
- `RunSnapshot` gains:
  - `cue: { tone, xStart, atMs, durationMs } | null` — set when a cue fires,
    kept until that gate is entered.
  - `phase: "listen" | "active" | null` — `"listen"` from cue fire until the
    bird enters the cued gate; `"active"` while flying a gate; `null` between.
- `Game.tsx` edge-triggers audio playback when `cue.xStart` changes (no more
  host-side cue math), shows a **"Listen 🔊"** HUD banner during `"listen"`,
  and a brief **"Your turn"** flash when the phase flips to `"active"`.
- `render/world.ts`:
  - A **demo dot** animates along the cued gate's ghost centreline, synced to
    `cue.atMs + durationMs` — the contour is "sung" visually while it sounds.
  - Un-entered gates render dimmed (fainter walls + centreline); the gate
    becomes full-brightness once active ("your turn").
- No pausing, no scroll-speed change. Pacing untouched.

### 2. Corridor width selector

- `gates.ts`: `type CorridorWidth = "narrow" | "normal" | "wide"` with
  tolerance multipliers 0.75× / 1× / 1.4×, applied via
  `applyCorridorWidth(difficulty, width)` after the ramp — so the ramp floor
  scales proportionally.
- `settings.ts`: `loadCorridorWidth()` / `saveCorridorWidth()`
  (`toneflap.width.v1`, default `"normal"`).
- `RunConfig` gains `corridor?: CorridorWidth` (default `"normal"`), applied in
  `difficultyFor` alongside pace.
- `Title.tsx`: a "Width" chip row mirroring the Speed row.
- Tone 3's 1.3× widening and the tutorial's 2× factor stack multiplicatively,
  unchanged.

## Testing

- `run.test.ts`: cue fires at the right lead; `phase` transitions
  listen → active → null; cue clears on gate entry.
- `gates.test.ts`: width multipliers; scroll speed / rest unaffected.
- `settings.test.ts`: load/save/default/corrupt for corridor width.
- No changes to `src/pitch/` — fixture snapshots unaffected.
