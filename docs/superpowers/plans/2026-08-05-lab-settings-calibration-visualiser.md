# Dev Lab, real settings, human calibration, and the tone visualiser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or
> superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give B3 a real tuning surface (a dev-only Lab that runs its own game
instance against live-editable constants), fix the dev sliders that currently
do nothing, and raise the player-facing product: a proper Settings screen, a
calibration flow that asks for normal speech instead of "say ma", rewritten
How-to-play and tutorial framing, and a new no-obstacles Tone Visualiser.

**Architecture:** Every pacing / collision / dynamics constant that B3 needs to
move becomes a field on a mutable module singleton (`src/game/tuning.ts`) whose
defaults are exactly today's values, so production behaviour is byte-identical
until someone changes one. `Run`, `gates.ts` and the renderer read the
singleton instead of module constants. The Lab (`src/dev/Lab.tsx`, mounted only
under `import.meta.env.DEV`) hosts a live `Run` plus sliders bound to that
singleton and to the *live* `PitchTracker`, which the game now publishes via
`src/game/activeTracker.ts` — the missing link that made the old dev panel
inert. The player-facing screens are additive: a `Settings` screen, a reworked
`Calibration`, and a `Visualiser` built on a new pure segmenter
(`src/game/contours.ts`) + renderer (`src/render/visualiser.ts`).

**Tech Stack:** React 19 + TypeScript + Vite, Canvas 2D, Web Audio, vitest. No
new dependencies.

## Global Constraints

- Game loop stays outside React; no `useState` per frame. React renders shell,
  menus, HUD overlay only.
- `src/pitch/` gets **no behavioural change** in this work. New pure helpers in
  `src/pitch/calibration.ts` are additive only. `npm run report` numbers must
  not move.
- `AudioWorkletNode` only. Every audio call behind an explicit user gesture.
- All pitch math in semitones, never raw Hz.
- Dev-only code must not ship: the Lab and its route are behind
  `import.meta.env.DEV` so Rollup drops them from the production bundle.
- Default tuning values in `src/game/tuning.ts` must equal the constants they
  replace, except where a task explicitly changes one and says why.
- One vertical slice per commit; each ends runnable, typechecked and green.
- `npm run test` and `npm run typecheck` green before every commit.

---

### Task 1: Tunable constants singleton

**Files:**
- Create: `src/game/tuning.ts`
- Create: `src/game/tuning.test.ts`
- Modify: `src/game/gates.ts` (rest/scroll/tolerance bases, `TIMING_SLACK_S`,
  `MAX_TIMING_WIDEN_FACTOR`, `GATE_DURATION_S`)
- Modify: `src/game/run.ts` (`CUE_LEAD_MS`, `CUE_PAUSE_HOLD_MS`,
  `COLLISION_SUSTAIN_MS`, `PRE_GATE_BUFFER_MS`)
- Modify: `src/game/scoring.ts` (`MIN_UTTERANCE_MS`, `MERGE_GAP_MS`)
- Modify: `src/game/dynamics.ts` (`GRACE_MS`, `T3_GRACE_MS`, `EASE_TAU_MS`,
  `DRIFT_CHAO_PER_SEC`, `TRAIL_SECONDS`)

**Interfaces:**
- Produces:
  ```ts
  export interface Tuning {
    baseScrollSpeed: number;   // 220
    baseToleranceH: number;    // 0.12
    baseRestMs: number;        // 900
    restMsFloor: number;       // 600
    cueLeadMs: number;         // 300
    cuePauseHoldMs: number;    // 500
    cueApproachMs: number;     // NEW, Task 4. Default 0 = today's behaviour.
    collisionSustainMs: number;// 120
    timingSlackS: number;      // 0.09
    maxTimingWidenFactor: number; // 1.5
    preGateBufferMs: number;   // 400
    minUtteranceMs: number;    // 180
    mergeGapMs: number;        // 120
    graceMs: number;           // 120
    t3GraceMs: number;         // 250
    easeTauMs: number;         // 45
    driftChaoPerSec: number;   // 5.33
    trailSeconds: number;      // 1.0
    gateDurationS: Record<Tone, number>; // {1:0.88,2:1.07,3:1.33,4:0.6}
  }
  export const DEFAULT_TUNING: Readonly<Tuning>;
  export function tuning(): Readonly<Tuning>;
  export function setTuning(patch: Partial<Tuning>): void;
  export function resetTuning(): void;
  ```
  Existing exported constants (`COLLISION_SUSTAIN_MS`, `MIN_UTTERANCE_MS`, …)
  stay exported as the *default* values so tests and docs keep their names,
  but no runtime code reads them any more — it calls `tuning().x`.

- [ ] **Step 1: Write the failing test** — `src/game/tuning.test.ts`

