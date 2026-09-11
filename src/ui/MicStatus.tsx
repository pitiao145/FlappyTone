// A small in-run indicator for a lost/recovering mic (Fix B of
// docs/flappytone-SPEC-ios-audio-routing.md). An OS interruption can leave the
// mic deaf while permission still reads as granted; without a visible signal
// the player just sees the bird stop responding. This makes the state legible
// and — per hard rule 8 — the game reads neutral, not failed, while it is up.
import { useEffect, useState } from "react";
import {
  getMicStatus,
  type MicStatus,
  subscribeMicStatus,
} from "../audio/session.ts";

export function useMicStatus(): MicStatus {
  const [status, setStatus] = useState<MicStatus>(getMicStatus);
  useEffect(() => subscribeMicStatus(setStatus), []);
  return status;
}

/**
 * Renders nothing while the mic is healthy (or idle). Shows a quiet banner
 * while recovering, and a clearer prompt if recovery has not yet succeeded.
 */
export function MicStatusBanner(): React.ReactElement | null {
  const status = useMicStatus();
  if (status === "live" || status === "idle") return null;
  const recovering = status === "recovering";
  return (
    <div className="mic-status" role="status" aria-live="polite">
      <span className="mic-status__dot" data-recovering={recovering} />
      {recovering
        ? "Reconnecting the mic…"
        : "Mic interrupted — reconnecting. If it stays stuck, reopen the app."}
    </div>
  );
}
