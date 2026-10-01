// Dev-only overlay for noisy-room testing: which noise mode is live, how loud
// the room reads against the calibrated floor, and where the voicing gate
// sits, plus a button that saves the last 30 s of raw mic as a WAV. Tap to cycle the mode (takes effect next run; the "browser" modes
// change the mic stream, so reload the page after picking one).
import { useEffect, useState } from "react";
import { getActiveTracker } from "../game/activeTracker.ts";
import { isLoudRoom } from "../game/noise.ts";
import { tuning } from "../game/tuning.ts";
import { cycleNoiseMode } from "./noiseMode.ts";
import { tapeDownload } from "./micTape.ts";

const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(0) : "–∞");

export function NoiseBadge() {
  const [, tick] = useState(0);
  useEffect(() => {
    // 4 Hz, not per frame (hard rule 1).
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const tr = getActiveTracker();
  const cal = tr?.getConfig().noiseFloor ?? 0;
  const noise = tr?.getNoiseEstimate() ?? 0;
  const gate = tr ? tr.getEffectiveNoiseFloor() * tr.getConfig().rmsMult : 0;
  const loud = tr ? isLoudRoom(noise, cal) : false;
  return (
    <div style={{ position: "absolute", top: 4, left: 4, zIndex: 50, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
    <button
      type="button"
      onClick={cycleNoiseMode}
      style={{
        font: "11px/1.3 monospace",
        background: loud ? "rgba(180,40,40,.85)" : "rgba(0,0,0,.6)", color: "#fff",
        border: 0, borderRadius: 4, padding: "2px 6px", textAlign: "left", pointerEvents: "auto",
      }}
    >
      noise: {tuning().noiseMode} (tap)
      <br />
      room {db(noise)} dBFS · {cal > 0 ? (noise / cal).toFixed(1) : "–"}× cal
      <br />
      gate {db(gate)} dBFS{loud ? " · LOUD" : ""}
    </button>
    <button
      type="button"
      onClick={() => tapeDownload(tuning().noiseMode)}
      style={{ font: "11px monospace", background: "rgba(0,0,0,.6)", color: "#fff", border: 0, borderRadius: 4, padding: "2px 6px" }}
    >
      save last 30 s mic
    </button>
    </div>
  );
}