```ts
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_TUNING, resetTuning, setTuning, tuning } from "./tuning.ts";
import { corridorToleranceAt } from "./gates.ts";

beforeEach(() => resetTuning());

test("defaults match the shipped constants", () => {
  expect(tuning().collisionSustainMs).toBe(120);
  expect(tuning().gateDurationS[4]).toBe(0.6);
});

test("setTuning patches one field and leaves the rest", () => {
  setTuning({ collisionSustainMs: 160 });
  expect(tuning().collisionSustainMs).toBe(160);
  expect(tuning().baseRestMs).toBe(DEFAULT_TUNING.baseRestMs);
});

test("resetTuning restores defaults", () => {
  setTuning({ baseRestMs: 1400 });
  resetTuning();
  expect(tuning()).toEqual(DEFAULT_TUNING);
});

test("gates read tuning live — widening tracks timingSlackS", () => {
  const base = corridorToleranceAt(4, 0.75, 0.8);
  setTuning({ timingSlackS: 0 });
  expect(corridorToleranceAt(4, 0.75, 0.8)).toBeLessThan(base);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/game/tuning.test.ts`
Expected: FAIL — cannot resolve `./tuning.ts`.

- [ ] **Step 3: Write `src/game/tuning.ts`**

```ts
/**
 * Live-tunable game constants.
 *
 * Every number the dev Lab can move lives here rather than as a module
 * constant, so a tuning session does not require an edit-save-reload cycle and
 * a run can be re-tuned while it is being flown. Defaults are exactly the
 * shipped values — production never calls setTuning, so nothing changes for a
 * player until a default in DEFAULT_TUNING itself is edited.
 */
import type { Tone } from "./gates.ts";

export interface Tuning { /* …as above… */ }

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  baseScrollSpeed: 220, baseToleranceH: 0.12, baseRestMs: 900,
  restMsFloor: 600, cueLeadMs: 300, cuePauseHoldMs: 500, cueApproachMs: 0,
  collisionSustainMs: 120, timingSlackS: 0.09, maxTimingWidenFactor: 1.5,
  preGateBufferMs: 400, minUtteranceMs: 180, mergeGapMs: 120,
  graceMs: 120, t3GraceMs: 250, easeTauMs: 45, driftChaoPerSec: 5.33,
  trailSeconds: 1.0,
  gateDurationS: { 1: 0.88, 2: 1.07, 3: 1.33, 4: 0.6 } as Record<Tone, number>,
});

let current: Tuning = structuredClone(DEFAULT_TUNING) as Tuning;

export function tuning(): Readonly<Tuning> { return current; }
export function setTuning(patch: Partial<Tuning>): void {
  current = { ...current, ...patch, gateDurationS: { ...current.gateDurationS, ...(patch.gateDurationS ?? {}) } };
}
export function resetTuning(): void { current = structuredClone(DEFAULT_TUNING) as Tuning; }
```

- [ ] **Step 4: Replace reads in the game modules**

In `gates.ts`: `GATE_DURATION_S[tone]` → `tuning().gateDurationS[tone]`;
`TIMING_SLACK_S` → `tuning().timingSlackS`; `MAX_TIMING_WIDEN_FACTOR` →
`tuning().maxTimingWidenFactor`; `newDifficulty()` / `rampDifficulty()` read
`tuning().baseScrollSpeed / baseToleranceH / baseRestMs / restMsFloor`.
In `run.ts`: `CUE_LEAD_MS` → `tuning().cueLeadMs`, `CUE_PAUSE_HOLD_MS` →
`tuning().cuePauseHoldMs`, `COLLISION_SUSTAIN_MS` →
`tuning().collisionSustainMs`, `PRE_GATE_BUFFER_MS` →
`tuning().preGateBufferMs`, `MERGE_GAP_MS` → `tuning().mergeGapMs`,
`GRACE_MS`/`T3_GRACE_MS`/`EASE_TAU_MS`/`DRIFT_CHAO_PER_SEC`/`TRAIL_SECONDS` →
the `tuning()` equivalents.
In `scoring.ts`: `longestUtteranceMs` and `heardUtterance` read
`tuning().mergeGapMs` / `tuning().minUtteranceMs`.
In `loop.ts` and `render/scene.ts`, the dynamics values likewise.
Keep every existing `export const` as the default-valued alias.

- [ ] **Step 5: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: all green, no snapshot movement — defaults are unchanged values.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: make pacing and collision constants live-tunable"
```

---

### Task 2: Publish the live tracker so the dev sliders actually do something

**Files:**
- Create: `src/game/activeTracker.ts`
- Create: `src/game/activeTracker.test.ts`
- Modify: `src/ui/Game.tsx` (register/unregister the tracker it builds)
- Modify: `src/game/loop.ts` (`getTracker` also registers the preview tracker)
- Modify: `src/dev/DevPanel.tsx` (target the active tracker; drop the sliders
  that cannot be honoured)

**Interfaces:**
- Produces: `setActiveTracker(t: PitchTracker | null): void`,
  `getActiveTracker(): PitchTracker | null`, and
  `getLiveState(): PitchState` — the last frame pushed by whoever is running,
  so the readout works in the game and not only in calibration preview.

**Why:** `DevPanel` mutates `getTracker()` from `loop.ts`, which is the
*calibration preview* tracker. `Game.tsx` constructs its own tracker inside its
frame sink and never publishes it, so every slider in the dev panel is inert
during play. That is the "settings weren't doing anything" report.

- [ ] **Step 1: Write the failing test** — `src/game/activeTracker.test.ts`

```ts
import { expect, test } from "vitest";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { getActiveTracker, setActiveTracker } from "./activeTracker.ts";

