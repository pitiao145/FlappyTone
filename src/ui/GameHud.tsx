/**
 * The in-game HUD overlay: score, hearts, combo, the word being asked for,
 * the listen / your-turn banner and the outcome toasts.
 *
 * Pure props in, markup out — `Game.tsx` feeds it the polled snapshot and the
 * latest resolved gate; the dev demo-video renderer (`src/dev/demoVideo/`)
 * feeds it a scripted run, so a marketing clip shows the real HUD, not a copy.
 */

import type { RunMode, RunSnapshot } from "../game/run.ts";
import { TONE_INFO, type Tone } from "../game/gates.ts";
import type { GateOutcome, UnheardHint } from "../game/scoring.ts";
import type { ClassifiedTone } from "../game/toneClassifier.ts";
import { sandhiTones } from "../game/sandhi.ts";
import { TONE_LINE_COLOR } from "./toneColors.ts";
import { ToneClueSpeakerIcon, ToneMarkIcon } from "./toneMarkIcons.tsx";
import { HeartIcon, PauseIcon } from "./icons.tsx";

/** "Your turn" flashes while the active gate is in its first stretch. */
const YOUR_TURN_MAX_T = 0.5;

/** What the HUD reacts to when a gate resolves. */
export interface OutcomeFlash {
  outcome: GateOutcome;
  points: number;
  hint: UnheardHint | null;
  /** The gate's own target tone — needed to phrase "not a T{tone}" on a confident mismatch. */
  tone: Tone;
  /** Set when this collision was forced by a drastic classifier mismatch, not a wall. */
  mismatchedAs: ClassifiedTone | null;
  /** The classifier's confidence in `mismatchedAs` — picks the mismatch toast's wording. */
  mismatchedConfidence: number | null;
  /** The classifier's read of this gate, correct or not — praises a confident correct one. */
  classifiedTone: ClassifiedTone | null;
  /** The classifier's confidence in `classifiedTone`. */
  classifiedConfidence: number | null;
  /** Resolve time, used as a React key so repeats re-trigger the animation. */
  atMs: number;
}

/**
 * The confidence bar both classifier-driven toasts key off: below it, the
 * mismatch toast hedges ("that sounded more like a T3") and a correct read
 * says nothing; at or above it, the mismatch toast states the read plainly
 * ("that was a T3, not a T2") and a correct read gets praised ("nice T1!").
 * Matches the confidence bar the player asked for when this shipped
 * (25 Aug 2026): "if a player does a tone 100% accurately... let's say 90+%
 * confidence." Same cutoff `toneClassifierBoostMinConfidence` defaults to,
 * so "confident enough to say something" means the same thing everywhere;
 * kept as its own literal rather than importing the tuning default so
 * retuning the score boost in the Lab doesn't silently reword these toasts
 * too.
 */
const HIGH_CLASSIFIER_CONFIDENCE = 0.9;

/**
 * The hint shown when a gate goes unheard.
 *
 * PRD §6: this is the path where the app says it is unsure rather than scoring
 * the player wrong, and it must never read as a punishment. Saying *what* was
 * unclear turns the one moment of doubt into the one moment that teaches.
 */
const HINT_TEXT: Record<UnheardHint, string> = {
  louder: "say it a bit louder",
  longer: "hold it a little longer",
  generic: "didn't catch that",
};

interface Props {
  hud: RunSnapshot | null;
  flash: OutcomeFlash | null;
  mode: RunMode;
  /** Whether this mode keeps score — shows hearts and combo. */
  scored: boolean;
  showTranslation: boolean;
  showPinyin: boolean;
  showToneMarks: boolean;
  /** The pause button, hidden while a card or menu is up. */
  showPause: boolean;
  onPause: () => void;
}

