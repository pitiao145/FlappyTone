# Build brief — "The Pip" bird (replaces the game dot)

**Goal:** replace the player's plain dot with a small round bird ("the Pip") — round body, beak, eye — drawn on the existing Canvas 2D layer. It tilts to lean into the pitch slope. **Scoring must not change:** the beak tip is the pitch point, exactly where the dot's centre used to be.

## Non-negotiables

1. **Beak tip = pitch anchor.** The tip sits at the same `(x, pitchY)` the dot's centre used. All scoring, collision, and gate logic keep reading that point. The body/eye are decoration that trail *behind* the tip — never move the scoring anchor to the body centre.
2. **Canvas, not SVG/DOM.** Draw it as a `Path2D` in the existing `render/` layer, as a pure function of game state. No SVG elements, no per-frame allocation. Build the `Path2D`s once at module load.
3. **Honesty state.** When the signal is unclear (the existing "couldn't hear that" condition), the Pip goes faded + neutral grey — never red, never punished.

## Geometry (local space, beak tip at origin `(0,0)`, facing +x)

Body radius `R ≈ 11px` at base scale (scale with existing dot size / DPR). Beak length `≈ 8px`.

```
body   : circle  centre (-R*0.75, 0)  radius R          // ~(-8, 0), r 11
belly  : lighter arc on lower-front of body (optional, accent-bright, ~50% opacity)
beak   : triangle  (-2, -3.5) → (6, 0) → (-2, 3.5)      // tip at (6,0)… see note
eye    : white circle (-R*0.55, -R*0.4) r≈2.6 ; pupil dark r≈1.2, nudged toward beak
```

Note on the anchor: author the shape so the **beak tip lands exactly at local (0,0)** (shift the coords above by −tipX so the tip is the origin). Then `ctx.translate(x, pitchY)` puts the tip on the pitch point and `ctx.rotate(angle)` pivots the whole bird **around the tip**, keeping the anchor invariant at every tilt.

## Colors (use existing design tokens, do not hardcode hex)

- body `color/accent` (#3EA88F) · belly `color/accent-bright` (#7FCBB7, ~50%)
- beak warm gold #C98A3C (add a token e.g. `color/beak` if none fits)
- eye white `color/ink`-on-light (#F7F1E3) · pupil `color/surface`/ink (#1A1816)

## Tilt (lean into the tone)

- Derive a **slope** from the pitch you already track: `slope = Δsemitones / Δframes` over a short window (e.g. last ~80–120ms), matching how the trail is computed.
- Map to an angle with a gain, then clamp: `angle = clamp(slope * K, -MAX, +MAX)`, `MAX ≈ 26°` (0.45 rad). Positive pitch-rise → beak up (negative screen-y is up, so sign accordingly).
- **Smooth it**: lerp the rendered angle toward the target each frame (`a += (target - a) * 0.25`) so it doesn't jitter on noisy pitch.
- When unvoiced/unheard, ease angle back to 0.

## Draw function (shape of it)

```js
// module scope — built once
const BODY = new Path2D(); BODY.arc(-8, 0, 11, 0, Math.PI*2);
const BEAK = new Path2D("M-8 -3.5 L0 0 L-8 3.5 Z"); // tip at (0,0)
// ...eye, belly

// per frame
function drawPip(ctx, x, y, angle, state, s /*scale*/){
  ctx.save();
  ctx.translate(x, y);           // tip = pitch point
  ctx.rotate(angle);
  ctx.scale(s, s);
  // state → fills:
  //   flying : accent / gold / eye
  //   success: accent-bright body + faint ring, brief scale pop (1.0→1.15→1.0 over ~180ms)
  //   hurt   : quick red flash + 2–3px horizontal shake (~150ms), then back to flying
  //   unheard: everything neutral grey, globalAlpha ~0.4
  ctx.fill(BODY); ctx.fill(BEAK); /* belly, eye, pupil */
  ctx.restore();
}
```

## States → triggers (reuse existing events, don't invent new game logic)

| State | Trigger | Visual |
|---|---|---|
| flying | default | accent body, gold beak, eye |
| success | gate cleared / confident-correct tone (classifier match) | body → accent-bright, expanding ring, ~180ms scale pop |
| hurt | collision / heart lost | red flash + small shake, ~150ms |
| unheard | existing "couldn't hear" (utterance < MIN_UTTERANCE_MS) | faded grey, alpha ~0.4, angle eases to 0 |

## Performance / correctness

- `Path2D`s created once at module load; per frame only `save/translate/rotate/scale/fill/restore`. No object allocation in the loop.
- Respect the existing device-pixel-ratio scaling — draw in the same coordinate space as the current dot; don't double-apply DPR.
- Keep it a pure function of `(x, y, angle, state, scale)` so it stays testable and lives cleanly in `render/`.

## Files

- Add `drawPip()` to the `render/` layer (new file or beside the current dot draw).
- Replace the dot draw call at the player-render site with `drawPip(...)`, passing the same `(x, pitchY)` and a smoothed `angle` + current `state`.
- Add a `color/beak` token if adopting the gold.
- No changes to `game/` scoring, collision, gates, or the pitch anchor.

## Acceptance criteria

- Beak tip is pixel-identical to the old dot centre; scores/collisions unchanged (verify against existing tests).
- Bird visibly leans up on rising tones, down on falling, level on flat — smoothly, no jitter.
- Success/hurt/unheard states read clearly; unheard is never red.
- No measurable frame-time regression vs. the dot; no per-frame allocations.
- Legible down to the smallest in-game size and on mobile.
