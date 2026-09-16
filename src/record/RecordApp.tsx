/**
 * Shell for the recording booth: the passcode, and then the booth itself.
 *
 * The passcode is checked *before* anything else, so a wrong code fails at the
 * door rather than after her first take has already been recorded and rejected
 * by the upload endpoint.
 *
 * Nothing here touches the microphone any more. It used to: a "Tap to start"
 * screen opened the mic and dropped straight into a live recorder, so the
 * screen that told Jane to get ready was the screen that was already
 * recording. `Overview.tsx` now sits in between, and arms the mic from its own
 * click handlers (CLAUDE.md hard rule 4 — the gesture has to be the one that
 * calls `ensureMic`).
 */
import { useState } from "react";
import { Overview } from "./Overview.tsx";
import { requireRecordBaseUrl } from "./boothWords.ts";

export function RecordApp() {
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submitPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    let baseUrl: string;
    try {
      baseUrl = requireRecordBaseUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording isn't configured — tell Pierre.");
      setChecking(false);
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/auth`, {
        method: "GET",
        headers: { "x-record-passcode": passcode },
      });
      // Only 401 means the code is wrong. Reporting every failure as a bad
      // code sent Jane — and the person who built this — hunting for a typo
      // while the server was returning 500 on every request.
      if (res.ok) setUnlocked(true);
      else if (res.status === 401) {
        setError("That code isn't right. Check the message Pierre sent you.");
      } else if (res.status === 503) {
        setError("Recording isn't switched on yet. Tell Pierre — it's his end, not yours.");
      } else {
        setError(`Something broke on the server (${res.status}). Not your fault — tell Pierre.`);
      }
    } catch {
      setError("Couldn't reach the server. Are you online?");
    } finally {
      setChecking(false);
    }
  };

  if (unlocked) return <Overview passcode={passcode} />;

  return (
    <div className="rec rec-gate">
      <h1 className="rec-title">Recording booth</h1>

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

      {error && <p className="rec-warn">{error}</p>}
    </div>
  );
}