test("the most recently registered tracker is the active one", () => {
  const a = new PitchTracker({ sampleRate: 44100 });
  setActiveTracker(a);
  expect(getActiveTracker()).toBe(a);
  setActiveTracker(null);
  expect(getActiveTracker()).toBeNull();
});
```

- [ ] **Step 2: Run it, watch it fail** — `npx vitest run src/game/activeTracker.test.ts`

- [ ] **Step 3: Implement `activeTracker.ts`**

```ts
import type { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";

let active: PitchTracker | null = null;
let latest: PitchState | null = null;

export function setActiveTracker(t: PitchTracker | null): void {
  active = t;
  if (t === null) latest = null;
}
export function getActiveTracker(): PitchTracker | null { return active; }
export function publishState(s: PitchState): void { latest = s; }
export function getLiveState(): PitchState | null { return latest; }
```

- [ ] **Step 4: Wire `Game.tsx`**

In the frame sink, after `tracker ??= new PitchTracker({…})` call
`setActiveTracker(tracker)`, and after `tracker.push(frame)` call
`publishState(state)` before handing it to `run.tickAudio`. In the effect's
cleanup, `setActiveTracker(null)`.

- [ ] **Step 5: Wire `loop.ts`** — `handleFrame` calls `setActiveTracker(state.tracker)`
      and `publishState(state.latest)`; `configureTracker` clears it.

- [ ] **Step 6: Rework `DevPanel.tsx`**

Read from `getLiveState() ?? getLatestState()`. Keep the four sliders
(`f0Center`, `rangeSemitones`, `alpha`, `clarityThreshold`) but target
`getActiveTracker()`. Show a `no live tracker — start a run or the visualiser`
line when `getActiveTracker()` is null, so an inert slider is visibly inert
instead of silently so. Initialise slider values from the active tracker's
current config rather than `DEFAULT_CONFIG` when one exists.

- [ ] **Step 7: `npm run test && npm run typecheck`; commit**

```bash
git add -A && git commit -m "fix: dev sliders retune the tracker the game is actually using"
```

---

### Task 3: The Lab — a dev-only tuning instance of the game

**Files:**
- Create: `src/dev/Lab.tsx` (screen shell, tabs, dev-only)
- Create: `src/dev/TuningPanel.tsx` (sliders bound to `tuning()`)
- Create: `src/dev/presets.ts` + `src/dev/presets.test.ts`
- Modify: `src/App.tsx` (route `"lab"`, dev-only; move `DevPanel`,
  `GateLogPanel`, `Capture` mounts under the Lab)
- Modify: `src/ui/Title.tsx` (single `lab` button, `import.meta.env.DEV` only;
  remove the pace/tunnel/demo rows — Task 5 rehomes them)
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `tuning`, `setTuning`, `resetTuning`, `DEFAULT_TUNING` (Task 1);
  `getActiveTracker`, `getLiveState` (Task 2).
- Produces:
  ```ts
  // presets.ts
  export interface Preset { name: string; tuning: Partial<Tuning>; }
  export function loadPresets(): Preset[];
  export function savePreset(p: Preset): void;
  export function deletePreset(name: string): void;
  export function tuningDiff(t: Readonly<Tuning>): Partial<Tuning>; // vs DEFAULT_TUNING
  export function formatTuningDiff(d: Partial<Tuning>): string;     // TS source to paste
  ```

- [ ] **Step 1: Write the failing test** — `src/dev/presets.test.ts`

```ts
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_TUNING, resetTuning, setTuning, tuning } from "../game/tuning.ts";
import { formatTuningDiff, tuningDiff } from "./presets.ts";

beforeEach(() => resetTuning());

test("no diff when nothing has been changed", () => {
  expect(tuningDiff(tuning())).toEqual({});
});

test("diff reports only the fields that moved", () => {
  setTuning({ baseRestMs: 1300, collisionSustainMs: 160 });
  expect(tuningDiff(tuning())).toEqual({ baseRestMs: 1300, collisionSustainMs: 160 });
});

test("gate durations diff per tone", () => {
  setTuning({ gateDurationS: { ...DEFAULT_TUNING.gateDurationS, 1: 0.7 } });
  expect(tuningDiff(tuning()).gateDurationS).toEqual({ 1: 0.7 });
});

