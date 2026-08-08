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
        help: "px/s before pace and difficulty ramp. Gate width scales with it, so tone tempo is unaffected." },
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

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(formatTuningDiff(diff));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="tuning-panel">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h4>{group.title}</h4>
          <p className="param-help">{group.note}</p>
          {group.knobs.map((k) => {
            const value = t[k.key];
            const moved = value !== DEFAULT_TUNING[k.key];
            return (
              <label key={k.key} className={moved ? "knob moved" : "knob"}>
                <span className="param-name">
                  {k.label} — {value}
                  {moved && (
                    <button
                      className="revert"
                      title={`back to ${DEFAULT_TUNING[k.key]}`}
                      onClick={() => write({ [k.key]: DEFAULT_TUNING[k.key] } as Partial<Tuning>)}
                    >
                      ↺
                    </button>
                  )}
                </span>
                <input
                  type="range"
                  min={k.min}
                  max={k.max}
                  step={k.step}
                  value={value}
                  onChange={(e) =>
                    write({ [k.key]: Number(e.target.value) } as Partial<Tuning>)
                  }
                />
                <span className="param-help">{k.help}</span>
              </label>
            );
          })}
        </section>
      ))}

      <section>
        <h4>gate length</h4>
        <p className="param-help">
          Seconds per tone. These are the shipped reference clips' own lengths —
          changing one here makes the demo and the corridor disagree, which is a
          failure this project has hit twice. Re-cut the clip before shipping a
          new value.
        </p>
        {TONES.map((tone) => {
          const value = t.gateDurationS[tone];
          const moved = value !== DEFAULT_TUNING.gateDurationS[tone];
          return (
            <label key={tone} className={moved ? "knob moved" : "knob"}>
              <span className="param-name">
                T{tone} — {value}s
              </span>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.01}
                value={value}
                onChange={(e) =>
                  write({
                    gateDurationS: { [tone]: Number(e.target.value) } as Record<
                      Tone,
                      number
                    >,
                  })
                }
              />
            </label>
          );
        })}
      </section>

      <section className="tuning-actions">
        <h4>what you changed</h4>
        <pre className="diff">{formatTuningDiff(diff)}</pre>
        <div className="row">
          <button onClick={() => void copyDiff()}>
            {copied ? "copied" : "copy diff as TS"}
          </button>
          <button
            onClick={() => {
              resetTuning();
              bump((n) => n + 1);
            }}
          >
            reset all
          </button>
        </div>

        <div className="row">
          <input
            type="text"
            placeholder="preset name"
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
            save preset
          </button>
        </div>

        {presets.map((p) => (
          <div className="row" key={p.name}>
            <button
              onClick={() => {
                resetTuning();
                applyPreset(p);
                bump((n) => n + 1);
              }}
            >
              {p.name}
            </button>
            <button
              onClick={() => {
                deletePreset(p.name);
                setPresets(loadPresets());
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
