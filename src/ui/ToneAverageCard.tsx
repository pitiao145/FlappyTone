import { useEffect, useRef } from "react";
import { drawToneAverageChart } from "./toneAverageChart.ts";
import { TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";

const CARD_W = 200;
const CARD_H = 120;

/**
 * The landing page's "how it works" answer to "the corridor is the tone
 * mark, and here's proof": the same averaged-clip chart the Lab uses to
 * sanity-check the corridors, not a redrawn or simplified stand-in.
 */
export function ToneAverageCard({ words, tone }: { words: Word[]; tone: Tone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawToneAverageChart(ref.current, words, tone, CARD_W, CARD_H);
  }, [words, tone]);

  const info = TONE_INFO[tone];

  return (
    <figure className="tone-average-card">
      <canvas
        ref={ref}
        style={{ width: CARD_W, height: CARD_H }}
        role="img"
        aria-label={`Measured pitch contour for tone ${tone}: ${info.cue}.`}
      />
      <figcaption>
        <span className="syllable">{info.pinyin}</span>
        <span className="hanzi">{info.hanzi}</span>
        <span className="cue">
          ({tone}) {info.cue}
        </span>
      </figcaption>
    </figure>
  );
}
