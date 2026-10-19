import type { Word } from "../game/words.ts";
import { TONE_LINE_COLOR } from "./toneColors.ts";

/**
 * What a guest sees after "Practise this exact word" on a /say/* page: the
 * visualiser's board, locked, with one card asking for a free account. It
 * replaces the tap gate and the volume screen for that path, since a guest
 * cannot practise the word anyway. Opens no mic (no gesture is needed).
 */
export function LockedWordView({
  word,
  width,
  height,
  onCreateAccount,
  onTryAnyway,
}: {
  word: Word | null;
  width: number;
  height: number;
  onCreateAccount: () => void;
  onTryAnyway: () => void;
}) {
  return (
    <div
      className="screen stage game-stage locked-word-view"
      style={{ width, height }}
    >
      <div className="locked-word-board" aria-hidden="true">
        {[5, 4, 3, 2, 1].map((c) => (
          <span key={c} className="locked-word-line">
            <span>{c}</span>
          </span>
        ))}
      </div>
      <div
        className="locked-word-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locked-word-title"
      >
        {word && (
          <p className="locked-word-hanzi" lang="zh-Hant-TW">
            {word.hanzi}
            <span
              className="locked-word-pinyin"
              style={{ color: TONE_LINE_COLOR[word.tone] }}
            >
              {word.pinyin}
            </span>
          </p>
        )}
        <h2 id="locked-word-title">
          {word ? "Practise this word with your voice" : "Practise real words with your voice"}
        </h2>
        <p>
          Hear our native speaker say it, say it back, and see your pitch drawn
          over hers. Real words are free with an account.
        </p>
        <button type="button" className="locked-word-cta" onClick={onCreateAccount}>
          Create free account
        </button>
        <button type="button" className="locked-word-skip" onClick={onTryAnyway}>
          Try the visualiser without an account
        </button>
      </div>
    </div>
  );
}