test("the formatted diff is pasteable TypeScript", () => {
  setTuning({ baseRestMs: 1300 });
  expect(formatTuningDiff(tuningDiff(tuning()))).toContain("baseRestMs: 1300");
});
```

- [ ] **Step 2: Run it; expect FAIL (module missing)**

- [ ] **Step 3: Implement `presets.ts`** — plain object diffing against
  `DEFAULT_TUNING`, `gateDurationS` compared key by key; presets persisted
  under `toneflap.dev.presets.v1` in `localStorage`, guarded by try/catch the
  same way `settings.ts` does.

- [ ] **Step 4: Build `TuningPanel.tsx`**

One `<Slider>` helper: label, value, min/max/step, a one-line "what this does"
help string, and an "at default" dot that lights when the value differs.
Groups, in this order (pacing first — it is what B3 needs):

  - **Pacing** — `baseRestMs` (400–2000), `restMsFloor` (300–1500),
    `cueApproachMs` (0–2000), `cuePauseHoldMs` (0–1200), `cueLeadMs` (0–1200),
    `baseScrollSpeed` (100–400).
  - **Corridor** — `baseToleranceH` (0.05–0.25), `timingSlackS` (0–0.3),
    `maxTimingWidenFactor` (1–3), `gateDurationS[1..4]` (0.3–2.0 each).
  - **Judging** — `collisionSustainMs` (40–400), `minUtteranceMs` (60–400),
    `mergeGapMs` (40–300), `preGateBufferMs` (0–1000).
  - **Dot** — `graceMs`, `t3GraceMs`, `easeTauMs`, `driftChaoPerSec`,
    `trailSeconds`.

Each `onChange` calls `setTuning({ … })` and bumps a local state counter so the
panel re-renders. Nothing per frame. Footer: `reset all`, `save preset`, a
preset list with apply/delete, and `copy diff as TS`.

- [ ] **Step 5: Build `Lab.tsx`**

A full-screen dev shell with a tab bar: **play · pitch · gates · capture ·
sounds**.

  - `play` — mounts `<Game mode="game" settings={settings} … />` with
    `key={runKey}` and a `restart` button that bumps `runKey`; the tuning panel
    sits alongside so a constant can be moved and the run restarted in one
    click. Falls back to `DEFAULT_CONFIG`-derived settings when the user has
    never calibrated, so the Lab never blocks on calibration.
  - `pitch` — `<DevPanel />` plus the standalone dot loop (`startLoop`), i.e.
    the old Step-0 prototype, so pitch tuning does not need a run.
  - `gates` — `<GateLogPanel />` plus the live gate table.
  - `capture` — `<Capture onBack={…} />`.
  - `sounds` — `<Soundboard />`.

The whole module is imported in `App.tsx` as
`const Lab = import.meta.env.DEV ? lazy(() => import("./dev/Lab.tsx")) : null;`
so it is tree-shaken out of the production build.

- [ ] **Step 6: Route it** — `App.tsx` gains `screen === "lab"`; `Title`'s dev
  button (dev builds only) navigates there and opens the mic in the click
  handler exactly as the other buttons do. Remove `devOpen`, the floating
  `DevPanel`, the `capture` intent and the three settings rows from `Title`.

- [ ] **Step 7: Verify** — `npm run test && npm run typecheck && npm run build`,
  then confirm `dist/` contains no `Lab` chunk:

```bash
npm run build && ! grep -rl "TuningPanel" dist/assets || echo "LAB LEAKED INTO BUILD"
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(dev): a separate Lab instance for tuning, dev builds only"
```

---

### Task 4: B3 — close the call-and-response gap and thin the screen

**Files:**
- Modify: `src/game/run.ts` (`updateCue` — approach-based cue timing)
- Modify: `src/game/tuning.ts` (`cueApproachMs` default; `baseRestMs` default)
- Modify: `src/game/run.test.ts`
- Modify: `docs/flappytone-SPEC-unheard-fix-and-gamification.md` (mark B3 done)

**Interfaces:**
- Consumes: `tuning()` (Task 1), the Lab (Task 3) as the tuning surface.
- Produces: no new exports. `RunSnapshot` is unchanged.

**The measured problem** (spec B3): with `cueStyle: "pause"` the cue fires when
the gate is fully on screen, the world then freezes for `cue.durationMs +
cuePauseHoldMs`, and the gate still has to travel `0.72 × width` before it is
active — a median call→response gap of 1161–1440ms, with the player answering
into a `listen…` HUD. The fix is to fire the cue *later*: when the gate's
leading edge is `cueApproachMs` of travel from the bird, so the freeze ends
just before the corridor arrives.

- [ ] **Step 1: Write the failing test** — in `src/game/run.test.ts`

```ts
test("with cueApproachMs set, the gate reaches the bird soon after the demo ends", () => {
  setTuning({ cueApproachMs: 250, cuePauseHoldMs: 250 });
  const run = new Run({ mode: "game", width: 420, rand: () => 0, cueStyle: "pause",
                        cueDurationMsFor: () => 500 });
  let now = 0;
  const step = () => { now += 16; run.tickFrame(16, now); };
  while (run.snapshot().cue === null && now < 20_000) step();
  const cueAt = now;
  while (run.snapshot().activeGate === null && now < 40_000) step();
  const gap = now - cueAt - 500 - 250; // demo + hold
  expect(gap).toBeLessThan(400);
});
```

- [ ] **Step 2: Run it; expect FAIL** — today the gap is >1000ms.

Run: `npx vitest run src/game/run.test.ts -t "soon after the demo ends"`

- [ ] **Step 3: Implement**

In `updateCue`, replace the `pause` branch's `lead = 0` with a distance test
against the bird rather than against the screen edge:

```ts
if (this.cueStyle === "pause") {
  const travelMs = ((next.xStart - this.worldX) / this.difficulty.scrollSpeed) * 1000;
  const frozenMs = this.cueDurationMsFor(next.tone) + tuning().cuePauseHoldMs;
  // Fire so the freeze ends just as the corridor arrives: the response window
  // opens on the beat the call finished, not a beat and a half later.
  if (travelMs <= frozenMs + tuning().cueApproachMs) { /* …set this.cue… */ }
  return;
}
```

Set `cueApproachMs` default to `250` and `baseRestMs` default to `1200`
(density: the spec asks that exactly one gate read as the current target;
1200ms at 220px/s is 264px of clear space, against 420px of canvas).

- [ ] **Step 4: Run the suite** — `npm run test`. Existing cue tests that
  assert the old fire point must be updated to the new rule, and the change
  stated in the commit body.

- [ ] **Step 5: Measure, do not assert**

Run a 20-gate session through the Lab, then
`npm run analyze-recording <screen-recording>` and report: median call→response
gap, `seeded` count, `missedEarly` count, unheard rate. Target: gap under
600ms, `missedEarly` at 0–1, unheard still 0%.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: fire the demo on the beat the corridor arrives (spec B3)"
```

