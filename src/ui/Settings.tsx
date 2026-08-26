import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";
import { setSharingEnabled } from "../analytics/client.ts";
import { setPostHogConsent } from "../analytics/posthog.ts";
import {
  clearSettings,
  loadShareData,
  saveShareData,
  type CalibrationSettings,
} from "../game/settings.ts";
import { Choice } from "./Choice.tsx";

const SHARING = ["on", "off"] as const;

interface Props {
  /** The saved calibration, or null if the player has never calibrated. */
  settings: CalibrationSettings | null;
  onBack: () => void;
  onRecalibrate: () => void;
  /** Opens the live preview + sensitivity slider, seeded from `settings`. */
  onFineTune: () => void;
  /** Called after the calibration is deleted, so the router can re-check it. */
  onForget: () => void;
  /** Opens the mic and starts a tutorial run — same gate as the Play tab's own button. */
  onTutorial: () => void;
  onHowTo: () => void;
}

/**
 * The settings screen: who you are, and nothing else.
 *
 * It used to carry speed, tunnel width, demo style, motion and a link to the
 * visualiser as well. Difficulty knobs now live in the in-game pause menu,
 * where you find out you want them; the visualiser has its own section on the
 * landing page; and motion follows the OS `prefers-reduced-motion` setting
 * rather than asking a second time in different words.
 *
 * What is left is calibration — the one setting that is about the player rather
 * than the game, and the only place the numbers behind it are shown.
 */
export function Settings({
  settings,
  onBack,
  onRecalibrate,
  onFineTune,
  onForget,
  onTutorial,
  onHowTo,
}: Props) {
  const [confirmForget, setConfirmForget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seeded from the store, saved on change — the PauseOptions convention.
  const [sharing, setSharing] = useState<(typeof SHARING)[number]>(() =>
    loadShareData() ? "on" : "off",
  );

  // Both of these lead to screens that listen. iOS Safari grants getUserMedia
  // only inside the gesture, so the mic opens here rather than in the
  // destination screen's mount effect.
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
            Centred on <strong>{Math.round(settings.f0Center)} Hz</strong>,
            your speaking pitch, which sits on line 3. Reaching{" "}
            <strong>{settings.rangeSemitones} semitones</strong> above it gets
            you to line 5, and{" "}
            <strong>{settings.rangeDownSemitones} semitones</strong> below it to
            line 1.
          </p>
        ) : (
          <p className="note">
            Not calibrated yet. The game maps your voice through someone else's
            range until you do.
          </p>
        )}
        <div className="setting-actions">
          <button
            disabled={busy}
            onClick={() => void goListening(onRecalibrate)()}
          >
            {settings ? "Re-calibrate" : "Calibrate"}
          </button>
          {settings && (
            <button disabled={busy} onClick={() => void goListening(onFineTune)()}>
              Fine-tune
            </button>
          )}
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
          Re-calibrate if you've changed microphone or room. Fine-tune opens the
          live dot and a sensitivity slider, if the board feels too big or too
          small for your voice.
        </p>
      </section>

      <section className="setting">
        <h3>Anonymous game data</h3>
        <Choice
          options={SHARING}
          value={sharing}
          onChange={(v) => {
            setSharing(v);
            saveShareData(v === "on");
            // Applied now, not next run: turning this off erases the queue and
            // the anonymous id straight away rather than after one more game.
            setSharingEnabled(v === "on");
            setPostHogConsent(v === "on");
          }}
        />
        <p className="param-help">
          {sharing === "on"
            ? "Sends which gates you hit or miss and your calibration numbers, so the game can be tuned against real attempts. No audio, no recordings, no precise location (country only), and nothing that identifies you."
            : "Nothing is sent, and anything already stored on this device has been deleted."}
        </p>
      </section>

      <section className="setting">
        <h3>Playing</h3>
        <p className="param-help">
          Tunnel width and the spoken example are in the pause menu, so
          you can change them while you can feel what they do. Tap ‖ during a
          run.
        </p>
      </section>

      <section className="setting">
        <h3>Learn</h3>
        <div className="setting-actions">
          <button disabled={busy} onClick={() => void goListening(onTutorial)()}>
            Tutorial
          </button>
          <button disabled={busy} onClick={onHowTo}>
            How to play
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <button className="primary" onClick={onBack}>
        Done
      </button>
    </div>
  );
}
