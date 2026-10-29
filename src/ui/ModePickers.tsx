/**
 * The Modes screen's two pickers, Tone Drill's tone choice and Tone Pairs'
 * combo choice. Shared by the game (`ModeSelect.tsx`) and the landing demo
 * (`landing/TryItNow.tsx`), so a visitor picks a tone exactly as a player
 * does. Markup only: the caller decides what is offered and what a pick does.
 */
import type { Tone } from "../game/gates.ts";
import { toneComboKey } from "../game/words.ts";
import { wordCountLabel } from "../game/poolCounts.ts";
import { ShuffleIcon, ToneMarkIcon, type ToneOrNeutral } from "./toneIcons.tsx";

const ALL_TONES: Tone[] = [1, 2, 3, 4];

/** The word-count badge on a mode card or picker tile; null renders nothing. */
export function CountBadge({ n }: { n: number | null }) {
  return n === null ? null : (
    <span className="count-badge" aria-label={wordCountLabel(n)}>
      {n}
    </span>
  );
}

export function DrillTonePicker({
  tones,
  count,
  onPick,
  onBack,
}: {
  /** Tones with words in the pool; the others show disabled. */
  tones: readonly Tone[];
  count: (tone: Tone) => number | null;
  onPick: (tone: Tone) => void;
  onBack?: () => void;
}) {
  return (
    <>
      <p className="note">Which tone do you want to drill?</p>
      <div className="choice">
        {ALL_TONES.map((tone) => (
          <button
            key={tone}
            className="choice-option"
            disabled={!tones.includes(tone)}
            onClick={() => onPick(tone)}
          >
            <ToneMarkIcon tone={tone} className="tone-mark-icon" />
            {tone}
            <CountBadge n={count(tone)} />
          </button>
        ))}
      </div>
      {onBack && (
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
      )}
    </>
  );
}

export function PairComboPicker({
  combos,
  count,
  onPick,
  onBack,
  note,
}: {
  combos: readonly Tone[][];
  count: (combo: Tone[]) => number | null;
  /** A combo, or null for Shuffle. */
  onPick: (combo: Tone[] | null) => void;
  onBack?: () => void;
  /** An extra line under the prompt (the free tier's per-combo cap). */
  note?: string;
}) {
  return (
    <>
      <p className="note">Shuffle across every pair, or drill one combo.</p>
      {note && <p className="note">{note}</p>}
      <div className="tone-pair-selection">
        <div className="pair-combo-grid">
          {combos.map((combo) => (
            <button
              key={toneComboKey(combo)}
              className="pair-combo-tile"
              onClick={() => onPick(combo)}
            >
              {combo.map((tone, i) => (
                <ToneMarkIcon key={i} tone={tone as ToneOrNeutral} className="pair-combo-tone-icon" />
              ))}
              <CountBadge n={count(combo)} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pair-combo-shuffle"
          onClick={() => onPick(null)}
        >
          <ShuffleIcon className="pair-combo-shuffle-icon" />
          Shuffle
        </button>
      </div>
      {onBack && (
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
      )}
    </>
  );
}
