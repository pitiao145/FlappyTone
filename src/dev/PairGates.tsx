import { useEffect, useMemo, useRef, useState } from "react";
import type { CorridorWidth } from "../game/gates.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import {
  toneComboKey,
  wordInStyle,
  type SpeechStyle,
  type Word,
} from "../game/words.ts";
import { GateStage } from "./GateStage.tsx";
import { bandFor, drawWord, type Band } from "./WordGates.tsx";

const STYLES: SpeechStyle[] = ["textbook", "natural"];

interface Pick {
  id: string;
  style: SpeechStyle;
}

interface Props {
  /** Every multi-syllable word, as the catalog holds it (both takes attached). */
  pairs: Word[];
  settings: CalibrationSettings;
  corridorWidth: CorridorWidth;
}

/**
 * Every two-syllable gate in the catalog, grouped by tone combo, one column per
 * speech style. Each cell is the corridor the game would fly for that
 * recording (`wordInStyle` re-points the word at one take, then the game's own
 * corridor functions draw it), so a missing natural take shows as a gap rather
 * than silently reusing the textbook one. Pick a cell to fly it on the right.
 */
export function PairGates({ pairs, settings, corridorWidth }: Props) {
  const [combo, setCombo] = useState<string>("all");
  const [pick, setPick] = useState<Pick | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Word[]>();
    for (const w of pairs) {
      const key = toneComboKey(w.tones);
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pairs]);

  const tolH = tuning().baseToleranceH;
  const band = useMemo(() => {
    const takes: Word[] = [];
    for (const w of pairs) {
      for (const style of STYLES) {
        const t = wordInStyle(w, style);
        if (t) takes.push(t);
      }
    }
    return bandFor(takes, tolH);
  }, [pairs, tolH]);

  const selected = useMemo(() => {
    if (!pick) return null;
    const w = pairs.find((p) => p.id === pick.id);
    return w ? wordInStyle(w, pick.style) : null;
  }, [pick, pairs]);

  if (pairs.length === 0) {
    return (
      <p className="lab-empty">
        No pair gates yet. Publish a two-syllable word in the booth, or run
        `npm run tonepairs:fixtures` to build the dev fixtures.
      </p>
    );
  }

  const shown = combo === "all" ? groups : groups.filter(([k]) => k === combo);
  const counts = {
    textbook: pairs.filter((w) => wordInStyle(w, "textbook")).length,
    natural: pairs.filter((w) => wordInStyle(w, "natural")).length,
  };

  return (
    <div className="lab-grid lab-grid-pairs">
      <section className="lab-pane pair-gallery" aria-label="Pair gates by tone combo">
        <div className="pane-head">
          <h3>Pair gates</h3>
          <p className="param-help">
            {pairs.length} words · {counts.textbook} textbook takes ·{" "}
            {counts.natural} natural takes
          </p>
          <div className="chips" role="group" aria-label="Tone combo">
            {["all", ...groups.map(([k]) => k)].map((k) => (
              <button
                key={k}
                className={k === combo ? "chip active" : "chip"}
                aria-pressed={k === combo}
                onClick={() => setCombo(k)}
              >
                {k === "all" ? "All" : k.replace("-", " + ")}
              </button>
            ))}
          </div>
        </div>

        <div className="pair-scroll">
          {shown.map(([key, words]) => (
            <div key={key} className="pair-combo">
              <h4>
                Tone {key.replace("-", " + ")}
                <span className="param-help"> {words.length} words</span>
              </h4>
              <div className="pair-cols pair-cols-head" aria-hidden="true">
                <span className="param-help">Textbook</span>
                <span className="param-help">Natural</span>
              </div>
              {words.map((w) => (
                <div key={w.id} className="pair-row">
                  <p className="pair-word">
                    <span className="pair-hanzi">{w.hanzi}</span> {w.pinyin}
                  </p>
                  <div className="pair-cols">
                    {STYLES.map((style) => {
                      const take = wordInStyle(w, style);
                      const active = pick?.id === w.id && pick.style === style;
                      return take ? (
                        <PairCell
                          key={style}
                          take={take}
                          tolH={tolH}
                          band={band}
                          active={active}
                          label={`${w.pinyin} ${style}`}
                          onPick={() => setPick({ id: w.id, style })}
                        />
                      ) : (
                        <div key={style} className="pair-cell missing">
                          <span className="param-help">No {style} take</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="lab-pane lab-pane-stage" aria-label="Selected gate">
        {selected && pick ? (
          <>
            <div className="pane-head">
              <h3>
                <span className="pair-hanzi">{selected.hanzi}</span> {selected.pinyin}
              </h3>
              <p className="param-help">
                Tone {selected.tones.join(" + ")} · {pick.style} take ·{" "}
                {selected.durationS.toFixed(2)}s
              </p>
            </div>
            <GateStage word={selected} settings={settings} corridorWidth={corridorWidth} />
          </>
        ) : (
          <p className="lab-empty">Pick a gate on the left to preview it and fly it.</p>
        )}
      </section>
    </div>
  );
}

function PairCell({
  take,
  tolH,
  band,
  active,
  label,
  onPick,
}: {
  take: Word;
  tolH: number;
  band: Band;
  active: boolean;
  label: string;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawWord(ref.current, take, tolH, band);
  }, [take, tolH, band]);
  return (
    <button
      className={active ? "pair-cell active" : "pair-cell"}
      aria-pressed={active}
      aria-label={`Select ${label}`}
      onClick={onPick}
    >
      <canvas ref={ref} />
      <span className="param-help">
        tone {take.durationS.toFixed(2)}s · clip {take.clipS.toFixed(2)}s
      </span>
    </button>
  );
}
