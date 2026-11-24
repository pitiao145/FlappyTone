/**
 * Brief 50: Settings' "Your voice" card on the new foundation. The
 * calibration and the learned scale side by side, in semitones (no Hz),
 * "Learned from N gates", Calibrate / Adjust one part / Back to calibration,
 * and the last room check. Reads storage only; the tuner itself is
 * `VoiceTuner.tsx`.
 */
import { useState } from "react";
import { track } from "../analytics/client.ts";
import { loadRuler, saveRuler, seedRuler } from "../game/playerRuler.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { halfSteps, loadRoom } from "../game/tuner.ts";
import { loadVoiceStart } from "../game/voiceStart.ts";
import { ROOM_COPY } from "./VoiceTuner.tsx";

interface Props {
  settings: CalibrationSettings | null;
  busy: boolean;
  /** Opens the mic (in this tap) and the tuner from step 1. */
  onCalibrate: () => void;
  /** Opens the mic (in this tap) and the tuner on its Done screen, to redo one part. */
  onAdjust: () => void;
}

/** "½ lower", "2 higher", "same". */
function middleWord(st: number): string {
  if (Math.abs(st) < 0.25) return "same";
  return `${halfSteps(st)} ${st > 0 ? "higher" : "lower"}`;
}

export function VoiceCard({ settings, busy, onCalibrate, onAdjust }: Props) {
  const [, bump] = useState(0);
  const cal = settings !== null && !settings.quickStart ? settings : null;
  const calibrated = cal !== null;
  const ruler = settings ? loadRuler(settings) : null;
  const g = ruler?.state.grid ?? null;
  const gates = ruler?.state.gates ?? 0;
  const room = loadRoom();
  const preset = settings?.quickStart ? loadVoiceStart() : null;

  const backToCalibration = () => {
    if (!settings) return;
    saveRuler(seedRuler(settings));
    track({ type: "setting_changed", key: "voice_scale", value: "calibration" });
    bump((n) => n + 1);
  };

  const rows: Array<{ dot: string; name: string; cal: string; now: string }> = [
    {
      dot: "top",
      name: "Top",
      cal: cal ? `${halfSteps(cal.rangeSemitones)} up` : "—",
      now: g ? `${halfSteps(g.up)} up` : "—",
    },
    { dot: "middle", name: "Middle", cal: calibrated ? "your voice" : "—", now: g ? middleWord(g.midSt) : "—" },
    {
      dot: "bottom",
      name: "Bottom",
      cal: cal ? `${halfSteps(cal.rangeDownSemitones)} down` : "—",
      now: g ? `${halfSteps(g.down)} down` : "—",
    },
  ];

  return (
    <>
      <p className="param-help">
        The game learns your voice while you play.{" "}
        {gates > 0 ? `Learned from ${gates} gate${gates === 1 ? "" : "s"}.` : "Nothing learned yet: play a few gates."}
        {preset && ` It started from your ${preset} voice.`}
      </p>
      {settings && (
        <>
          <div className="voice-table" role="table" aria-label="Your voice: calibration and learned, in semitones">
            <div className="voice-table-row voice-table-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Calibration</span>
              <span role="columnheader">Now (learned)</span>
            </div>
            {rows.map((r) => (
              <div key={r.name} className="voice-table-row" role="row">
                <span role="cell"><span className={`tuner-dot is-${r.dot}`} style={{ display: "inline-block", marginRight: 6 }} />{r.name}</span>
                <span role="cell" className="is-old">{r.cal}</span>
                <span role="cell" className="is-now">{r.now}</span>
              </div>
            ))}
          </div>
          <p className="param-help">
            In semitones. 1 semitone = one key on a piano.
            {!calibrated && " Not calibrated: the Calibration column fills in when you calibrate."}
          </p>
        </>
      )}
      <div className="setting-actions voice-actions">
        <button className="primary" disabled={busy} onClick={onCalibrate}>
          Calibrate
        </button>
        <div className="voice-parts">
          <button disabled={busy || !calibrated} onClick={onAdjust}>
            Adjust one part
          </button>
          <button disabled={!calibrated || gates === 0} onClick={backToCalibration}>
            Back to calibration
          </button>
        </div>
      </div>
      {room && (
        <p className="param-help">
          <span className={`tuner-dot is-room-${room.verdict}`} style={{ display: "inline-block", marginRight: 8 }} />
          Room: {ROOM_COPY[room.verdict].title.toLowerCase()} · checked {checkedWhen(room.atMs)}
        </p>
      )}
      {!calibrated && (
        <p className="param-help">
          <strong>New here?</strong> You do not need to calibrate. The game starts from your lower or
          higher voice and adapts as you play.
        </p>
      )}
    </>
  );
}

function checkedWhen(atMs: number): string {
  const d = new Date(atMs);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? "today" : d.toLocaleDateString();
}
