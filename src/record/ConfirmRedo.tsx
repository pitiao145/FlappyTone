/**
 * The guard in front of re-recording a word that is already live in the game.
 *
 * Shared by the overview and the recording screen so both paths to a redo ask
 * the same question in the same words — the booth having two ways to reach a
 * word, only one of which was guarded, is what let a published take be
 * replaced by accident (see `boothArming.ts`).
 */
import type { BoothWord } from "./boothWords.ts";

interface Props {
  word: BoothWord;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmRedo({ word, onConfirm, onCancel }: Props) {
  return (
    <div className="rec-confirm" role="dialog" aria-modal="true">
      <div className="rec-confirm-card">
        <p className="rec-confirm-word">
          {word.hanzi} <span className="rec-pinyin">{word.pinyin}</span>
        </p>
        <p className="rec-sub">
          This one is already live in the game. Recording it again replaces the clip players hear
          now.
        </p>
        <button className="rec-btn rec-btn-primary" onClick={onConfirm}>
          Record it again
        </button>
        <button className="rec-btn" onClick={onCancel}>
          Leave it alone
        </button>
      </div>
    </div>
  );
}
