/**
 * Smoke coverage for the world renderer.
 *
 * Nobody can see this code run in CI, and "it looked fine on my laptop" is not
 * available to an agent — so the bar here is: every branch of drawWorld
 * executes against a real snapshot without throwing, and no coordinate reaches
 * the canvas as NaN. A NaN silently draws nothing, which is exactly how the
 * previous outcome flash managed to be invisible on a real device without any
 * test noticing.
 *
 * What it deliberately does NOT claim: that any of this looks good. That needs
 * eyes on a device (docs/TESTING.md §6).
 */
import { describe, expect, it } from "vitest";
import { Run, type RunSnapshot } from "../game/run.ts";
import { shapeForTone } from "../game/gates.ts";
import type { PitchState } from "../pitch/types.ts";
import { toleranceChao, type Tone } from "../game/gates.ts";
import { corridorEdges, drawWorld } from "./world.ts";

const W = 420;
const H = 747;

interface Recorded {
  calls: string[];
  numbers: number[];
}

/**
 * A CanvasRenderingContext2D stand-in that records call names and every
 * numeric argument it is handed.
 */
function fakeCtx(): { ctx: CanvasRenderingContext2D; rec: Recorded } {
  const rec: Recorded = { calls: [], numbers: [] };
  const gradient = {
    addColorStop: (offset: number) => {
      rec.calls.push("addColorStop");
      rec.numbers.push(offset);
    },
  };
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: number[]) => {
          rec.calls.push(prop);
          rec.numbers.push(...args);
          return gradient;
        };
      }
      if (prop === "canvas") return { width: W, height: H };
      // Style/state properties are assigned, not called.
      if (
        prop === "fillStyle" ||
        prop === "strokeStyle" ||
        prop === "lineWidth" ||
        prop === "font" ||
        prop === "textBaseline" ||
        prop === "lineJoin" ||
        prop === "lineCap"
      ) {
        return "";
      }
      return (...args: unknown[]) => {
        rec.calls.push(prop);
        for (const a of args) if (typeof a === "number") rec.numbers.push(a);
      };
    },
    set() {
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as CanvasRenderingContext2D, rec };
}

function pitch(chao: number | null): PitchState {
  if (chao === null) {
    return {
      f0: null,
      clarity: 0,
      rms: 0,
      voiced: false,
      semitones: null,
      chao: null,
      smoothedChao: 3,
    };
  }
  return {
    f0: 200,
    clarity: 0.95,
    rms: 0.1,
    voiced: true,
    semitones: 0,
    chao,
    smoothedChao: chao,
  };
}

/** Runs a game until an outcome of the wanted kind lands, returning that snapshot. */
function snapshotWithOutcome(
  want: RunSnapshot["lastOutcome"] extends null ? never : string,
  voice: (s: RunSnapshot) => PitchState,
): RunSnapshot | null {
  const run = new Run({ mode: "game", width: W, rand: () => 0 });
  // The renderer ages effects against performance.now(), and in the game the
  // Run is ticked with rAF timestamps, which share that origin. Starting the
  // synthetic clock anywhere else makes every outcome look ancient and the
  // effects silently skip — so the test must honour the same contract.
  let now = performance.now();
  for (let i = 0; i < 2000; i++) {
    const s = run.snapshot();
    run.tickAudio(voice(s), now);
    run.tickFrame(16, now);
    now += 16;
    const out = run.snapshot();
    if (out.lastOutcome?.outcome === want) return out;
  }
  return null;
}

const trackCorridor = (s: RunSnapshot) =>
  pitch(s.activeGate ? s.activeGate.corridorChao : 3);

/**
 * Re-stamp the outcome as having just happened.
 *
 * The simulation advances 16ms per iteration and so races far ahead of the
 * wall clock the renderer ages effects against; without this the outcome sits
 * in the future and every effect is correctly skipped. Effects are time-gated
 * by design, so a test of them has to say *when* "now" is.
 */
function freshen(snap: RunSnapshot): RunSnapshot {
  if (!snap.lastOutcome) return snap;
  return {
    ...snap,
    lastOutcome: { ...snap.lastOutcome, atMs: performance.now() },
  };
}

function drawAndCheck(snap: RunSnapshot): Recorded {
  const { ctx, rec } = fakeCtx();
  expect(() => drawWorld(ctx, W, H, snap)).not.toThrow();
  const bad = rec.numbers.filter((n) => !Number.isFinite(n));
  expect(bad).toEqual([]);
  return rec;
}

