import { useState } from "react";
import { formatGateLog, GATE_LOG_ENABLED, loadGateLog } from "./gateLog.ts";

/**
 * The full per-gate diagnostics for the last run (spec A2), as selectable text
 * with a copy button. Read from localStorage rather than a live snapshot, so a
 * run ended by quitting — or by closing the tab — still shows its numbers.
 *
 * Dev builds only; see GATE_LOG_ENABLED.
 */
export function GateLogPanel() {
  const [log] = useState(() => loadGateLog());
  const [copied, setCopied] = useState(false);
  if (!GATE_LOG_ENABLED) return null;
  if (!log) {
    return (
      <p className="param-help">
        No run logged yet. Fly one in the play tab and come back — the log
        survives a quit, a game over and a reload.
      </p>
    );
  }

  const text = formatGateLog(log);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context; the textarea is selectable anyway.
      setCopied(false);
    }
  };

  return (
    <div className="gate-log-panel">
      <button onClick={() => void copy()}>
        {copied ? "copied" : "copy gate log"}
      </button>
      <textarea readOnly value={text} onFocus={(e) => e.target.select()} />
    </div>
  );
}
