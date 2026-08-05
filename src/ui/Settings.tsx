import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";
import {
  CORRIDOR_WIDTHS,
  PACES,
  type CorridorWidth,
  type Pace,
} from "../game/gates.ts";
import { CUE_STYLES, type CueStyle } from "../game/run.ts";
import {
  clearSettings,
  loadCorridorWidth,
  loadCueStyle,
  loadPace,
  loadReduceMotion,
  saveCorridorWidth,
  saveCueStyle,
  savePace,
  saveReduceMotion,
  type CalibrationSettings,
} from "../game/settings.ts";

type Motion = "os" | "on" | "off";

interface Props {
  /** The saved calibration, or null if the player has never calibrated. */
  settings: CalibrationSettings | null;
  onBack: () => void;
  onRecalibrate: () => void;
  onVisualiser: () => void;
  /** Called after the calibration is deleted, so the router can re-check it. */
  onForget: () => void;
}

const PACE_HELP: Record<Pace, string> = {
  relaxed: "Slowest scroll, longest breather between gates.",
  normal: "A little calmer than the original tuning. Start here.",
  fast: "The original pace. Gates come quickly.",
};

const WIDTH_HELP: Record<CorridorWidth, string> = {
  narrow: "Demanding. Your pitch has to sit close to the line.",
  normal: "The tuned default.",
  wide: "Forgiving on pitch. Good while a tone is still new.",
};

const CUE_HELP: Record<CueStyle, string> = {
  pause: "The world stops while you hear the example, then it's your turn.",
  flow: "The example plays over the moving world. Faster, but the example and your attempt blur together.",
};

/**
 * The settings screen.
 *
 * These controls used to be three unlabelled rows of lowercase words on the
 * title screen — "relaxed normal fast" with no indication of what any of them
 * changed. Every one of them now says what it does, because a difficulty
 * control nobody understands is a difficulty control nobody touches.
 */
export function Settings({
  settings,
  onBack,
  onRecalibrate,
  onVisualiser,
  onForget,
}: Props) {
  const [pace, setPace] = useState<Pace>(loadPace);
  const [width, setWidth] = useState<CorridorWidth>(loadCorridorWidth);
  const [cueStyle, setCueStyle] = useState<CueStyle>(loadCueStyle);
  const [motion, setMotion] = useState<Motion>(() => {
    const v = loadReduceMotion();
    return v === null ? "os" : v ? "on" : "off";
  });
  const [confirmForget, setConfirmForget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Both of these lead to screens that listen. iOS Safari grants
  // getUserMedia only inside the gesture, so the mic opens here rather than in
  // the destination screen's mount effect.
  const goListening = (then: () => void) => async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureMic();
      then();
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen settings-screen">
      <h2>Settings</h2>

      <section className="setting">
        <h3>Your voice</h3>
        {settings ? (
          <p className="note">
            Centred on <strong>{Math.round(settings.f0Center)} Hz</strong>, with
            about <strong>±{settings.rangeSemitones} semitones</strong> filling
            the board.
          </p>
        ) : (
          <p className="note">
            Not calibrated yet. The game maps your voice through someone else's
            range until you do.
          </p>
        )}
        <div className="setting-actions">
          <button disabled={busy} onClick={() => void goListening(onRecalibrate)()}>
            {settings ? "Re-calibrate" : "Calibrate"}
          </button>
          {settings &&
            (confirmForget ? (
              <button
                className="danger"
                onClick={() => {
                  clearSettings();
                  setConfirmForget(false);
                  onForget();
                }}
              >
                Really forget it?
              </button>
            ) : (
              <button onClick={() => setConfirmForget(true)}>
                Forget my calibration
              </button>
            ))}
        </div>
        <p className="param-help">
          Re-calibrate if you've changed microphone, room, or if the dot doesn't
          rest around the middle line when you talk normally.
        </p>
      </section>

      <section className="setting">
        <h3>Speed</h3>
        <Choice
          options={PACES}
          value={pace}
          onChange={(p) => {
            setPace(p);
            savePace(p);
          }}
        />
        <p className="param-help">{PACE_HELP[pace]}</p>
      </section>

      <section className="setting">
        <h3>Tunnel width</h3>
        <Choice
          options={CORRIDOR_WIDTHS}
          value={width}
          onChange={(w) => {
            setWidth(w);
            saveCorridorWidth(w);
          }}
        />
        <p className="param-help">{WIDTH_HELP[width]}</p>
      </section>

      <section className="setting">
        <h3>The example</h3>
        <Choice
          options={CUE_STYLES}
          value={cueStyle}
          label={(s) => (s === "flow" ? "in flow" : "pause & listen")}
          onChange={(s) => {
            setCueStyle(s);
            saveCueStyle(s);
          }}
        />
        <p className="param-help">{CUE_HELP[cueStyle]}</p>
      </section>

      <section className="setting">
        <h3>Motion</h3>
        <Choice
          options={["os", "on", "off"] as Motion[]}
          value={motion}
          label={(m) =>
            m === "os" ? "follow system" : m === "on" ? "reduce" : "full"
          }
          onChange={(m) => {
            setMotion(m);
            saveReduceMotion(m === "os" ? null : m === "on");
          }}
        />
        <p className="param-help">
          Controls the screen shake on a collision and the knock-back on the
          dot. Takes effect on your next run.
        </p>
      </section>

      <section className="setting">
        <h3>Practice</h3>
        <button disabled={busy} onClick={() => void goListening(onVisualiser)()}>
          Open the tone visualiser
        </button>
        <p className="param-help">
          No gates, no score — just your voice drawn against the shape of a
          tone.
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <button className="primary" onClick={onBack}>
        Done
      </button>
    </div>
  );
}

/** A segmented control. One row, one obvious current value. */
function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: (v: T) => string;
}) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button
          key={o}
          className={o === value ? "choice-option active" : "choice-option"}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
        >
          {label ? label(o) : o}
        </button>
      ))}
    </div>
  );
}
