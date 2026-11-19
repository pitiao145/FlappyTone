import type { VoicePreset } from "../game/voiceStart.ts";

interface Props {
  /** The tap: saves the choice and continues to the run (the mic opens behind the next gate). */
  onChoose: (p: VoicePreset) => void;
  onBack: () => void;
}

/**
 * Brief 50 quick start: one small screen before a new player's first run.
 * No calibration: the game starts from this voice and fits itself to the
 * player while they play. Skipped when the landing demo already saved a choice.
 */
export function VoiceChoice({ onChoose, onBack }: Props) {
  return (
    <div className="screen voice-choice">
      <h2>Which voice is closer to yours?</h2>
      <p className="note big">
        The bird starts from this, then learns your voice while you play.
      </p>
      <div className="voice-choice-buttons">
        <button className="primary" onClick={() => onChoose("lower")}>
          Lower voice
        </button>
        <button className="primary" onClick={() => onChoose("higher")}>
          Higher voice
        </button>
      </div>
      <p className="param-help">
        Not sure? Pick either. You can calibrate later in Settings, but you do not need to.
      </p>
      <button onClick={onBack}>
        Back
      </button>
    </div>
  );
}
