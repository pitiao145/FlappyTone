/**
 * The trail is the product (PRD §8), and the two things that can make it lie
 * are drawn here: joining across a silence the player never filled, and
 * departing from the samples while "fitting a curve".
 */
import { describe, expect, it } from "vitest";
import { chaoToY, drawTrail, traceSmoothPath, type TrailSample } from "./scene.ts";

const W = 420;
const H = 747;
const TRAIL_S = 1;

interface Op {
  op: string;
  args: number[];
}

function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return () => ({ addColorStop: () => {} });
      }
      return (...args: unknown[]) => {
        ops.push({
          op: prop,
          args: args.filter((a): a is number => typeof a === "number"),
        });
      };
    },
    set() {
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as CanvasRenderingContext2D, ops };
}

/** Samples every 23ms (one analysis hop), newest last. */
function trailAt(times: number[], now: number, chao = 3): TrailSample[] {
  return times.map((t) => ({
    chao,
    voiced: true,
    t: now - t,
    x: W * 0.28 - t * 0.22,
    errRatio: null,
  }));
}

describe("drawTrail", () => {
  it("draws one unbroken stroke through continuous phonation", () => {
    const now = 1000;
    const { ctx, ops } = recorder();
    drawTrail(ctx, W, H, trailAt([92, 69, 46, 23, 0], now), TRAIL_S, W * 0.28, now);
    // One moveTo per stroke: continuous voicing is a single stroke.
    expect(ops.filter((o) => o.op === "moveTo").length).toBe(4);
    expect(ops.filter((o) => o.op === "quadraticCurveTo").length).toBeGreaterThan(0);
  });

  it("breaks the ribbon across a silence rather than bridging it", () => {
    // Only voiced frames enter the trail, so a 300ms gap is the player not
    // making a sound. Drawing through it would invent a pitch path.
    const now = 1000;
    const before = recorder();
    drawTrail(before.ctx, W, H, trailAt([69, 46, 23, 0], now), TRAIL_S, W * 0.28, now);

    const after = recorder();
    drawTrail(
      after.ctx,
      W,
      H,
      trailAt([369, 346, 23, 0], now),
      TRAIL_S,
      W * 0.28,
      now,
    );

    const moves = (r: { ops: Op[] }) => r.ops.filter((o) => o.op === "moveTo").length;
    // The gapped trail is drawn as two strokes, so it starts more paths from
    // the same number of samples.
    expect(moves(after)).toBeGreaterThan(0);
    expect(moves(after)).not.toBe(moves(before));
  });

  it("drops samples older than the trail's lifetime", () => {
    const now = 10_000;
    const { ctx, ops } = recorder();
    // Every sample is older than TRAIL_S; nothing should be drawn.
    drawTrail(ctx, W, H, trailAt([5000, 4000, 3000], now), TRAIL_S, W * 0.28, now);
    expect(ops.filter((o) => o.op === "stroke").length).toBe(0);
  });

  it("survives an empty trail", () => {
    const { ctx, ops } = recorder();
    expect(() => drawTrail(ctx, W, H, [], TRAIL_S, W * 0.28, 0)).not.toThrow();
    expect(ops.length).toBe(0);
  });

  it("emits no NaN coordinates", () => {
    const now = 1000;
    const { ctx, ops } = recorder();
    drawTrail(ctx, W, H, trailAt([92, 69, 46, 23, 0], now), TRAIL_S, W * 0.28, now);
    for (const o of ops) {
      for (const a of o.args) expect(Number.isFinite(a)).toBe(true);
    }
  });
});

describe("traceSmoothPath", () => {
  it("stays on the samples it is given", () => {
    // "Fit a curve through recent points; still their data, drawn kindly"
    // (spec B5). The control points must be the samples themselves, so the
    // curve leans toward every measurement instead of averaging them away.
    const pts = [
      { x: 0, y: 100 },
      { x: 10, y: 60 },
      { x: 20, y: 140 },
      { x: 30, y: 90 },
    ];
    const { ctx, ops } = recorder();
    traceSmoothPath(ctx, pts);

    const quads = ops.filter((o) => o.op === "quadraticCurveTo");
    expect(quads.length).toBeGreaterThan(0);
    // Every control point (first pair of each quadratic) is an actual sample.
    for (const q of quads) {
      const cx = q.args[0];
      const cy = q.args[1];
      expect(pts.some((p) => p.x === cx && p.y === cy)).toBe(true);
    }
  });

  it("handles one point and none at all", () => {
    const single = recorder();
    expect(() => traceSmoothPath(single.ctx, [{ x: 1, y: 2 }])).not.toThrow();
    expect(single.ops.map((o) => o.op)).toEqual(["beginPath", "moveTo"]);

    const none = recorder();
    traceSmoothPath(none.ctx, []);
    expect(none.ops.length).toBe(0);
  });
});

describe("chaoToY", () => {
  // PRD §5.1 — the mapping the whole game is drawn against.
  it("puts chao 5 at 0.20H and chao 1 at 0.80H", () => {
    expect(chaoToY(5, 1000)).toBeCloseTo(200, 6);
    expect(chaoToY(3, 1000)).toBeCloseTo(500, 6);
    expect(chaoToY(1, 1000)).toBeCloseTo(800, 6);
  });
});
