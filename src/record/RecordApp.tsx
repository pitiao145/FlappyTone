/**
 * Shell for the recording booth: passcode, then the mic gesture, then the words.
 *
 * The passcode is checked *before* the mic opens, so a wrong code fails at the
 * door rather than after her first take has already been recorded and rejected
 * by the upload endpoint.
 *
 * The mic is opened inside the click handler (CLAUDE.md rule 4) — iOS Safari
 * grants `getUserMedia` and `AudioContext.resume()` only within a user gesture,
 * and doing it in a mount effect is the silent failure that costs a session.
 */
import { useState } from "react";
import { ensureMic } from "../audio/session.ts";
import { MicError } from "../audio/mic.ts";
import { Recorder } from "./Recorder.tsx";

type Phase = "passcode" | "ready" | "recording";

const MIC_COPY: Record<string, string> = {
  "permission-denied":
    "The browser blocked the microphone. Allow it for this site in the address bar, then tap again.",
  "no-microphone": "No microphone found. If you have headphones plugged in, try unplugging them.",
  "no-audioworklet": "This browser is too old to record here — try Safari or Chrome.",
  unknown: "The microphone didn't start. Reload the page and try once more.",
};

export function RecordApp() {
  const [phase, setPhase] = useState<Phase>("passcode");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submitPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "x-record-passcode": passcode },
      });
      if (res.ok) setPhase("ready");
      else setError("That code isn't right. Check the message Pierre sent you.");
    } catch {
      setError("Couldn't reach the server. Are you online?");
    } finally {
      setChecking(false);
    }
  };

  // Synchronous entry into ensureMic: awaiting anything first would leave the
  // gesture and iOS would refuse.
  const start = () => {
    setError(null);
    ensureMic().then(
      () => setPhase("recording"),
      (err: unknown) => {
        const kind = err instanceof MicError ? err.kind : "unknown";
        setError(MIC_COPY[kind] ?? MIC_COPY.unknown);
      },
    );
  };

  if (phase === "recording") return <Recorder passcode={passcode} />;

  return (
    <div className="rec rec-gate">
      <h1 className="rec-title">Recording booth</h1>

      {phase === "passcode" ? (
        <form onSubmit={submitPasscode}>
          <p className="rec-sub">Enter the code Pierre gave you.</p>
          <input
            className="rec-input"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="code"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="rec-btn rec-btn-primary" disabled={checking || !passcode}>
            {checking ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <>
          <p className="rec-sub">
            Somewhere quiet, phone about a hand's width from your mouth. You'll see one word at a
            time — just say it, and it moves on by itself.
          </p>
          <button className="rec-btn rec-btn-primary" onClick={start}>
            Tap to start
          </button>
        </>
      )}

      {error && <p className="rec-warn">{error}</p>}
    </div>
  );
}
