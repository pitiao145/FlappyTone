/**
 * Dev-only persistence for the per-gate diagnostics (spec A2).
 *
 * The log lives in the Run, which dies with the run — so the numbers vanished
 * at exactly the moment anyone wanted to read them. This mirrors it into
 * localStorage on every gate, so it survives game over, quitting, and a reload,
 * and can be copied out as text.
 *
 * Dev builds only. No gameplay depends on any of this.
 */

import type { GateLogEntry } from "../game/run.ts";

const KEY = "flappytone.gatelog";

/**
 * `import.meta.env.DEV`, and nothing else.
 *
 * Vite substitutes it with a literal `false` in a production build, so every
 * `GATE_LOG_ENABLED &&` guard downstream becomes dead code Rollup can drop —
 * which is what keeps the panel out of `dist/` rather than merely hidden in it.
 * That substitution is the whole boundary (CLAUDE.md rule 7).
 *
 * There was also a `?gatelog` query param, and it was never load-bearing: a
 * query flag hides, it does not remove. All it achieved was gating the
 * *writing* as well as the reading, so the Lab's gates tab opened on an empty
 * panel with no way to tell that from a run that logged nothing.
 */
export const GATE_LOG_ENABLED = import.meta.env.DEV;

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
    "#   tone  outcome      acc  voiced/total  voiced%  utteranceMs  seeded  worstExcursionMs",
  ].join("\n");

  const rows = entries.map((g, i) => {
    const n = String(i + 1).padStart(3);
    const voiced = `${g.voiced}/${g.samples}`.padStart(12);
    const frac = `${Math.round(g.voicedFraction * 100)}%`.padStart(7);
    const utt = `${Math.round(g.utteranceMs)}`.padStart(11);
    const exc = `${Math.round(g.worstExcursionMs ?? 0)}`.padStart(16);
    // Blank rather than 0.00 for an unheard gate: it was never scored, and a
    // printed zero reads as "you were badly wrong" — the exact thing PRD §6
    // says the game must never tell a player.
    const acc = (g.outcome === "unheard" ? "—" : g.accuracy.toFixed(2)).padStart(
      5,
    );
    return `${n}   T${g.tone}    ${g.outcome.padEnd(9)}  ${acc}  ${voiced}  ${frac}  ${utt}  ${String(g.seeded).padStart(6)}  ${exc}`;
  });

  return [header, ...rows].join("\n");
}