export function GameHud({
  hud,
  flash,
  mode,
  scored,
  showTranslation,
  showPinyin,
  showToneMarks,
  showPause,
  onPause,
}: Props) {
  // Show the *active* gate's tone while flying it — showing the next gate's
  // tone mid-gate would teach the wrong contour (this matters most in the
  // tutorial, where the cue text is the lesson).
  const displayTone = hud?.activeGate?.tone ?? hud?.upcoming?.tone ?? null;
  // Every syllable's tone, for a multi-syllable gate's label — falls back to
  // the single displayTone so a bare-tone gate (no `tones` on its view) still
  // renders. `TONE_INFO`/the tutorial cue below stay keyed on the single
  // `displayTone`, since neither the classifier nor per-tone cue text is
  // multi-syllable aware (see run.ts's `finishGate`).
  const displayTones =
    hud?.activeGate?.tones ??
    hud?.upcoming?.tones ??
    (displayTone !== null ? [displayTone] : []);
  // The word being flown, when there is one. Its own pinyin and hanzi — the
  // tone's stand-in `ma` is only what a gate without a clip can say.
  const displayWord = hud?.activeGate?.word ?? hud?.upcoming?.word ?? null;
  const info = displayTone === null ? null : TONE_INFO[displayTone];

  // Listen → Your turn: "listen" spans only the frozen demo + hold
  // (`cuePaused`), not the whole cue phase. Once the world unfreezes the
  // player is meant to be answering already — during `cueApproachMs` of
  // travel toward the gate — so "your turn" starts there, not at gate entry.
  // It then carries through the active gate's first stretch before clearing.
  const banner =
    hud?.phase === "listen"
      ? hud.cuePaused
        ? ("listen" as const)
        : ("your-turn" as const)
      : hud?.phase === "active" &&
          (hud.activeGate?.t ?? 1) < YOUR_TURN_MAX_T
        ? ("your-turn" as const)
        : null;

  const showPoints = flash !== null && flash.points > 0;
  const showHint = flash?.outcome === "unheard";
  const showMismatch =
    flash?.outcome === "collision" &&
    flash.mismatchedAs !== null &&
    flash.mismatchedAs !== "none";
  // A confident, correct read gets praised — but only on an outcome that
  // isn't already unheard/collision (LastOutcome already nulls
  // classifiedTone on collision) and isn't itself the mismatch case above.
  const showPraise =
    flash !== null &&
    !showMismatch &&
    flash.outcome !== "unheard" &&
    flash.classifiedTone === flash.tone &&
    (flash.classifiedConfidence ?? 0) >= HIGH_CLASSIFIER_CONFIDENCE;
  const breaking = flash?.outcome === "collision";
  const hearts = Math.max(0, hud?.hearts ?? 3);
  // Matches newRunStats()'s default in src/game/scoring.ts — a run starts
  // with 3 hearts, so 3 slots are always shown, lost ones as outlines.
  const MAX_HEARTS = 3;

  return (
      <div className="hud">
        <div className="hud-top">
          <span className="score">
            {hud?.score ?? 0}
            {showPoints && (
              <span key={flash!.atMs} className="points-pop">
                +{flash!.points}
              </span>
            )}
          </span>
          {scored && (
            <span className="hearts">
              {Array.from({ length: MAX_HEARTS }, (_, i) => (
                <span key={i} className="heart">
                  <HeartIcon filled={i < hearts} />
                </span>
              ))}
              {/* The heart just lost, shown mid-break then gone. Without it
                  a collision simply removed a glyph, which read as nothing. */}
              {breaking && (
                <span key={flash!.atMs} className="heart breaking">
                  <HeartIcon filled />
                </span>
              )}
            </span>
          )}
          {scored && (hud?.comboMult ?? 1) > 1 && (
            <span className="combo">×{hud?.comboMult}</span>
          )}
          {/* In the row rather than absolutely positioned over it: floated
              top-right it sat on top of the hearts, which are also
              right-aligned. */}
          {showPause && (
            <div className="hud-controls">
              <button
                className="hud-button"
                onClick={onPause}
                title="Pause"
                aria-label="Pause"
              >
                <PauseIcon />
              </button>
            </div>
          )}
        </div>

        {/* Learn mode is tone-shape recognition only — the word behind a
            gate is incidental (it only supplies the corridor's contour),
            so showing its hanzi/pinyin would cue pronunciation the mode is
            explicitly not asking for. Only the gate itself is shown. */}
        {mode !== "learn" && info && displayTone !== null && (() => {
          const showEnglishCol = showTranslation && !!displayWord?.english;
          // Pinyin+hanzi always share one column even when pinyin is
          // hidden — hanzi has no independent toggle (see settings.ts).
          const columns = [
            showEnglishCol && (
              <div key="english" className="hud-syllable-col hud-syllable-col-translation">
                {displayWord!.english}
              </div>
            ),
            <div key="word" className="hud-syllable-col hud-syllable-col-word">
              {showPinyin && (
                <span className="syllable">{displayWord?.pinyin ?? info.pinyin}</span>
              )}
              <span className="hanzi">{displayWord?.hanzi ?? info.hanzi}</span>
            </div>,
            // Sandhi-adjusted tone clue — what to actually say, not the
            // citation tone pinyin already shows. See src/game/sandhi.ts;
            // the speaker icon marks this as a pronunciation cue, not a
            // restatement of the word.
            showToneMarks && (
              <div key="tone" className="hud-syllable-col hud-syllable-col-tone">
                <span className="tone-marks-speaker">
                  <ToneClueSpeakerIcon />
                </span>
                <span className="tone-marks-row">
                  {/* A recording's own spoken tones (natural 和 = hàn) win over the rules. */}
                  {(displayWord?.spokenTones ?? sandhiTones({
                    tones: displayWord?.tones ?? displayTones,
                    pinyin: displayWord?.pinyin ?? info.pinyin,
                    hanzi: displayWord?.hanzi ?? info.hanzi,
                  })).map((t, i) => (
                    <span
                      key={i}
                      className="tone-mark-glyph"
                      style={{ color: TONE_LINE_COLOR[t === "half3" ? 3 : t] }}
                    >
                      <ToneMarkIcon tone={t} />
                    </span>
                  ))}
                </span>
              </div>
            ),
          ].filter(Boolean);
          return <div className="hud-syllable">{columns}</div>;
        })()}

        {/* Tutorial-only cue text ("say it flat and high") — the
            lesson copy that teaches each tone shape. Outside the tutorial
            the player is meant to answer the demo clip, not read a script,
            so this stays out of game/practice mode. */}
        {mode === "tutorial" && info && displayTone !== null && (
          <div className="hud-status">
            {info.cue}
          </div>
        )}

        {/* Single group pinned to the bottom of the flex `.hud` column via
            one margin-top: auto on the wrapper. Each child used to carry
            its own auto margin, which meant two present at once (the
            banner and the toast) split the leftover space between
            them instead of stacking together at the bottom. */}
        <div className="hud-bottom">
          {banner === "listen" && (
            <div className="phase-banner listen">🔊 listen…</div>
          )}
          {banner === "your-turn" && (
            <div className="phase-banner your-turn">
              your turn!
              {/* Decorative only: a CSS-only pulse, not a real mic-level
                  meter. It never reads RMS/frame data — see CLAUDE.md's
                  src/pitch and src/audio boundary. */}
              <span className="listening-bars" aria-hidden="true">
                <span className="listening-bar" />
                <span className="listening-bar" />
                <span className="listening-bar" />
                <span className="listening-bar" />
              </span>
            </div>
          )}

          {showHint && (
            <div key={flash!.atMs} className="toast unheard-toast">
              {HINT_TEXT[flash!.hint ?? "generic"]}
            </div>
          )}
          {showMismatch && (
            <div key={flash!.atMs} className="toast mismatch-toast">
              {(flash!.mismatchedConfidence ?? 0) >= HIGH_CLASSIFIER_CONFIDENCE
                ? `that was a T${flash!.mismatchedAs}, not a T${flash!.tone}`
                : `that sounded more like a T${flash!.mismatchedAs}`}
            </div>
          )}
          {showPraise && (
            <div key={flash!.atMs} className="toast praise-toast">
              nice T{flash!.classifiedTone}!
            </div>
          )}
          {hud?.noisy && <div className="hint">it's noisy in here</div>}
        </div>
      </div>
  );
}