---

### Task 5: A real Settings screen

**Files:**
- Create: `src/ui/Settings.tsx`
- Modify: `src/App.tsx` (`"settings"` screen)
- Modify: `src/ui/Title.tsx` (Settings button; the three inline rows are gone)
- Modify: `src/game/settings.ts` (add `loadReduceMotion`/`saveReduceMotion`)
- Modify: `src/game/settings.test.ts`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `loadPace/savePace`, `loadCorridorWidth/saveCorridorWidth`,
  `loadCueStyle/saveCueStyle`, `loadSettings/clearSettings`.
- Produces: `<Settings onBack, onRecalibrate, onVisualiser />`;
  `loadReduceMotion(): boolean | null` (null = follow the OS) and
  `saveReduceMotion(v: boolean | null): void`.

- [ ] **Step 1: Write the failing test** — in `src/game/settings.test.ts`

```ts
test("reduce-motion defaults to following the OS", () => {
  localStorage.clear();
  expect(loadReduceMotion()).toBeNull();
});

test("reduce-motion round-trips both explicit values", () => {
  saveReduceMotion(true);
  expect(loadReduceMotion()).toBe(true);
  saveReduceMotion(false);
  expect(loadReduceMotion()).toBe(false);
});
```

- [ ] **Step 2: Run it; expect FAIL (not exported)**

- [ ] **Step 3: Implement the two functions** in `settings.ts` under key
  `toneflap.reducemotion.v1`, storing `"os" | "on" | "off"`.

- [ ] **Step 4: Build `Settings.tsx`** — sectioned, one concern per section:

  - **Your voice** — current `f0Center` and `±range` read back in plain words
    ("centred on 148 Hz, ±4.5 semitones"), a `Re-calibrate` button, and
    `Forget my calibration` (calls `clearSettings`, routes home).
  - **Difficulty** — Speed (relaxed/normal/fast), Tunnel (narrow/normal/wide),
    each with a sentence saying what it changes. These are the same three
    segmented controls Title used to carry, given room and an explanation.
  - **Demo** — "pause & listen" vs "in flow", with the trade-off spelled out.
  - **Motion** — follow the system / always reduce / never reduce.
  - **Practice** — a link into the Tone Visualiser (Task 7).

  Each control writes through on change (no Save button — there is nothing to
  lose) and reads its initial value from the loader.

- [ ] **Step 5: Wire `App.tsx` and `Title.tsx`** — Title's menu becomes Play ·
  Tutorial · Visualiser · Settings · How to play, with `Calibrate` reachable
  from Settings rather than the title (a first run still auto-routes through
  calibration exactly as today).

- [ ] **Step 6: `npm run test && npm run typecheck`; commit**

```bash
git add -A && git commit -m "feat: a real settings screen instead of three unlabelled rows"
```

---

### Task 6: Calibration that asks for speech, not for "ma"

**Files:**
- Modify: `src/pitch/calibration.ts` (add `computeRangeFromExtremes`)
- Modify: `src/pitch/calibration.test.ts`
- Modify: `src/ui/Calibration.tsx` (new step machine and copy)

