/**
 * Differential assertions: each frame is drawn with and without the element
 * under test, and the delta in draw calls is the assertion. Asserting on an
 * absolute count would pass with the element deleted, because the grid and the
 * dot already emit strokes and arcs of their own.
 */
import { describe, expect, it } from "vitest";
import type { Contour } from "../game/contours.ts";
import { drawVisualiser, type VisualiserScene } from "./visualiser.ts";

const W = 420;
const H = 747;

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

function draw(scene: Partial<VisualiserScene>): Op[] {
  const { ctx, ops } = recorder();
  drawVisualiser(ctx, W, H, {
    tone: null,
    live: null,
    finished: [],
    spanMs: 1500,
    chao: 3,
    voiced: false,
    ...scene,
  });
  return ops;
}

const count = (ops: Op[], op: string) => ops.filter((o) => o.op === op).length;

/** A contour sampled every 20ms, rising from chao 2 to 4. */
function contour(fromMs: number, toMs: number, gapAt?: number): Contour {
  const points = [];
  for (let t = fromMs; t < toMs; t += 20) {
    if (gapAt !== undefined && t > gapAt && t < gapAt + 300) continue;
    points.push({ tMs: t, chao: 2 + (t / toMs) * 2 });
  }
  return { points, startedAtMs: 0, endedAtMs: null };
}

describe("drawVisualiser", () => {
  it("draws the target contour before the player has said anything", () => {
    const bare = draw({});
    const withTarget = draw({ tone: 2 });
    expect(count(withTarget, "lineTo")).toBeGreaterThan(count(bare, "lineTo"));
    expect(count(withTarget, "stroke")).toBeGreaterThan(count(bare, "stroke"));
  });

  it("draws the live contour over and above the target", () => {
    const targetOnly = draw({ tone: 2 });
    const withLive = draw({ tone: 2, live: contour(0, 400) });
    expect(count(withLive, "lineTo")).toBeGreaterThan(count(targetOnly, "lineTo"));
  });

  it("each finished attempt adds strokes of its own", () => {
    const one = draw({ finished: [contour(0, 400)] });
    const two = draw({ finished: [contour(0, 400), contour(0, 400)] });
    expect(count(two, "stroke")).toBe(count(one, "stroke") + 1);
  });

  it("breaks the line across a gap rather than inventing pitch through it", () => {
    const unbroken = draw({ live: contour(0, 900) });
    const gapped = draw({ live: contour(0, 900, 300) });
    // A break is one extra moveTo — the pen lifts instead of drawing a path
    // the player never produced.
    expect(count(gapped, "moveTo")).toBe(count(unbroken, "moveTo") + 1);
  });

  it("maps time to x — a later point sits further right", () => {
    const early = draw({ live: contour(0, 200) });
    const late = draw({ live: contour(0, 1400) });
    const lastX = (ops: Op[]) => {
      const tos = ops.filter((o) => o.op === "lineTo");
      return tos[tos.length - 1].args[0];
    };
    expect(lastX(late)).toBeGreaterThan(lastX(early));
  });

  it("clamps a contour longer than the span to the panel", () => {
    const ops = draw({ live: contour(0, 6000), spanMs: 1500 });
    const xs = ops.filter((o) => o.op === "lineTo").map((o) => o.args[0]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(W);
  });

  it("a single-point contour draws nothing — one frame is not a shape", () => {
    const none = draw({});
    const one = draw({
      live: { points: [{ tMs: 0, chao: 3 }], startedAtMs: 0, endedAtMs: null },
    });
    expect(count(one, "stroke")).toBe(count(none, "stroke"));
  });
});