describe("drawWorld", () => {
  it("draws an opening frame without throwing or emitting NaN", () => {
    const run = new Run({ mode: "game", width: W, rand: () => 0 });
    const rec = drawAndCheck(run.snapshot());
    expect(rec.calls).toContain("fillRect");
  });

  // Each reaction is asserted *differentially* — the same frame drawn with and
  // without the outcome. Counting raw calls proves nothing: gate rims and the
  // dot's own halo already emit strokes, arcs and gradients, so an assertion
  // like "some stroke happened" passes even when the effect is deleted.
  it("draws a cleared gate's ignition over the flown path", () => {
    const snap = snapshotWithOutcome("perfect", trackCorridor);
    expect(snap).toBeTruthy();
    expect(snap!.lastOutcome!.path.length).toBeGreaterThan(2);

    const withEffect = drawAndCheck(freshen(snap!));
    const without = drawAndCheck({ ...snap!, lastOutcome: null });

    const strokes = (r: Recorded) => r.calls.filter((c) => c === "stroke").length;
    // Three passes: bloom, ribbon, hot core.
    expect(strokes(withEffect) - strokes(without)).toBe(3);
  });

  it("shakes the world and reddens the frame on collision", () => {
    // Sit at the very bottom: any corridor above is a wall to hit.
    const snap = snapshotWithOutcome("collision", () => pitch(1));
    expect(snap).toBeTruthy();

    const withEffect = drawAndCheck(freshen(snap!));
    const without = drawAndCheck({ ...snap!, lastOutcome: null });

    expect(withEffect.calls).toContain("translate");
    expect(without.calls).not.toContain("translate");

    const grads = (r: Recorded) =>
      r.calls.filter((c) => c === "createRadialGradient").length;
    expect(grads(withEffect)).toBeGreaterThan(grads(without));
  });

  it("draws the unheard pulse, and never shakes for it", () => {
    const snap = snapshotWithOutcome("unheard", () => pitch(null));
    expect(snap).toBeTruthy();

    const withEffect = drawAndCheck(freshen(snap!));
    const without = drawAndCheck({ ...snap!, lastOutcome: null });

    const arcs = (r: Recorded) => r.calls.filter((c) => c === "arc").length;
    expect(arcs(withEffect) - arcs(without)).toBe(1);
    // PRD §6: this path must never feel like a punishment.
    expect(withEffect.calls).not.toContain("translate");
  });

  it("survives a snapshot whose outcome carries an empty path", () => {
    // A gate can resolve with no voiced frames at all; the ignition must not
    // assume it has something to draw.
    const snap = snapshotWithOutcome("unheard", () => pitch(null));
    const empty: RunSnapshot = {
      ...snap!,
      lastOutcome: { ...snap!.lastOutcome!, outcome: "perfect", path: [] },
    };
    drawAndCheck(empty);
  });

  it("draws a paused cue frame", () => {
    const run = new Run({
      mode: "game",
      width: W,
      rand: () => 0,
      cueStyle: "pause",
    });
    let now = 0;
    for (let i = 0; i < 400; i++) {
      run.tickAudio(pitch(3), now);
      run.tickFrame(16, now);
      now += 16;
      const s = run.snapshot();
      if (s.cuePaused) {
        drawAndCheck(s);
        return;
      }
    }
    throw new Error("never reached a paused cue");
  });
});

/**
 * The drawn corridor. These are geometry assertions, not looks — but the two
 * defects they pin were both visible on screen: walls that stopped being drawn
 * where the corridor left the canvas, and faceting coarse enough to read as
 * spikes on the widest gates.
 */
describe("corridorEdges", () => {
  const TONES: Tone[] = [1, 2, 3, 4];
  /** Base tolerance in chao for each tone at the shipped 0.12H. */
  const tol = (tone: Tone) => toleranceChao(tone, 0.12);

  it("keeps both edges on the canvas for every tone", () => {
    // Unclamped, the timing-slack flare takes T4's top edge to chao 7.0 (y=-64
    // on a 640px canvas) and its bottom to -0.75 (y=680). The wall polygon
    // inverted there and drew nothing at all.
    for (const tone of TONES) {
      const { top, bottom } = corridorEdges(shapeForTone(tone), tol(tone), 0, 260, H);
      for (const p of [...top, ...bottom]) {
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
      }
    }
  });

  it("samples by width, so facet size stays constant as gates get wider", () => {
    const narrow = corridorEdges(shapeForTone(3), tol(3), 0, 120, H).top.length;
    const wide = corridorEdges(shapeForTone(3), tol(3), 0, 480, H).top.length;
    expect(wide).toBeGreaterThan(narrow * 3);
    // Every sample is a quadratic control point in the drawn path, so this is
    // also a cap on per-frame work.
    expect(corridorEdges(shapeForTone(3), tol(3), 0, 5000, H).top.length).toBeLessThanOrEqual(
      241,
    );
  });

  it("never lets an edge cross the one opposite it", () => {
    // top is centre+tol and bottom is centre-tol, both single-valued in x, so
    // the channel cannot pinch shut or bowtie — which is what would produce a
    // genuinely impossible corridor rather than merely an ugly one.
    for (const tone of TONES) {
      const { top, bottom } = corridorEdges(shapeForTone(tone), tol(tone), 0, 260, H);
      for (let i = 0; i < top.length; i++) {
        expect(top[i].y).toBeLessThanOrEqual(bottom[i].y);
      }
    }
  });

  it("still flares where the corridor moves fastest", () => {
    // The clamp must not have quietly flattened the timing slack: T4's cliff
    // is the widest part of its corridor.
    const { top, bottom } = corridorEdges(shapeForTone(4), tol(4), 0, 260, H);
    const heights = top.map((p, i) => bottom[i].y - p.y);
    const atCliff = heights[Math.round(0.75 * (heights.length - 1))];
    const atPlateau = heights[Math.round(0.2 * (heights.length - 1))];
    expect(atCliff).toBeGreaterThan(atPlateau);
  });
});
