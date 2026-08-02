import { useEffect, useState } from "react";
import { getLatestState, getTracker } from "../game/loop";
import type { PitchState } from "../pitch/types";

const READOUT_HZ = 10;

export function DevPanel() {
  const [pitch, setPitch] = useState<PitchState>(getLatestState());
  const [f0Center, setF0Center] = useState(120);
  const [alpha, setAlpha] = useState(0.35);
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
          <tr><td>f0</td><td>{fmt(pitch.f0, 1)} Hz</td></tr>
          <tr><td>clarity</td><td>{fmt(pitch.clarity)}</td></tr>
          <tr><td>rms</td><td>{fmt(pitch.rms, 4)}</td></tr>
          <tr><td>voiced</td><td>{pitch.voiced ? "yes" : "no"}</td></tr>
          <tr><td>chao</td><td>{fmt(pitch.chao)}</td></tr>
          <tr><td>smoothed</td><td>{fmt(pitch.smoothedChao)}</td></tr>
        </tbody>
      </table>
      <label>
        f0Center {f0Center} Hz
        <input
          type="range" min={60} max={300} step={1} value={f0Center}
          onChange={(e) => {
            const v = Number(e.target.value);
            setF0Center(v);
            getTracker()?.setF0Center(v);
          }}
        />
      </label>
      <label>
        alpha {alpha.toFixed(2)}
        <input
          type="range" min={0} max={1} step={0.01} value={alpha}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAlpha(v);
            getTracker()?.setAlpha(v);
          }}
        />
      </label>
      <label>
        clarity ≥ {clarityThreshold.toFixed(2)}
        <input
          type="range" min={0.5} max={0.99} step={0.01} value={clarityThreshold}
          onChange={(e) => {
            const v = Number(e.target.value);
            setClarityThreshold(v);
            getTracker()?.setClarityThreshold(v);
          }}
        />
      </label>
    </div>
  );
}
