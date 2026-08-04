import { useState } from "react";
import { formatGateLog, GATE_LOG_ENABLED, loadGateLog } from "./gateLog.ts";

/**
 * The full per-gate diagnostics for the last run (spec A2), as selectable text
 * with a copy button. Read from localStorage rather than a live snapshot, so a
 * run ended by quitting — or by closing the tab — still shows its numbers.
 *
 * Renders nothing unless `?gatelog` is set.
 */
export function GateLogPanel() {
  const [log] = useState(() => loadGateLog());
  const [copied, setCopied] = useState(false);
  if (!GATE_LOG_ENABLED || !log) return null;

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
