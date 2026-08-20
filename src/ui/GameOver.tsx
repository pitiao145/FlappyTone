import { useState } from "react";
import { takeaway, toneBreakdown, type RunStats } from "../game/scoring.ts";
import { GateLogPanel } from "../dev/GateLogPanel.tsx";
import { track } from "../analytics/client.ts";
import { saveSettings, type CalibrationSettings } from "../game/settings.ts";
import type { RangeHalves } from "../pitch/calibration.ts";

interface Props {
  stats: RunStats;
  /** True while the mic is reopening — stops a second Retry racing the first. */
  busy: boolean;
  onRetry: () => void;
  onHome: () => void;
  settings: CalibrationSettings | null;
  /**
   * What to offer, already decided by `App.tsx` from the windowed,
   * multi-run average — see `recalibration.ts`. `null` means don't show the
   * card at all, whether because the window isn't full yet or because the
   * average was within threshold.
   */
  suggestion: RangeHalves | null;
  onRecalibrate: (s: CalibrationSettings) => void;
}

export function GameOver({
  stats,
  busy,
  onRetry,
  onHome,
  settings,
  suggestion,
  onRecalibrate,
}: Props) {
  const breakdown = toneBreakdown(stats);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);

  const applySuggestion = () => {
    if (!settings || !suggestion) return;
    const next: CalibrationSettings = {
      ...settings,
      rangeSemitones: suggestion.up,
      rangeDownSemitones: suggestion.down,
    };
    saveSettings(next);
    onRecalibrate(next);
    setApplied(true);
    track({ type: "recal_resolved", outcome: "accepted" });
  };

  const dismissSuggestion = () => {
    setDismissed(true);
    track({ type: "recal_resolved", outcome: "dismissed" });
  };

  return (
    <div className="screen gameover-screen">
      <h2>Run over</h2>
      <p className="score-big">{stats.score}</p>
      <p className="note">best multiplier ×{stats.bestMultiplier}</p>

      <div className="breakdown">
        {breakdown.map((b) => (
          <div className="breakdown-row" key={b.tone}>
            <span className="syllable">Tone {b.tone}</span>
            <span className="bar">
              <span
                className="bar-fill"
                style={{ width: `${b.pct ?? 0}%` }}
                aria-hidden
              />
            </span>
            <span className="pct">
              {b.pct === null ? "—" : `${Math.round(b.pct)}%`}
            </span>
            {b.unheard > 0 && (
              <span className="unheard">couldn't hear ×{b.unheard}</span>
            )}
          </div>
        ))}
      </div>

      <p className="prompt">{takeaway(breakdown)}</p>

      {applied && (
        <div className="recal-card recal-applied">
          <p>Calibration updated — the new range applies from your next run.</p>
        </div>
      )}
      {suggestion && !dismissed && !applied && (
        <div className="recal-card">
          <p>Your range in this run looked different from your calibration — update it?</p>
          <div className="recal-actions">
            <button className="primary" onClick={applySuggestion}>
              Update
            </button>
            <button onClick={dismissSuggestion}>Not now</button>
          </div>
        </div>
      )}

      {/* Guarded here as well as inside the panel: the internal guard hides it,
          this one lets Rollup drop the component from the production bundle
          entirely (CLAUDE.md rule 7). */}
      {import.meta.env.DEV && <GateLogPanel />}

      <div className="menu">
        <button className="primary" disabled={busy} onClick={onRetry}>
          {busy ? "Starting…" : "Retry"}
        </button>
        <button onClick={onHome}>Home</button>
      </div>
    </div>
  );
}
