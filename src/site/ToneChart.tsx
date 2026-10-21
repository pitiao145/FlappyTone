import { AVERAGED_TONE_SHAPE } from "../game/toneAverages.ts";
import type { Tone } from "../game/gates.ts";
import { toneName } from "./toneNames.ts";
import { TONE_LINE_COLOR } from "../ui/toneColors.ts";

const W = 320;
const H = 190;
const LEFT = 26;
const RIGHT = 10;
const TOP = 10;
const BOTTOM = 22;
const TONES: Tone[] = [1, 2, 3, 4];

function y(chao: number): number {
  return TOP + ((5 - chao) / 4) * (H - TOP - BOTTOM);
}

/**
 * The four tones on one chao 1–5 chart, drawn from the same measured
 * averages tone accuracy uses (`AVERAGED_TONE_SHAPE.textbook`: Jane's
 * recorded words, time-normalised). SVG rather than the landing page's canvas
 * card, so the chart is in the prerendered HTML, not painted after load.
 */
export function ToneChart() {
  const shapes = AVERAGED_TONE_SHAPE.textbook;
  return (
    <figure className="site-tone-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Pitch over time for the four Mandarin tones, on a 1 to 5 scale: first tone stays high and level, second tone rises, third tone dips low, fourth tone falls from high to low."
      >
        {[1, 2, 3, 4, 5].map((c) => (
          <g key={c}>
            <line
              className="grid"
              x1={LEFT}
              x2={W - RIGHT}
              y1={y(c)}
              y2={y(c)}
            />
            <text className="axis" x={LEFT - 8} y={y(c) + 4} textAnchor="end">
              {c}
            </text>
          </g>
        ))}
        <text
          className="axis"
          x={(LEFT + W - RIGHT) / 2}
          y={H - 4}
          textAnchor="middle"
        >
          time →
        </text>
        {TONES.map((t) => {
          const pts = shapes[t];
          const points = pts
            .map((c, i) => {
              const x = LEFT + (i / (pts.length - 1)) * (W - LEFT - RIGHT);
              return `${x.toFixed(1)},${y(c).toFixed(1)}`;
            })
            .join(" ");
          return (
            <polyline
              key={t}
              points={points}
              fill="none"
              stroke={TONE_LINE_COLOR[t]}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <figcaption>
        {TONES.map((t) => (
          <span
            key={t}
            className="legend"
            style={{ color: TONE_LINE_COLOR[t] }}
          >
            ● {toneName(t, true)}
          </span>
        ))}
        <span className="note">
          Averaged from a native Taiwan Mandarin speaker's recordings. 5 = top
          of her range, 1 = bottom.
        </span>
      </figcaption>
    </figure>
  );
}
