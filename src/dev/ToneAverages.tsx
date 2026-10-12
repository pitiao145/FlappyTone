import { useEffect, useMemo, useRef } from "react";
import { drawToneAverageChart } from "../ui/toneAverageChart.ts";
import { spokenTones } from "../game/sandhi.ts";
import { isSingle, multiWords, toneComboKey } from "../game/words.ts";
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

/**
 * A tone combo (e.g. `[3, 2]`) has no single `Tone` to key
 * `TONE_AVERAGE_COLOR` off, so each combo gets a color cycled deterministically
 * from its position in `availableToneCombos`' sorted order — stable across
 * reloads (same inventory, same order) without hand-picking a palette entry
 * per combo as the pairs list grows.
 */
function comboColor(index: number): string {
  const hue = (index * 47) % 360; // 47: coprime-ish step, spreads adjacent combos apart
  return `hsla(${hue}, 55%, 40%,`;
}

function PairCard({ words, tones, color }: { words: Word[]; tones: Tone[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawToneAverageChart(ref.current, words, tones[0], CARD_W, CARD_H, true, color);
  }, [words, tones, color]);

  return (
    <div className="word-card tone-average-card">
      <canvas ref={ref} />
      <span className="param-name">
        T{toneComboKey(tones)} — {words.length} clips averaged
      </span>
    </div>
  );
}

/** `words` arrives already re-pointed at the Lab's chosen speech style. */
export function ToneAverages({ words }: { words: Word[] }) {

  const byTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of [1, 2, 3, 4] as Tone[]) {
      // By SPOKEN tone, like make-tone-averages: natural 和 (hàn) is a T4 here.
      map.set(t, words.filter((w) => isSingle(w) && spokenTones(w)[0] === t));
    }
    return map;
  }, [words]);

  // Grouped by SPOKEN combo, the same rule make-tone-averages bakes with:
  // 一下 (said yí xià) is a 2-4, 你好 a 2-3 — an average only means something
  // over clips that were said the same way. Neutral combos have no average.
  const byCombo = useMemo(() => {
    const map = new Map<string, Word[]>();
    for (const w of multiWords(words)) {
      const spoken = spokenTones(w);
      if (spoken.includes(0 as Tone)) continue;
      const key = toneComboKey(spoken);
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return map;
  }, [words]);
  const combos = useMemo(
    () => [...byCombo.keys()].sort().map((k) => k.split("-").map(Number) as Tone[]),
    [byCombo],
  );

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

      {combos.length > 0 && (
        <>
          <p className="param-help">
            Tone pairs, same measurement, grouped by how each word is SPOKEN
            (一下 under 2-4, 你好 under 2-3) — each combo's own two-syllable clips
            averaged as one shape-agnostic contour (sandhi means a pair's
            realised shape isn't its two citation tones back to back, so this
            is not, and shouldn't look like, two single-tone cards stitched
            together).
          </p>
          <div className="word-grid tone-average-grid">
            {combos.map((combo, i) => (
              <PairCard
                key={toneComboKey(combo)}
                words={byCombo.get(toneComboKey(combo)) ?? []}
                tones={combo}
                color={comboColor(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
