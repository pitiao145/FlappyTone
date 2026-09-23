import { useState } from "react";
import { useTier } from "../data/tier.ts";
import { tierLimits, type Proficiency } from "../game/tiers.ts";
import type { LevelChoice } from "../game/settings.ts";
import { ShuffleIcon } from "./toneIcons.tsx";

interface Props {
  initialProficiency: Proficiency;
  /** The last level chosen for whichever proficiency is initially selected, or null. */
  initialLevel: LevelChoice | null;
  onConfirm: (proficiency: Proficiency, level: LevelChoice | null) => void;
  onBack: () => void;
}

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "TOCFL 1", 2: "TOCFL 2", 3: "TOCFL 3" };

/**
 * The pre-game picker: proficiency (Beginner = single syllable only,
 * Intermediate = single or two-syllable — additive, not a separate pool) and,
 * when this tier/proficiency has a level choice at all,
 * which TOCFL level (or Mix). Shown every time `startPlay("game")` fires
 * (unlike calibration's once-only gate) — see `GameApp.tsx`'s `startPlay`.
 *
 * Proficiency is also a persisted Settings value (`saveProficiency`, called
 * on confirm here) — this screen is where a first-time player sets it, and
 * Settings is where they change it later. A guest sees no level row at all:
 * `tierLimits().guest[proficiency].levels` is always `null`, so there is
 * nothing to choose (the sampler is implicit).
 */
export function LevelSelect({ initialProficiency, initialLevel, onConfirm, onBack }: Props) {
  const tier = useTier();
  const [proficiency, setProficiency] = useState<Proficiency>(initialProficiency);
  const [level, setLevel] = useState<LevelChoice | null>(initialLevel);

  const access = tierLimits()[tier][proficiency];
  const locked = access.levels === null;
  // A level row is offered at all only when this tier/proficiency has one
  // (see the class doc above) — Play should wait on a choice only then, not
  // for a guest who has nothing to pick.
  const needsLevel = !locked && !!access.levels;
  const canPlay = !needsLevel || level !== null;

  function chooseProficiency(p: Proficiency) {
    setProficiency(p);
    // A level chosen under the OTHER proficiency may not be valid here (free's
    // Intermediate only ever allows TOCFL1) — reset rather than carry over a
    // choice that would silently resolve to something else.
    setLevel(null);
  }

  return (
    <div className="stage game-stage playhome-stage level-select-screen">
      <div className="screen playhome-overlay">
        <h1>Choose your level</h1>

        <p className="note">Single syllables only, or add two-syllable words too?</p>
        <div className="choice proficiency-choice">
          <button
            type="button"
            className={`choice-option${proficiency === "beginner" ? " active" : ""}`}
            onClick={() => chooseProficiency("beginner")}
          >
            Beginner
          </button>
          <button
            type="button"
            className={`choice-option${proficiency === "intermediate" ? " active" : ""}`}
            onClick={() => chooseProficiency("intermediate")}
          >
            Intermediate
          </button>
        </div>

        {!locked && access.levels && (
          <>
            <p className="note level-section-note">Which TOCFL level?</p>
            <div className="choice">
              {([1, 2, 3] as const).map((n) => {
                const unlocked = access.levels!.includes(n);
                return (
                  <button
                    type="button"
                    key={n}
                    className={`choice-option${level === n ? " active" : ""}${unlocked ? "" : " is-locked"}`}
                    disabled={!unlocked}
                    aria-label={`${LEVEL_LABEL[n]}${unlocked ? "" : ", locked, Pro"}`}
                    onClick={() => setLevel(n)}
                  >
                    {LEVEL_LABEL[n]}
                    {!unlocked && <span className="word-chip-lock">🔒</span>}
                  </button>
                );
              })}
                          {access.allowMix && (
              <div className="choice choice-mix-row">
                <button
                  type="button"
                  className={`choice-option choice-option-mix${level === "mix" ? " active" : ""}`}
                  onClick={() => setLevel("mix")}
                >
                  <ShuffleIcon className="choice-option-mix-icon" />
                  Mix
                </button>
              </div>
            )}

            </div>
          </>
        )}

        {locked && (
          <p className="note">
            You're playing the guest sampler — sign up free to unlock TOCFL levels.
          </p>
        )}

        <div className="menu playhome-menu">
          <button
            className="primary"
            disabled={!canPlay}
            onClick={() => onConfirm(proficiency, level)}
          >
            Play
          </button>
        </div>
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