**Interfaces:**
- Consumes: `computeNoiseFloor`, `computeF0Center`, `computeRangeSemitones`.
- Produces:
  ```ts
  /** Range from a deliberate high sweep and a deliberate low sweep, in
   *  semitones relative to f0Center. Null when either capture is too sparse. */
  export function computeRangeFromExtremes(high: number[], low: number[]): number | null;
  ```

**Why:** "Say **ma** three times" asks a beginner to perform a syllable from a
language they are here to learn, and the range it produces is whatever
excursion three flat `ma`s happen to contain. Normal speech gives a better
`f0Center` (more voiced frames, natural register) and a deliberate high/low
sweep measures the range directly instead of inferring it.

- [ ] **Step 1: Write the failing test** — `src/pitch/calibration.test.ts`

```ts
test("range from extremes is half the span the speaker demonstrated", () => {
  const high = Array.from({ length: 40 }, (_, i) => 5 + (i % 5) * 0.1);
  const low = Array.from({ length: 40 }, (_, i) => -5 - (i % 5) * 0.1);
  expect(computeRangeFromExtremes(high, low)).toBe(5);
});

test("a sparse sweep yields null rather than a confident wrong answer", () => {
  expect(computeRangeFromExtremes([4, 4, 4], [-4])).toBeNull();
});

test("the result is clamped into the usable band", () => {
  const high = Array.from({ length: 40 }, () => 40);
  const low = Array.from({ length: 40 }, () => -40);
  expect(computeRangeFromExtremes(high, low)).toBe(RANGE_SEMITONES_MAX);
});

test("an asymmetric voice is sized by the span, not by one side", () => {
  const high = Array.from({ length: 40 }, () => 8);
  const low = Array.from({ length: 40 }, () => 0);
  expect(computeRangeFromExtremes(high, low)).toBe(4);
});
```

- [ ] **Step 2: Run; expect FAIL** — `npx vitest run src/pitch/calibration.test.ts`

- [ ] **Step 3: Implement**

```ts
export function computeRangeFromExtremes(high: number[], low: number[]): number | null {
  if (high.length < 10 || low.length < 10) return null;
  const h = [...high].sort((a, b) => a - b);
  const l = [...low].sort((a, b) => a - b);
  // p90 of the high sweep against p10 of the low sweep: a single octave-error
  // frame at either extreme would otherwise size the whole board.
  const half = (percentile(h, 90) - percentile(l, 10)) / 2;
  const rounded = Math.round(half * 2) / 2;
  return Math.min(RANGE_SEMITONES_MAX, Math.max(RANGE_SEMITONES_MIN, rounded));
}
```

- [ ] **Step 4: Rework the `Calibration` step machine**

`type Step = "quiet" | "talk" | "high" | "low" | "preview"`.

  - `quiet` (1000ms) — unchanged. Copy: "Give me a second of quiet."
  - `talk` (6000ms) — "Just talk. Say what you had for breakfast, or count to
    ten." Median voiced f0 → `f0Center`. On a sparse capture, the existing
    never-blame-the-player retry: "Couldn't hear that — let's try again."
  - `high` (3000ms) — "Now say **ahh** as high as is comfortable — no
    straining." Collect `semitones` from a tracker built on the measured
    `f0Center`.
  - `low` (3000ms) — "And as low as is comfortable."
  - `preview` — `computeRangeFromExtremes(high, low) ?? computeRangeSemitones(
    observed) ?? RANGE_SEMITONES` seeds the slider; the live preview, "fit to
    my voice" button and slider stay as they are.

Each of `talk`/`high`/`low` keeps its own frame sink and its own progress
meter, exactly as the existing steps do, and the visibility-pause behaviour is
untouched. The `high`/`low` steps show the live dot as well, so the player can
see themselves reaching — that is what makes the instruction legible without
words.

- [ ] **Step 5: Verify by ear and by eye** — run `npm run dev`, complete
  calibration, and check on the preview screen that saying a high and a low
  vowel reaches near Chao 5 and Chao 1 without pinning. Report the measured
  `f0Center` and range.

- [ ] **Step 6: `npm run test && npm run typecheck`; commit**

```bash
git add -A && git commit -m "feat: calibrate from normal speech and a pitch sweep, not from 'ma'"
```

---

### Task 7: The Tone Visualiser

**Files:**
- Create: `src/game/contours.ts` + `src/game/contours.test.ts` (pure segmenter)
- Create: `src/render/visualiser.ts` + `src/render/visualiser.test.ts`
- Create: `src/ui/Visualiser.tsx`
- Modify: `src/App.tsx` (`"visualiser"` screen), `src/ui/Title.tsx`,
  `src/App.css`

**Interfaces:**
- Consumes: `setFrameSink`, `getMicSession`, `PitchTracker`, `chaoToY`,
  `drawChaoGrid`, `corridorChaoAt`, `playToneCue`, `tuning()`.
