import { useEffect, useState } from "react";
import { getLatestState, getTracker } from "../game/loop.ts";
import type { PitchState } from "../pitch/types.ts";

const READOUT_HZ = 10;

export function DevPanel() {
  const [pitch, setPitch] = useState<PitchState>(getLatestState());
  const [f0Center, setF0Center] = useState(120);
  const [range, setRange] = useState(5);
  const [alpha, setAlpha] = useState(0.6);
  const [clarityThreshold, setClarityThreshold] = useState(0.85);

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
    </div>
  );
}
