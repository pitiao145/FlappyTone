import { corridorChaoAt, shapeForTone } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";

/** Samples used by the inline contour sparklines. */
const SPARK_STEPS = 24;
const SPARK_W = 56;
const SPARK_H = 26;

/**
 * The tone's shape, drawn from the same polyline the corridor is drawn from.
 *
 * A written cue ("dip low, then rise") describes a shape; this *is* the shape,
 * and it is the shape the player will be asked to fly. Reading them side by
 * side is most of what the How-to screen is for, and it is what makes the
 * landing page's claim ("the corridor is the tone mark") checkable at a glance.
 *
 * Stroked in `currentColor` so the caller sets the colour from the tokens.
 */
export function ContourSpark({
  tone,
  width = SPARK_W,
  height = SPARK_H,
}: {
  tone: Tone;
  width?: number;
  height?: number;
}) {
  const points = Array.from({ length: SPARK_STEPS + 1 }, (_, i) => {
    const t = i / SPARK_STEPS;
    const chao = corridorChaoAt(shapeForTone(tone), t);
    const x = 2 + t * (width - 4);
    // chao 1 at the bottom, 5 at the top.
    const y = height - 3 - ((chao - 1) / 4) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg
      className="contour-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