- Produces:
  ```ts
  // contours.ts
  export interface ContourPoint { tMs: number; chao: number; }
  export interface Contour { points: ContourPoint[]; startedAtMs: number; endedAtMs: number | null; }
  export class ContourRecorder {
    constructor(opts?: { mergeGapMs?: number; minMs?: number; maxKept?: number });
    push(chao: number, voiced: boolean, nowMs: number): void;
    /** The utterance in progress, times rebased to its own start. */
    live(): Contour | null;
    /** Completed utterances, newest last, capped at maxKept. */
    finished(): Contour[];
    clear(): void;
  }
  ```

**Why:** the game's own trail is drawn in world space against a moving
corridor. To *compare shapes*, x must be time-since-utterance-start with the
world held still — the same data, drawn on a stationary axis. This is the
practice mode the game has no room for.

- [ ] **Step 1: Write the failing test** — `src/game/contours.test.ts`

```ts
import { expect, test } from "vitest";
import { ContourRecorder } from "./contours.ts";

const feed = (r: ContourRecorder, from: number, to: number, voiced: boolean, chao = 3) => {
  for (let t = from; t < to; t += 20) r.push(chao, voiced, t);
};

test("a voiced run becomes a live contour rebased to its own start", () => {
  const r = new ContourRecorder();
  feed(r, 1000, 1400, true, 4);
  const live = r.live();
  expect(live).not.toBeNull();
  expect(live!.points[0].tMs).toBe(0);
  expect(live!.points.at(-1)!.tMs).toBeGreaterThanOrEqual(360);
});

test("silence longer than the merge gap ends the utterance", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 400, true);
  feed(r, 400, 700, false);
  expect(r.live()).toBeNull();
  expect(r.finished()).toHaveLength(1);
});

test("a short blip is discarded rather than kept as an utterance", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 100, true);
  feed(r, 100, 400, false);
  expect(r.finished()).toHaveLength(0);
});

test("a gap shorter than the merge gap does not split a T3 creak dropout", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 200, true);
  feed(r, 200, 280, false);
  feed(r, 280, 500, true);
  feed(r, 500, 800, false);
  expect(r.finished()).toHaveLength(1);
  expect(r.finished()[0].points.at(-1)!.tMs).toBeGreaterThan(400);
});

test("only maxKept contours are retained", () => {
  const r = new ContourRecorder({ maxKept: 2, mergeGapMs: 120, minMs: 100 });
  for (let i = 0; i < 4; i++) {
    feed(r, i * 1000, i * 1000 + 300, true);
    feed(r, i * 1000 + 300, i * 1000 + 800, false);
  }
  expect(r.finished()).toHaveLength(2);
});
```

- [ ] **Step 2: Run; expect FAIL** — `npx vitest run src/game/contours.test.ts`

- [ ] **Step 3: Implement `ContourRecorder`** — one open run, closed when
  `nowMs - lastVoicedAt > mergeGapMs`; a closed run shorter than `minMs` is
  dropped (a cough is not an utterance — the same rule the gate scorer uses,
  for the same reason). Defaults come from `tuning()`.

- [ ] **Step 4: Write the failing render test** — `src/render/visualiser.test.ts`,
  differential in the style of `scene.test.ts`:

```ts
test("the target contour is drawn even before the player says anything", () => {
  const bare = calls(() => drawVisualiser(ctx(), 420, 746, { tone: null, live: null, finished: [], spanMs: 1500, chao: 3, voiced: false }));
  const withTarget = calls(() => drawVisualiser(ctx(), 420, 746, { tone: 2, live: null, finished: [], spanMs: 1500, chao: 3, voiced: false }));
  expect(withTarget.stroke).toBeGreaterThan(bare.stroke);
});

test("a finished contour adds strokes over the live one", () => { /* same shape */ });

test("the contour is not drawn through a gap in the data", () => {
  // two points 500ms apart must not be joined — assert a moveTo between them
});
```

- [ ] **Step 5: Implement `drawVisualiser`**

```ts
export interface VisualiserScene {
  /** Target contour to ghost across the panel, or null for free play. */
  tone: Tone | null;
  live: Contour | null;
  /** Faded previous attempts, oldest dimmest. */
  finished: readonly Contour[];
  /** Milliseconds spanned by the full canvas width. */
  spanMs: number;
  chao: number;
  voiced: boolean;
}
export function drawVisualiser(ctx, w, h, scene: VisualiserScene): void;
```

Backdrop + `drawChaoGrid`, then the target contour as a dashed ghost sampled
from `corridorChaoAt(tone, t)` across the full width, then finished contours at
descending alpha, then the live one as a bright ribbon, then the dot at
`x = tMs/spanMs * w`. The dot rests at the left edge when nothing is being
said, so a new utterance visibly starts from the beginning.

- [ ] **Step 6: Build `Visualiser.tsx`**

Same shape as `Game.tsx`: `scaleForDpr`, a rAF loop, a frame sink building one
`PitchTracker` from the saved settings, `setActiveTracker` so the Lab's sliders
reach it. React renders only: a tone selector (`— · 1 · 2 · 3 · 4`), a
`play the example` button (`playToneCue`, same gesture rules), `clear`, and a
line of copy — "Say a syllable. The line is your pitch." Pause on
`visibilitychange` with the same overlay as the game. On unmount:
`setFrameSink(null)`, `setActiveTracker(null)`, `stopMic()`.

