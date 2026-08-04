/**
 * Dev-only persistence for the per-gate diagnostics (spec A2).
 *
 * The log lives in the Run, which dies with the run — so the numbers vanished
 * at exactly the moment anyone wanted to read them. This mirrors it into
 * localStorage on every gate, so it survives game over, quitting, and a reload,
 * and can be copied out as text.
 *
 * Opt-in via `?gatelog`. No gameplay depends on any of this.
 */

import type { GateLogEntry } from "../game/run.ts";

const KEY = "flappytone.gatelog";

export const GATE_LOG_ENABLED =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("gatelog");

export interface StoredGateLog {
  entries: GateLogEntry[];
  missedUtterances: number;
  /** ISO time the run's last gate resolved — distinguishes stale logs. */
  savedAt: string;
}

export function saveGateLog(
  entries: GateLogEntry[],
  missedUtterances: number,
): void {
  if (!GATE_LOG_ENABLED || entries.length === 0) return;
  try {
    const payload: StoredGateLog = {
      entries,
      missedUtterances,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private browsing / quota. Diagnostics are never worth breaking a run for.
  }
}

export function loadGateLog(): StoredGateLog | null {
  if (!GATE_LOG_ENABLED) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGateLog;
    return Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGateLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** One line per gate, plus a summary header. Plain text, made to be pasted. */
export function formatGateLog(log: StoredGateLog): string {
  const { entries, missedUtterances } = log;
  const unheard = entries.filter((g) => g.outcome === "unheard").length;
  const pct = entries.length === 0 ? 0 : (unheard / entries.length) * 100;
  const seeded = entries.filter((g) => g.seeded > 0).length;

  const header = [
    `gates=${entries.length}  unheard=${unheard} (${pct.toFixed(0)}%)`,
    `seeded=${seeded}  missedEarly=${missedUtterances}`,
    `savedAt=${log.savedAt}`,
    "",
    "#   tone  outcome    voiced/total  voiced%  utteranceMs  seeded",
  ].join("\n");

  const rows = entries.map((g, i) => {
    const n = String(i + 1).padStart(3);
    const voiced = `${g.voiced}/${g.samples}`.padStart(12);
    const frac = `${Math.round(g.voicedFraction * 100)}%`.padStart(7);
    const utt = `${Math.round(g.utteranceMs)}`.padStart(11);
    return `${n}   T${g.tone}    ${g.outcome.padEnd(9)}  ${voiced}  ${frac}  ${utt}  ${String(g.seeded).padStart(6)}`;
  });

  return [header, ...rows].join("\n");
}
