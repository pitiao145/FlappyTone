import { TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";

const TONES: Tone[] = [1, 2, 3, 4];

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen howto-screen">
      <h2>How to play</h2>
      <p>
        The dot follows the pitch of your voice. Each corridor is the shape of a
        Mandarin tone — say the syllable with that contour and you fly straight
        through it.
      </p>

      <ul className="tone-list">
        {TONES.map((tone) => (
          <li key={tone}>
            <span className="syllable">{TONE_INFO[tone].pinyin}</span>
            <span className="hanzi">{TONE_INFO[tone].hanzi}</span>
            <span className="cue">
              ({tone}) {TONE_INFO[tone].cue}
            </span>
          </li>
        ))}
      </ul>

      <h3>Good to know</h3>
      <ul className="facts">
        <li>Silence never makes you fall. Breathe between gates.</li>
        <li>
          If the mic can't hear you clearly, the gate is neutral — "couldn't
          hear that". No points lost, no heart lost.
        </li>
        <li>
          This checks your pitch contour, not your pronunciation. Humming beats
          it, and that's a known v1 limitation.
        </li>
        <li>
          Bluetooth headsets add 100–200ms of delay and will feel wrong. Use
          the built-in mic if you can.
        </li>
      </ul>

      <p className="note">
        Reference audio: Chen Wang via{" "}
        <a href="https://github.com/hugolpz/audio-cmn">audio-cmn</a> (CC-BY-SA).
      </p>

      <button className="primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
