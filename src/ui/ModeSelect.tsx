import { useState } from "react";
import { inventoryNow } from "../audio/inventory.ts";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { TONE_INFO, type Tone } from "../game/gates.ts";
import { availableTones } from "../game/words.ts";
import type { PlayIntent } from "./PlayHome.tsx";
import { micErrorCopy } from "./micErrors.ts";

const ALL_TONES: Tone[] = [1, 2, 3, 4];

interface Props {
  /** An error raised elsewhere (e.g. a failed Retry) — shown alongside any error of this screen's own. */
  error: string | null;
  /** Called once the mic is open, exactly like PlayHome's onStart. */
  onStart: (intent: PlayIntent, opts?: { drillTone?: Tone }) => void;
  onBack: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The Modes picker: Classic (today's random-tone run, offered here for
 * symmetry with Play), Tone Drill (every gate is one chosen tone), and Learn
 * (hum along with the sine demo — see Game.tsx's forceSynth wiring — no
 * pronunciation required). Two steps at most: pick a mode, then — only for
 * Drill — pick a tone. Mirrors PlayHome's own "open the mic inside the click
 * handler, then hand off" pattern, since this tap is the iOS gesture that has
 * to carry `ensureMic()`.
 */
export function ModeSelect({ error: externalError, onStart, onBack, canvasWidth, canvasHeight }: Props) {
  const [step, setStep] = useState<"mode" | "tone">("mode");
  const [ownError, setOwnError] = useState<string | null>(null);
  const [pending, setPending] = useState<PlayIntent | null>(null);
  const busy = pending !== null;
  const error = ownError ?? externalError;

  // Whatever the manifest fetch has produced by now. Empty (not yet loaded)
  // means "don't know yet" — offer all four rather than greying every tile.
  const words = inventoryNow();
  const tones = words && words.length ? availableTones(words) : ALL_TONES;

  const go = (intent: PlayIntent, drillTone?: Tone) => async () => {
    if (busy) return;
    setPending(intent);
    setOwnError(null);
    try {
      await ensureMic();
      onStart(intent, drillTone !== undefined ? { drillTone } : undefined);
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setOwnError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="screen playhome-overlay">
          <h1>Modes</h1>

          {step === "mode" && (
            <>
              <p className="note">Pick how you want to play.</p>
              <div className="menu playhome-menu">
                <button className="primary" disabled={busy} onClick={go("game")}>
                  {pending === "game" ? "Opening mic…" : "Classic"}
                </button>
                <button disabled={busy} onClick={() => setStep("tone")}>
                  Tone Drill
                </button>
                <button disabled={busy} onClick={go("learn")}>
                  {pending === "learn" ? "Opening mic…" : "Learn"}
                </button>
              </div>
              <p className="note">
                Tone Drill: every gate is one tone you pick, for focused
                practice. Learn: hum along with the demo's shape — no
                pronunciation, no daily-run cost.
              </p>
            </>
          )}

          {step === "tone" && (
            <>
              <p className="note">Which tone do you want to drill?</p>
              <div className="choice">
                {ALL_TONES.map((tone) => {
                  const disabled = !tones.includes(tone) || busy;
                  return (
                    <button
                      key={tone}
                      className="choice-option"
                      disabled={disabled}
                      onClick={go("drill", tone)}
                    >
                      {pending === "drill" ? "…" : `${tone} · ${TONE_INFO[tone].pinyin}`}
                    </button>
                  );
                })}
              </div>
              <button disabled={busy} onClick={() => setStep("mode")}>
                Back
              </button>
            </>
          )}

          {error && <p className="error">{error}</p>}

          {step === "mode" && (
            <button disabled={busy} onClick={onBack}>
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
