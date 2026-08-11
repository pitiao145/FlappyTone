import { TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";
import { ContourSpark } from "./ContourSpark.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen howto-screen">
      <h2>How to play</h2>

      <section className="howto-section">
        <h3>The idea</h3>
        <p>
          The dot is your pitch. Speak or sing higher and it rises; lower and it
          falls. Each corridor is the shape of a Mandarin tone, say the
          syllable with that shape and you fly straight through it.
        </p>
        <p className="note">
          Silence never makes you fall. Breathe as much as you like between
          gates.
        </p>
      </section>

      <section className="howto-section">
        <h3>The four tones</h3>
        <ul className="tone-list">
          {TONES.map((tone) => (
            <li key={tone}>
              <ContourSpark tone={tone} />
              <span className="syllable">{TONE_INFO[tone].pinyin}</span>
              <span className="hanzi">{TONE_INFO[tone].hanzi}</span>
              <span className="cue">
                ({tone}) {TONE_INFO[tone].cue}
              </span>
            </li>
          ))}
        </ul>
        <p className="note">
          These curves are measured from a native speaker, not copied from the
          tone marks. Real tones hold, then move fast: tone 4 sits at the top
          for most of the syllable before it drops.
        </p>
      </section>

      <section className="howto-section">
        <h3>How a gate goes</h3>
        <ol className="facts">
          <li>You hear the example, and a faint dot traces its shape.</li>
          <li>The world starts moving again, that's your turn.</li>
          <li>Say the syllable. Your pitch flies the corridor.</li>
          <li>The path you actually flew lights up behind you.</li>
        </ol>
        <p className="note">
          Three outcomes: through cleanly (points, and a combo if you keep it
          up), into a wall (a heart), or <strong>“couldn't hear that”</strong>,
          which costs nothing at all. When the app isn't sure, it says so rather
          than scoring you wrong.
        </p>
      </section>

      <section className="howto-section">
        <h3>Practising</h3>
        <p>
          The <strong>tone visualiser</strong> is the same screen with the game
          taken out: no gates, no timing, no score. Say a syllable and watch the
          shape it made against the shape it should have. Good for getting a
          tone into your mouth before you have to fly it.
        </p>
      </section>

      <section className="howto-section">
        <h3>Honest limits</h3>
        <ul className="facts">
          <li>
            This checks your pitch contour, not your pronunciation. Humming
            beats it. It's a tone <em>contour</em> trainer, not a pronunciation
            checker.
          </li>
          <li>
            Single syllables only. Connected speech does other things to tones
            that this doesn't teach.
          </li>
          <li>
            Bluetooth headsets add 100–200ms of delay and will feel wrong. Use
            the built-in mic if you can.
          </li>
          <li>A quiet room helps more than anything else you can change.</li>
        </ul>
      </section>

      <p className="note">
        Reference audio: Jane, a native Taiwanese speaker, recorded direct to
        mic and used with permission.
      </p>

      <button className="primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
