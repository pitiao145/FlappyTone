import { useEffect, useState } from "react";
import { playReferenceTone } from "../audio/reference.ts";
import { getActiveTracker, getLiveState } from "../game/activeTracker.ts";
import { getLatestState } from "../game/loop.ts";
import type { Tone } from "../game/gates.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";

const READOUT_HZ = 10;

const TONE_LABELS: Array<{ tone: Tone; label: string; hint: string }> = [
  { tone: 1, label: "1 ˉ", hint: "flat & high" },
  { tone: 2, label: "2 ˊ", hint: "rising" },
  { tone: 3, label: "3 ˇ", hint: "dip, then up" },
  { tone: 4, label: "4 ˋ", hint: "falling" },
];

/**
 * Live pitch readout and tracker controls.
 *
 * Everything here targets the tracker registered in activeTracker.ts — the one
 * whichever screen currently owns the mic is pushing frames through. Before
 * that registry existed these sliders retuned the *calibration preview's*
 * tracker while the game ran on a tracker of its own, so during play they did
 * nothing at all. When nothing is live the panel says so, rather than offering
 * controls that silently go nowhere.
 */
export function DevPanel() {
  const [pitch, setPitch] = useState<PitchState>(getLatestState);
  const [live, setLive] = useState(() => getActiveTracker() !== null);
  const initial = getActiveTracker()?.getConfig() ?? DEFAULT_CONFIG;
  const [f0Center, setF0Center] = useState(initial.f0Center);
  const [range, setRange] = useState(initial.rangeSemitones);
  const [rangeDown, setRangeDown] = useState(initial.rangeDownSemitones);
  const [alpha, setAlpha] = useState(initial.alpha);
  const [clarityThreshold, setClarityThreshold] = useState(
    initial.clarityThreshold,
  );
  /** Suppresses the poll's read-back for a beat after a drag, so it can't fight the slider. */
  const [editingUntil, setEditingUntil] = useState(0);

  const resetSettings = () => {
    setF0Center(DEFAULT_CONFIG.f0Center);
    setRange(DEFAULT_CONFIG.rangeSemitones);
    setRangeDown(DEFAULT_CONFIG.rangeDownSemitones);
    setAlpha(DEFAULT_CONFIG.alpha);
    setClarityThreshold(DEFAULT_CONFIG.clarityThreshold);
    setEditingUntil(performance.now() + 500);
    const tracker = getActiveTracker();
    tracker?.setF0Center(DEFAULT_CONFIG.f0Center);
    tracker?.setRangeSemitones(
      DEFAULT_CONFIG.rangeSemitones,
      DEFAULT_CONFIG.rangeDownSemitones,
    );
    tracker?.setAlpha(DEFAULT_CONFIG.alpha);
    tracker?.setClarityThreshold(DEFAULT_CONFIG.clarityThreshold);
  };

  useEffect(() => {
    const id = setInterval(() => {
      setPitch({ ...(getLiveState() ?? getLatestState()) });
      const tracker = getActiveTracker();
      setLive(tracker !== null);
      // A tracker built after this panel mounted carries its own config — show
      // that, not whatever the sliders were left at for a previous screen.
      if (tracker && performance.now() > editingUntil) {
        const c = tracker.getConfig();
        setF0Center(c.f0Center);
        setRange(c.rangeSemitones);
        setRangeDown(c.rangeDownSemitones);
        setAlpha(c.alpha);
        setClarityThreshold(c.clarityThreshold);
      }
    }, 1000 / READOUT_HZ);
    return () => clearInterval(id);
  }, [editingUntil]);

  const fmt = (v: number | null, digits = 2) =>
    v === null ? "—" : v.toFixed(digits);

  /** Every slider writes through to the live tracker and holds off the poll. */
  const push = (fn: (v: number) => void) => (v: number) => {
    setEditingUntil(performance.now() + 500);
    fn(v);
  };

  return (
    <div className="dev-panel">
      {!live && (
        <p className="param-help warn">
          No live tracker. Start a run, the visualiser, or calibration — these
          controls retune whatever is currently listening.
        </p>
      )}

      <table>
        <tbody>
          <tr><td title="The pitch of your voice right now">pitch (f0)</td><td>{fmt(pitch.f0, 1)} Hz</td></tr>
          <tr><td title="How confident the detector is that this is a real pitch (0–1)">confidence</td><td>{fmt(pitch.clarity)}</td></tr>
          <tr><td title="How loud the mic signal is">loudness</td><td>{fmt(pitch.rms, 4)}</td></tr>
          <tr><td title="Whether the game thinks you're making a voiced sound right now">hearing you?</td><td>{pitch.voiced ? "yes" : "no"}</td></tr>
          <tr><td title="Your pitch on the 1 (low) to 5 (high) grid">grid level</td><td>{fmt(pitch.chao)}</td></tr>
          <tr><td title="Same, after smoothing — this is what the dot follows">dot position</td><td>{fmt(pitch.smoothedChao)}</td></tr>
        </tbody>
      </table>

      <div className="ref-tones">
        <span className="param-name">reference sounds — listen, then imitate</span>
        <div className="ref-tone-buttons">
          {TONE_LABELS.map(({ tone, label, hint }) => (
            <button key={tone} title={hint} onClick={() => void playReferenceTone(tone, f0Center)}>
              {label}
            </button>
          ))}
        </div>
        <span className="param-help">
          Played at your current voice centre. Match the shape, not the exact
          pitch.
        </span>
      </div>

      <label>
        <span className="param-name">voice centre — {Math.round(f0Center)} Hz</span>
        <input
          type="range" min={60} max={300} step={1} value={f0Center}
          disabled={!live}
          onChange={(e) => {
            const v = Number(e.target.value);
            push(setF0Center)(v);
            getActiveTracker()?.setF0Center(v);
          }}
        />
        <span className="param-help">
          Your "relaxed talking" pitch. Hum normally and adjust until the dot
          rests on line 3. Lower voices → lower value.
        </span>
      </label>

      <label>
        <span className="param-name">reach up — {range} semitones to line 5</span>
        <input
          type="range" min={3} max={10} step={0.5} value={range}
          disabled={!live}
          onChange={(e) => {
            const v = Number(e.target.value);
            push(setRange)(v);
            getActiveTracker()?.setRangeSemitones(v, rangeDown);
          }}
        />
        <span className="param-help">
          How much pitch change fills the screen. Lower = small voice movements
          move the dot a lot. If you can't reach line 5, lower this.
        </span>
      </label>

      <label>
        <span className="param-name">
          reach down — {rangeDown} semitones to line 1
        </span>
        <input
          type="range" min={2} max={10} step={0.5} value={rangeDown}
          disabled={!live}
          onChange={(e) => {
            const v = Number(e.target.value);
            push(setRangeDown)(v);
            getActiveTracker()?.setRangeSemitones(range, v);
          }}
        />
        <span className="param-help">
          The two halves are separate: a speaking voice sits near the bottom of
          its own range, so the drop to line 1 is usually the smaller of the
          two. If you can't reach line 1, lower this.
        </span>
      </label>

      <label>
        <span className="param-name">responsiveness — {alpha.toFixed(2)}</span>
        <input
          type="range" min={0.05} max={1} step={0.01} value={alpha}
          disabled={!live}
          onChange={(e) => {
            const v = Number(e.target.value);
            push(setAlpha)(v);
            getActiveTracker()?.setAlpha(v);
          }}
        />
        <span className="param-help">
          1 = dot follows your voice instantly but jitters. Low = smooth but
          laggy, and fast tone changes get flattened out.
        </span>
      </label>

      <label>
        <span className="param-name">strictness — {clarityThreshold.toFixed(2)}</span>
        <input
          type="range" min={0.5} max={0.99} step={0.01} value={clarityThreshold}
          disabled={!live}
          onChange={(e) => {
            const v = Number(e.target.value);
            push(setClarityThreshold)(v);
            getActiveTracker()?.setClarityThreshold(v);
          }}
        />
        <span className="param-help">
          How sure the detector must be before the dot reacts. If the dot
          ignores your voice, lower this; if it twitches to noise, raise it.
        </span>
      </label>

      <button className="reset-button" onClick={resetSettings}>
        reset tracker to defaults
      </button>
    </div>
  );
}
