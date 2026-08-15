import { useEffect, useMemo, useRef, useState } from "react";
import { loadInventory } from "../audio/inventory.ts";
import { drawToneAverageChart } from "../ui/toneAverageChart.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";

/**
 * Visualization only, on a throwaway branch — averages each tone's own
 * measured clip polylines (not the T3 citation substitute `shapeForWord`
 * flies in-game) so it shows what was actually recorded.
 *
 * The draw routine itself lives in `src/ui/toneAverageChart.ts`, shared with
 * the landing page's "how it works" cards — one measurement, not two
 * implementations that can drift.
 */

const CARD_W = 320;
const CARD_H = 220;

function ToneCard({ words, tone }: { words: Word[]; tone: Tone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawToneAverageChart(ref.current, words, tone, CARD_W, CARD_H, true);
  }, [words, tone]);

  return (
    <div className="word-card tone-average-card">
      <canvas ref={ref} />
      <span className="param-name">T{tone} — {words.length} clips averaged</span>
    </div>
  );
}

export function ToneAverages() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInventory().then(
      (w) => setWords(w),
      (e: unknown) => setError(e instanceof Error ? e.message : "manifest failed"),
    );
  }, []);

  const byTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of [1, 2, 3, 4] as Tone[]) {
      map.set(t, (words ?? []).filter((w) => w.tone === t));
    }
    return map;
  }, [words]);

  if (error) return <p className="error">{error}</p>;
  if (!words) return <p className="param-help">loading the manifest…</p>;

  return (
    <div className="word-gates">
      {/* Not `.lab-controls`: its `flex: 1 1 320px` is written for the play
          tab's flex-row column, where flex-basis sets a *width*. Here it sits
          in `.word-gates`'s flex-*column*, where the same rule sets a 320px
          *height* floor under one paragraph — the large empty gap under this
          text in the previous layout. */}
      <p className="param-help">
        Each tone's clips, resampled onto a shared t grid and averaged
        point-for-point — the bold line is the mean polyline, the faint
        lines behind it are the individual clips it was built from. Raw
        measured polylines, not `shapeForWord` — T3 here is what she said,
        not the citation stand-in the game flies.
      </p>
      <div className="word-grid tone-average-grid">
        {([1, 2, 3, 4] as Tone[]).map((t) => (
          <ToneCard key={t} words={byTone.get(t) ?? []} tone={t} />
        ))}
      </div>
    </div>
  );
}
