import { useEffect, useRef } from "react";
import { useTier } from "../data/tier.ts";
import { effectiveSpeechStyle } from "../game/settings.ts";
import type { Tone } from "../game/gates.ts";
import { MIN_ATTEMPTS_TO_SHOW } from "../game/playerShape.ts";
import { capFirst, keyName } from "../game/comeBack.ts";
import { averagedShapes } from "../game/toneAccuracy.ts";
import { SAMPLE_TONE_SHAPES } from "./sampleToneShapes.ts";
import { drawPlayerShapeChart, TONE_AVERAGE_COLOR } from "./toneAverageChart.ts";

const CARD_W = 200;
const CARD_H = 120;
/** A combo has no single tone to key a color off. */
const COMBO_TINT = "hsla(210, 35%, 38%,";

/**
 * Sample tone-shape cards on a real player's snapshot: the blurred chart in
 * the end-of-run tone-compare teaser (brief 55). The Pro view with a month
 * picker that used to live here is replaced by `ToneCompare.tsx` (weeks only).
 */
/** The same cards on a real player's snapshot, for guests and free players (no earlier point to compare). */
export function SamplePlayerToneEvolution() {
  return (
    <>
      <p className="note player-shape-legend">
        Sample from a real player: <span className="player-shape-key player-shape-key-jane" /> Jane&apos;s average ·{" "}
        <span className="player-shape-key player-shape-key-now" /> theirs (tone colour)
      </p>
      <div className="tone-average-grid">
        {Object.entries(SAMPLE_TONE_SHAPES).map(([key, now]) => (
          <ShapeCard key={key} shapeKey={key} now={now} then={null} thenDay={null} />
        ))}
      </div>
    </>
  );
}

function ShapeCard({
  shapeKey,
  now,
  then,
  thenDay,
}: {
  shapeKey: string;
  now: { line: number[]; count: number };
  then: { line: number[]; count: number } | null;
  thenDay: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const single = !shapeKey.includes("-");
  // Jane's average for the player's current effective style (spec decision 6).
  const style = effectiveSpeechStyle(useTier());
  const avg = averagedShapes();
  const jane = single ? avg.tone[style][Number(shapeKey) as Tone] : (avg.pair[style][shapeKey] ?? null);
  const tint = single ? TONE_AVERAGE_COLOR[Number(shapeKey) as Tone] : COMBO_TINT;
  const label = capFirst(keyName(shapeKey));

  useEffect(() => {
    if (ref.current) {
      const earlier = then && then.count >= MIN_ATTEMPTS_TO_SHOW ? then.line : null;
      drawPlayerShapeChart(ref.current, { jane, now: now.line, then: earlier }, tint, CARD_W, CARD_H);
    }
  }, [jane, now, then, tint]);

  return (
    <figure className="tone-average-card player-shape-card">
      <canvas
        ref={ref}
        style={{ width: CARD_W, height: CARD_H }}
        role="img"
        aria-label={`${label}: your average pitch shape drawn over Jane's.`}
      />
      <figcaption>
        <span className="syllable">{label}</span>
        <span className="cue">
          based on {now.count} attempts
          {thenDay && then && (then.count >= MIN_ATTEMPTS_TO_SHOW
            ? ` · ${then.count} by ${thenDay}`
            : ` · too few by ${thenDay} (${then.count})`)}
        </span>
      </figcaption>
    </figure>
  );
}