- [ ] **Step 7: Route it** — Title gains `Visualiser`, Settings links to it,
  and it routes through calibration on a first run exactly as Play does.

- [ ] **Step 8: `npm run test && npm run typecheck`; commit**

```bash
git add -A && git commit -m "feat: tone visualiser — see the shape your voice made"
```

---

### Task 8: Rewrite How-to-play, and frame the tutorial

**Files:**
- Modify: `src/ui/HowTo.tsx`
- Modify: `src/ui/Game.tsx` (tutorial start card)
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `TONE_INFO`, `RunMode`.
- Produces: no new exports.

- [ ] **Step 1: Rewrite `HowTo.tsx`** into four titled sections:

  - **The idea** — "The dot is your pitch. Each corridor is the shape of a
    Mandarin tone. Say the syllable with that shape and you fly through it."
  - **The four tones** — the existing `TONE_INFO` list, each row gaining a
    small inline SVG of the contour drawn from `corridorChaoAt` so the shape is
    visible next to the words.
  - **How a gate goes** — listen to the example → the corridor arrives →
    say it → the path you flew lights up. Names the three outcomes and says
    explicitly that "couldn't hear that" costs nothing.
  - **Honest limits** — humming beats it; single syllables only; Bluetooth
    headsets add 100–200ms and will feel wrong; the reference voice is Jane, a
    native Taiwanese speaker, used with permission.

  Plus a closing line pointing at the Visualiser for practice without pressure.

- [ ] **Step 2: Add the tutorial start card** in `Game.tsx`

When `mode === "tutorial"`, hold the run before the first frame behind a card:
"Tutorial — eight gates, one tone at a time. No score, no hearts, twice the
room. Listen, then say it." with a `Start` button. The button is also the
gesture that resumes the AudioContext, which is the iOS-safe place for it. Gate
the rAF `start()` on that state rather than starting on mount.

- [ ] **Step 3: Verify the tutorial still ends after eight gates**

Run: `npm run test` (existing `run.test.ts` tutorial-length assertions), plus a
manual pass through the tutorial in `npm run dev`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs(ui): rewrite how-to-play and frame the tutorial before it starts"
```

---

### Task 9: Record what changed

**Files:**
- Modify: `docs/flappytone-SPEC-unheard-fix-and-gamification.md`
- Modify: `docs/PRD.md` (§5.4 calibration, §8 screens, §12 build order)
- Modify: `CLAUDE.md` (layout section: `src/dev/Lab.tsx`, `src/game/tuning.ts`)
- Modify: `docs/TESTING.md` (how to use the Lab to tune a constant)

- [ ] **Step 1: Mark B3 done in the spec**, with the measured call→response gap
  from Task 4 Step 5 — the number, not an impression — and move any B3 item
  that did not land into "Open, carried forward".

- [ ] **Step 2: Supersede PRD §5.4** with the talk/high/low calibration, in the
  same `> **⚠️ Superseded**` style the file already uses, saying why "say ma
  three times" was replaced. Add the Visualiser to §8's screen list and note in
  §14 that "does the trail read better as a line or a ribbon" now has a
  dedicated surface to answer it on.

- [ ] **Step 3: Add to `CLAUDE.md`** — `src/game/tuning.ts` is the only place a
  pacing constant should live, and `src/dev/Lab.tsx` is where it gets moved;
  never re-introduce a bare module constant for something the Lab should own.

- [ ] **Step 4: Add a TESTING.md section** — "Tuning a constant": open the Lab,
  move the slider, fly ten gates, `copy diff as TS`, paste into
  `DEFAULT_TUNING`, then run the fixture tests and `npm run report`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: record the Lab, the new calibration, and B3's result"
```

---

## Self-review

**Spec coverage.** B3 → Task 4 (with Tasks 1 and 3 as its prerequisites: the
tuning surface exists before the tuning happens). "Dev-only separate instance"
→ Task 3. "Dev-mode settings do nothing" → Task 2 (root cause: `Game.tsx`
builds a tracker the dev panel cannot see) and Task 3 (the tuning sliders that
replace the inert ones). "Proper settings menu" → Task 5. "Update tutorial and
how-to" → Task 8. "Human-friendly calibration, talk normally, auto-detect
range" → Task 6. "Tone visualiser" → Task 7. Docs → Task 9.

**Type consistency.** `tuning()` returns `Readonly<Tuning>` everywhere;
`setTuning` takes `Partial<Tuning>` everywhere; `Contour` /`ContourPoint` are
consumed by `VisualiserScene` under the same names; `setActiveTracker` /
`getActiveTracker` / `publishState` / `getLiveState` are used with those exact
names in Tasks 2, 3 and 7.

**Risk.** Task 1 touches every game module at once. It is a pure mechanical
substitution with unchanged values, so the existing suite is the check: if any
test moves, the substitution is wrong, not the test.
