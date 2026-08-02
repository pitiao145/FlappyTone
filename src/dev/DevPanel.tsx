import { useEffect, useState } from "react";
import { playReferenceTone } from "../audio/reference.ts";
import { getLatestState, getTracker } from "../game/loop.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";

const READOUT_HZ = 10;

const TONE_LABELS = [
  { tone: "tone1" as const, label: "1 ˉ", hint: "flat & high" },
  { tone: "tone2" as const, label: "2 ˊ", hint: "rising" },
  { tone: "tone3" as const, label: "3 ˇ", hint: "dip, then up" },
  { tone: "tone4" as const, label: "4 ˋ", hint: "falling" },
];

export function DevPanel() {
  const [pitch, setPitch] = useState<PitchState>(getLatestState());
  const [f0Center, setF0Center] = useState(DEFAULT_CONFIG.f0Center);
  const [range, setRange] = useState(DEFAULT_CONFIG.rangeSemitones);
  const [alpha, setAlpha] = useState(DEFAULT_CONFIG.alpha);
  const [clarityThreshold, setClarityThreshold] = useState(DEFAULT_CONFIG.clarityThreshold);

  const resetSettings = () => {
    setF0Center(DEFAULT_CONFIG.f0Center);
    setRange(DEFAULT_CONFIG.rangeSemitones);
    setAlpha(DEFAULT_CONFIG.alpha);
    setClarityThreshold(DEFAULT_CONFIG.clarityThreshold);
    const tracker = getTracker();
    tracker?.setF0Center(DEFAULT_CONFIG.f0Center);
    tracker?.setRangeSemitones(DEFAULT_CONFIG.rangeSemitones);
    tracker?.setAlpha(DEFAULT_CONFIG.alpha);
    tracker?.setClarityThreshold(DEFAULT_CONFIG.clarityThreshold);
  };

  useEffect(() => {
    const id = setInterval(() => setPitch({ ...getLatestState() }), 1000 / READOUT_HZ);
    return () => clearInterval(id);
  }, []);

  const fmt = (v: number | null, digits = 2) =>
    v === null ? "—" : v.toFixed(digits);

  return (
    <div className="dev-panel">
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
        <span className="param-name">voice centre — {f0Center} Hz</span>
        <input
          type="range" min={60} max={300} step={1} value={f0Center}
          onChange={(e) => {
            const v = Number(e.target.value);
            setF0Center(v);
            getTracker()?.setF0Center(v);
          }}
        />
        <span className="param-help">
          Your "relaxed talking" pitch. Hum normally and adjust until the dot
          rests on line 3. Lower voices → lower value.
        </span>
      </label>

      <label>
        <span className="param-name">sensitivity — ±{range} semitones</span>
        <input
          type="range" min={3} max={8} step={0.5} value={range}
          onChange={(e) => {
            const v = Number(e.target.value);
            setRange(v);
            getTracker()?.setRangeSemitones(v);
          }}
        />
        <span className="param-help">
          How much pitch change fills the screen. Lower = small voice movements
          move the dot a lot. If you can't reach lines 1 or 5, lower this.
        </span>
      </label>

      <label>
        <span className="param-name">responsiveness — {alpha.toFixed(2)}</span>
        <input
          type="range" min={0.05} max={1} step={0.01} value={alpha}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAlpha(v);
            getTracker()?.setAlpha(v);
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
          onChange={(e) => {
            const v = Number(e.target.value);
            setClarityThreshold(v);
            getTracker()?.setClarityThreshold(v);
          }}
        />
        <span className="param-help">
          How sure the detector must be before the dot reacts. If the dot
          ignores your voice, lower this; if it twitches to noise, raise it.
        </span>
      </label>

      <button className="reset-button" onClick={resetSettings}>
        reset settings to defaults
      </button>
    </div>
  );
}
