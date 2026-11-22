import { useState } from "react";
import type { Tone } from "../game/gates.ts";
import {
  DEFAULT_TUNING,
  resetTuning,
  setTuning,
  tuning,
  type Tuning,
} from "../game/tuning.ts";
import {
  applyPreset,
  deletePreset,
  formatTuningDiff,
  loadPresets,
  savePreset,
  tuningDiff,
  type Preset,
} from "./presets.ts";
import { foundationOn, setFoundation } from "./shapesV2.ts";

/** A numeric field of Tuning — everything except the per-tone gate durations. */
type NumericKey = {
  [K in keyof Tuning]: Tuning[K] extends number ? K : never;
}[keyof Tuning];

interface Knob {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

const GROUPS: Array<{ title: string; note: string; knobs: Knob[] }> = [
  {
    title: "pacing",
    note: "spec B3: one gate should be the obvious current target, and the response window should open on the beat the call ends.",
    knobs: [
      { key: "baseRestMs", label: "rest between gates", min: 400, max: 2400, step: 50,
        help: "Gap after one gate before the next. Higher = fewer gates on screen at once." },
      { key: "restMsFloor", label: "rest floor", min: 300, max: 2000, step: 50,
        help: "The ramp shrinks the rest toward this and no further." },
      { key: "birdXFrac", label: "dot position", min: 0.08, max: 0.45, step: 0.01,
        help: "How far from the left edge the dot sits. Left = more runway after the demo." },
      { key: "cueApproachMs", label: "cue approach", min: 0, max: 2000, step: 25,
        help: "Travel left between the end of the demo freeze and the corridor reaching you. 0 = it arrives the instant the world resumes." },
      { key: "cuePauseHoldMs", label: "post-demo hold", min: 0, max: 1200, step: 25,
        help: "Still beat after the demo finishes tracing, before the world moves again." },
      { key: "baseScrollSpeed", label: "scroll speed", min: 100, max: 400, step: 5,
        help: "px/s before the difficulty ramp. Gate width scales with it, so tone tempo is unaffected." },
    ],
  },
  {
    title: "corridor",
    note: "how much room a correct attempt has, in pitch and in time.",
    knobs: [
      { key: "baseToleranceH", label: "tunnel half-height", min: 0.05, max: 0.25, step: 0.005,
        help: "Fraction of canvas height. The 'tunnel' setting scales this." },
      { key: "timingSlackS", label: "timing slack", min: 0, max: 0.3, step: 0.005,
        help: "How far out of step you may be. Only widens where the corridor is moving; flat stretches stay exactly as strict." },
      { key: "maxTimingWidenFactor", label: "slack cap", min: 1, max: 3, step: 0.05,
        help: "Ceiling on that widening, as a multiple of the base tolerance. Without it the T4 cliff's wall disappears." },
      { key: "slackSmoothS", label: "wall smoothing", min: 0, max: 0.15, step: 0.005,
        help: "Rounds the corners off the widening, in seconds of gate time. 0 is the old peaky wall. Higher also bleeds the flare further into the flat ground either side, so it is not free." },
    ],
  },
  {
    title: "judging",
    note: "when the game says wall, and when it says it could not hear you.",
    knobs: [
      { key: "collisionSustainMs", label: "collision sustain", min: 40, max: 400, step: 5,
        help: "Continuous ms outside the corridor before it costs a heart. Both non-T1 collisions in the last measured run sat at 139ms." },
      { key: "minUtteranceMs", label: "min utterance", min: 60, max: 400, step: 10,
        help: "Shorter than this is a cough, not an attempt — the gate goes neutral." },
      { key: "mergeGapMs", label: "merge gap", min: 40, max: 300, step: 10,
        help: "Voiced runs closer together than this are one utterance. This is what stops T3 creak splitting an attempt in two." },
      { key: "preGateBufferMs", label: "pre-gate buffer", min: 0, max: 1000, step: 25,
        help: "How far back a gate reaches for a syllable you began before it opened." },
    ],
  },
  {
    title: "tone accuracy",
    note: "the learning metric (stats, visualiser) — timing-free, never feeds the score. Compare it with score accuracy per gate in the gate log.",
    knobs: [
      { key: "toneAccShapeWeight", label: "shape weight", min: 0, max: 2, step: 0.05,
        help: "Weight of the correlation with the reference shape (the tone's or the combo's average)." },
      { key: "toneAccMovementWeight", label: "movement weight", min: 0, max: 2, step: 0.05,
        help: "Weight of movement size: player range over reference range, too big penalised like too small. Scaled by the shape match." },
      { key: "toneAccHeightWeight", label: "height weight", min: 0, max: 2, step: 0.05,
        help: "Weight of height: mean chao distance from the reference." },
      { key: "toneAccT23Weight", label: "T2/T3 cue weight", min: 0, max: 2, step: 0.05,
        help: "Single T2/T3 targets only: weight of the classifier's drop/low-point vote pointed at the target. Scaled by the shape match." },
      { key: "toneAccHeightZeroChao", label: "height zero at", min: 0.5, max: 3, step: 0.1,
        help: "Mean chao distance at which the height part reaches 0." },
      { key: "toneAccFlatTargetChao", label: "level target below", min: 0.2, max: 1.5, step: 0.05,
        help: "A reference moving less than this is judged on flatness + height only (T1, a 1+1 pair)." },
      { key: "toneAccFlatAttemptChao", label: "flat attempt below", min: 0.1, max: 1, step: 0.05,
        help: "An attempt moving less than this on a moving tone scores near 0, whatever its correlation." },
      { key: "toneAccFlatAttemptMax", label: "flat attempt max", min: 0, max: 0.5, step: 0.01,
        help: "The most a near-flat attempt on a moving tone can score." },
    ],
  },
  {
    title: "tone classifier",
    note: "the standalone tone recognizer, proven in the Lab visualiser — these knobs also feed live gate scoring when the toggles above are on.",
    knobs: [
      { key: "toneClassifierMinConfidence", label: "min confidence", min: 0, max: 1, step: 0.05,
        help: "Below this score, the recognizer reports \"none\" rather than picking a tone." },
      { key: "toneClassifierOnsetTrimFraction", label: "onset trim", min: 0, max: 0.2, step: 0.01,
        help: "Fraction of the utterance's own span dropped from the front before anything else — small on purpose, just a click/silence guard, not a tone-shaving cut." },
      { key: "toneClassifierFlatnessScaleChao", label: "T1 flatness scale", min: 0.3, max: 3, step: 0.05,
        help: "Chao excursion at which a shape counts as \"definitely not flat\". T1's score is 1 at zero excursion, 0 at or past this." },
      { key: "toneClassifierT1TailFraction", label: "T1 tail window", min: 0.2, max: 1, step: 0.05,
        help: "How much of the sample's end T1's flatness is judged over — the voice may still be settling early on, so only the tail is checked." },
      { key: "toneClassifierMarginThreshold", label: "margin threshold", min: 0, max: 0.4, step: 0.01,
        help: "The winner must beat the runner-up by at least this much, or the attempt is \"none\" (ambiguous) rather than a confident pick." },
      { key: "toneClassifierT23DeadZone", label: "T2/T3 dead zone", min: 0, max: 0.6, step: 0.05,
        help: "T2 vs T3 is a vote from -1 (the T2 average) to +1 (the T3 average) on drop size, low point, drop share and shape. Inside ±this the read is \"none\"." },
      { key: "toneMismatchMinT23Cue", label: "T2/T3 heart cue", min: 0, max: 1.5, step: 0.05,
        help: "How far from the T2/T3 midpoint the vote must be before a wrong T2/T3 read costs a heart. Wider than the dead zone on purpose." },
      { key: "toneMismatchMaxT23Dissent", label: "T2/T3 heart dissent", min: 0, max: 1.6, step: 0.05,
        help: "A wrong T2/T3 read never costs a heart if any single cue votes this strongly for the other tone. Hearts need the cues to agree." },
      { key: "toneMismatchMaxGapMs", label: "T2/T3 heart max gap", min: 40, max: 400, step: 10,
        help: "A voicing gap this long inside the utterance (creak in the dip) means a wrong T2/T3 read never costs a heart." },
      { key: "toneClassifierBoostMinConfidence", label: "boost min confidence", min: 0.5, max: 1, step: 0.01,
        help: "Confidence the classifier must reach on the *correct* tone before a gate's accuracy gets raised to match — a reward for being sure, not a general softening." },
      { key: "toneClassifierBoostFloorAccuracy", label: "boost floor accuracy", min: 0, max: 1, step: 0.05,
        help: "Accuracy granted right at the boost's confidence threshold — set to land on the \"good\" tier, so clearing the bar guarantees at least that, not an automatic perfect." },
    ],
  },
  {
    title: "dot",
    note: "visual only, except grace and drift, which move the scored position.",
    knobs: [
      { key: "graceMs", label: "grace", min: 0, max: 500, step: 10,
        help: "Hold the last position this long after your voice stops." },
      { key: "t3GraceMs", label: "T3 grace", min: 0, max: 800, step: 10,
        help: "The longer hold inside a T3 gate, where creak drops the signal." },
      { key: "easeTauMs", label: "render easing", min: 0, max: 200, step: 5,
        help: "Smooths the drawn dot only. Never touches scoring data — but it is now the biggest single source of visible lag." },
      { key: "driftChaoPerSec", label: "drift rate", min: 0, max: 12, step: 0.1,
        help: "How fast the dot returns to the centre line once grace runs out." },
      { key: "trailSeconds", label: "trail length", min: 0.2, max: 4, step: 0.1,
        help: "Seconds of your contour kept on screen." },
    ],
  },
  {
    title: "pairs",
    note: "multi-syllable ('pairs') gates — see docs/superpowers/plans/2026-09-18-tone-pairs-v1.md.",
    knobs: [
      { key: "multiMergeGapMs", label: "multi merge gap", min: 100, max: 800, step: 10,
        help: "Silence between two syllables that still counts as one utterance. Too low splits a real pause-between-syllables attempt into two; too high risks merging a genuinely unheard second syllable into the first." },
      { key: "syllableDipRatio", label: "syllable dip", min: 0.3, max: 1, step: 0.05,
        help: "Visualiser / tone checker pairs: a loudness dip splits two syllables only if it is quieter than this share of the quieter syllable's peak. Lower = stricter, more \"?\" reads; higher = more forced cuts." },
      { key: "pairEdgeQuiet", label: "pair edge quiet", min: 0, max: 0.5, step: 0.01,
        help: "Brief 49 pair cut: a bit of sound at the edge of a pair attempt quieter than this share of its loudest frame is dropped before cutting (breath, room noise)." },
      { key: "pairEdgeShortMs", label: "pair edge short", min: 0, max: 300, step: 10,
        help: "Brief 49 pair cut: a short, not-loud bit at the edge, apart from the word by more than the merge gap, is dropped before cutting." },
      { key: "pairCutWindowScale", label: "pair cut window", min: 0.5, max: 2, step: 0.05,
        help: "Brief 49 pair cut: widens or narrows every tone pair's search window around the spot where Jane's join usually sits." },
      { key: "pairCutFarWidths", label: "pair cut far", min: 1, max: 5, step: 0.25,
        help: "Brief 49 pair cut: a long silence further than this many window half-widths from the expected spot is not trusted; both syllables read \"?\"." },
      { key: "pairCutGapMs", label: "pair cut gap", min: 20, max: 150, step: 5,
        help: "Brief 49 pair cut: inside the search window, a hole in the voice longer than this is the join." },
      { key: "pairEventMinChao", label: "pair pitch event", min: 0, max: 1, step: 0.05,
        help: "Brief 49 pair cut: the tone pair's pitch event (fall or rise at the join) must move at least this much (chao) to place the cut." },
      { key: "pairEdgeTrim", label: "pair syllable trim", min: 0, max: 0.3, step: 0.01,
        help: "Brief 49: each syllable of a pair loses edge frames quieter than this share of its own loudest frame before it is read." },
      { key: "multiGateChance", label: "mix roll", min: 0, max: 1, step: 0.05,
        help: "Classic game, wordMix \"all\" only: chance a given gate draws a pair instead of a single syllable." },
    ],
  },
  {
    title: "quick start + voice tuner (brief 50)",
    note: "a new player picks lower/higher voice; the learned scale starts fast. The tuner is Settings' calibration.",
    knobs: [
      { key: "gridLearnStartRate", label: "start rate", min: 0.1, max: 1, step: 0.05,
        help: "Quick start only: share of the gap closed by each of the first heard gates." },
      { key: "gridLearnStartGates", label: "start gates", min: 0, max: 10, step: 1,
        help: "Quick start only: how many heard gates use the start rate." },
      { key: "gridLearnUncappedUntilLearned", label: "no cap until learned", min: 0, max: 1, step: 1,
        help: "Quick start only: 1 = no per-run step cap until the top and bottom pools are full." },
      { key: "tunerTalkVoicedMs", label: "talk voice needed", min: 1000, max: 8000, step: 250,
        help: "Tuner talk step: voiced speech (ms) that fills the ring." },
      { key: "tunerTalkOffsetSt", label: "talk offset", min: -3, max: 3, step: 0.25,
        help: "Tuner: line 3 = talking median + this (st). Native talk sits ~1.5 st under her tone middle (brief 44)." },
      { key: "tunerToneNeedMs", label: "媽/馬 voice needed", min: 150, max: 1000, step: 25,
        help: "Tuner 媽 / 馬 steps: voiced ms that fills the ring; the word locks on the silence after it." },
      { key: "tunerNeedVoicedMs", label: "tuner voice needed", min: 200, max: 1500, step: 50,
        help: "Voiced ms that fills the ring and locks a tuner step." },
      { key: "tunerLockSilenceMs", label: "tuner lock silence", min: 100, max: 1000, step: 25,
        help: "Silence after enough voice that locks the step. Lower = snappier; too low may cut a word at a gap." },
      { key: "tunerMaxVoicedMs", label: "tuner max voice", min: 1000, max: 6000, step: 100,
        help: "A step locks after this much voice even without a pause." },
      { key: "tunerStallMs", label: "tuner stall hint", min: 1000, max: 10000, step: 250,
        help: "No voice for this long shows \"a bit louder?\"." },
      { key: "roomQuietRms", label: "room quiet under", min: 0.0001, max: 0.003, step: 0.0001,
        help: "Room step: noise floor (RMS) under this reads Quiet." },
      { key: "roomNoisyRms", label: "room too noisy over", min: 0.0005, max: 0.01, step: 0.0001,
        help: "Room step: noise floor (RMS) over this reads Too noisy." },
    ],
  },
  {
    title: "calibration",
    note: "how much of a sweep's reach becomes the board's half-width. Needs live retuning against real calibrations, not derived.",
    knobs: [
      { key: "reachToToneSpaceUp", label: "up scale", min: 0.3, max: 1.2, step: 0.05,
        help: "Fraction of the high-sweep reach that becomes the board's upward half. Higher = Tone 1/2/4's high end easier to reach." },
      { key: "reachToToneSpaceDown", label: "down scale", min: 0.3, max: 1.2, step: 0.05,
        help: "Fraction of the low-sweep reach that becomes the board's downward half. Leave alone unless T3's floor itself needs retuning." },
    ],
  },
];

const TONES: Tone[] = [1, 2, 3, 4];

/**
 * Live controls over src/game/tuning.ts.
 *
 * Everything here writes straight into the singleton the running game reads,
 * so a value moves mid-run without a reload. The diff at the bottom is the
 * point of the exercise: it names exactly what moved, in a form that can be
 * pasted into DEFAULT_TUNING once a value has earned it.
 */
export function TuningPanel() {
  // The tuning singleton lives outside React; this is the re-render trigger.
  const [, bump] = useState(0);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const t = tuning();
  const diff = tuningDiff(t);

  const write = (patch: Partial<Tuning>) => {
    setTuning(patch);
    bump((n) => n + 1);
  };

  // The foundation toggle owns `playerRulerV2`: a reset or a preset must not
  // leave the shapes on the new foundation and the grid/reader on the old.
  const keepFoundation = () => setTuning({ playerRulerV2: foundationOn() });

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(formatTuningDiff(diff));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const movedIn = (group: (typeof GROUPS)[number]) =>
    group.knobs.filter((k) => t[k.key] !== DEFAULT_TUNING[k.key]).length;
  const movedCount = diff && Object.keys(diff).length;

  const knobRow = (k: Knob) => {
    const value = t[k.key];
    const moved = value !== DEFAULT_TUNING[k.key];
    return (
      <div key={k.key} className={moved ? "knob moved" : "knob"}>
        <label>
          <span className="knob-top">
            <span className="param-name">{k.label}</span>
            <span className="knob-val">{value}</span>
            {moved && (
              <button
                type="button"
                className="revert"
                title={`back to ${DEFAULT_TUNING[k.key]}`}
                onClick={() => write({ [k.key]: DEFAULT_TUNING[k.key] } as Partial<Tuning>)}
              >
                reset
              </button>
            )}
          </span>
          <input
            type="range"
            min={k.min}
            max={k.max}
            step={k.step}
            value={value}
            onChange={(e) => write({ [k.key]: Number(e.target.value) } as Partial<Tuning>)}
          />
        </label>
        <p className="param-help">{k.help}</p>
      </div>
    );
  };

  const toggleRow = (
    label: string,
    checked: boolean,
    key: "toneMismatchCollisionEnabled" | "toneClassifierBoostEnabled" | "toneClassifierV2" | "pairCutOn",
    help: string,
  ) => (
    <div className="knob">
      <label className="knob-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => write({ [key]: e.target.checked } as Partial<Tuning>)}
        />
        <span className="param-name">{label}</span>
      </label>
      <p className="param-help">{help}</p>
    </div>
  );

  return (
    <div className="tuning-panel">
      <header className="tuning-head">
        <div>
          <h3>Tuning</h3>
          <p className="param-help tuning-sub">
            {movedCount
              ? `${movedCount} value${movedCount === 1 ? "" : "s"} moved from the shipped defaults`
              : "Everything is at its shipped default"}
          </p>
        </div>
        <div className="row">
          <button disabled={!movedCount} onClick={() => void copyDiff()}>
            {copied ? "Copied" : "Copy diff as TS"}
          </button>
          <button
            disabled={!movedCount}
            onClick={() => {
              resetTuning();
              keepFoundation();
              bump((n) => n + 1);
            }}
          >
            Reset all
          </button>
        </div>
      </header>

      <div className="knob">
        <span className="param-name">Foundation (brief 48)</span>
        <div className="row">
          <button
            type="button"
            disabled={!foundationOn()}
            onClick={() => {
              setFoundation(false);
              location.reload();
            }}
          >
            Old foundation
          </button>
          <button
            type="button"
            disabled={foundationOn()}
            onClick={() => {
              setFoundation(true);
              location.reload();
            }}
          >
            New foundation
          </button>
        </div>
        <p className="param-help">
          Now: {foundationOn() ? "new" : "old"}. New = one-ruler target shapes, the player's grid
          (middle step, learns in play) and the tone reader on the ruler, all together. Reloads the
          page. Your saved calibration carries over; calibrate once in each mode for the fairest comparison.
        </p>
      </div>

      {GROUPS.map((group, gi) => {
        const n = movedIn(group);
        return (
          <details key={group.title} className="tgroup" open={gi === 0}>
            <summary>
              <span className="tgroup-title">{group.title}</span>
              {n > 0 && <span className="tgroup-moved">{n} moved</span>}
            </summary>
            <p className="param-help">{group.note}</p>
            {group.title === "tone classifier" &&
              toggleRow(
                "Use classifier v2",
                t.toneClassifierV2,
                "toneClassifierV2",
                "v2 measures the shape directly (turn time, rise, drop, depth) instead of comparing with Jane's averages. Drives the mismatch collision and the boost below. Natural-style and pair gates never run the classifier either way.",
              )}
            {group.title === "tone classifier" &&
              toggleRow(
                "Drastic mismatch is a collision",
                t.toneMismatchCollisionEnabled,
                "toneMismatchCollisionEnabled",
                "A confident T1/T4 mixup with any other tone, or a confident T2↔T3 mixup, forces a wall-style collision: heart lost, gate scores 0. Known gaps: a shape ~80ms late, or a brief off-corridor wobble, can still misclassify. Turn off if false collisions show up while tuning.",
              )}
            {group.title === "tone classifier" &&
              toggleRow(
                "Reward a confident correct shape",
                t.toneClassifierBoostEnabled,
                "toneClassifierBoostEnabled",
                `A gate the classifier reads as the correct tone at ${Math.round(
                  t.toneClassifierBoostMinConfidence * 100,
                )}% confidence or more has its accuracy raised to match. A false positive only over-rewards; it never costs a heart.`,
              )}
            {group.title === "pairs" &&
              toggleRow(
                "Cut pairs at the tone pair's spot (brief 49)",
                t.pairCutOn,
                "pairCutOn",
                "Visualiser / tone checker pairs: cut near where Jane's join for this tone pair usually sits (silence, then a loudness dip, then the pair's pitch event; nothing found → \"?\"). Off = the brief 46 finder (silence, then the deepest loudness dip).",
              )}
            {group.knobs.map(knobRow)}
          </details>
        );
      })}

      <details className="tgroup">
        <summary>
          <span className="tgroup-title">gate length (fallback only)</span>
        </summary>
        <p className="param-help">
          Seconds per tone. A gate is built from a word, and a word carries its
          own length, so these no longer set the gates you fly. They still feed
          T3 fallback corridors, wordless gates and the title screen's demo
          loop. Moving one makes the demo and the corridor disagree there.
        </p>
        {TONES.map((tone) => {
          const value = t.gateDurationS[tone];
          const moved = value !== DEFAULT_TUNING.gateDurationS[tone];
          return (
            <div key={tone} className={moved ? "knob moved" : "knob"}>
              <label>
                <span className="knob-top">
                  <span className="param-name">Tone {tone}</span>
                  <span className="knob-val">{value}s</span>
                </span>
                <input
                  type="range"
                  min={0.3}
                  max={2}
                  step={0.01}
                  value={value}
                  onChange={(e) =>
                    write({
                      gateDurationS: { [tone]: Number(e.target.value) } as Record<Tone, number>,
                    })
                  }
                />
              </label>
            </div>
          );
        })}
      </details>

      <details className="tgroup">
        <summary>
          <span className="tgroup-title">changes and presets</span>
        </summary>
        <pre className="diff">{formatTuningDiff(diff)}</pre>
        <div className="row">
          <input
            type="text"
            placeholder="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            disabled={name.trim() === ""}
            onClick={() => {
              savePreset({ name: name.trim(), tuning: diff });
              setPresets(loadPresets());
              setName("");
            }}
          >
            Save preset
          </button>
        </div>
        {presets.map((p) => (
          <div className="row" key={p.name}>
            <button
              onClick={() => {
                resetTuning();
                applyPreset(p);
                keepFoundation();
                bump((n) => n + 1);
              }}
            >
              {p.name}
            </button>
            <button
              aria-label={`Delete preset ${p.name}`}
              onClick={() => {
                deletePreset(p.name);
                setPresets(loadPresets());
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </details>
    </div>
  );
}
