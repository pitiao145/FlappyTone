import { useMemo, useState } from "react";
import { takeaway, toneBreakdown, type RunStats } from "../game/scoring.ts";
import { loadRunHistory } from "../game/runHistory.ts";
import { GateLogPanel } from "../dev/GateLogPanel.tsx";
import { track } from "../analytics/client.ts";
import { saveSettings, type CalibrationSettings } from "../game/settings.ts";
import type { RangeHalves } from "../pitch/calibration.ts";
import { ToneMarkIcon } from "./toneIcons.tsx";

interface Props {
  stats: RunStats;
  /** True while the mic is reopening — stops a second Retry racing the first. */
  busy: boolean;
  onRetry: () => void;
  onHome: () => void;
  /** Into the fine-tune flow — for the "some tones felt out of reach?" shortcut. */
  onFineTune: () => void;
  settings: CalibrationSettings | null;
  /**
   * What to offer, already decided by `App.tsx` from the windowed,
   * multi-run average — see `recalibration.ts`. `null` means don't show the
   * card at all, whether because the window isn't full yet or because the
   * average was within threshold.
   */
  suggestion: RangeHalves | null;
  /** True for the first offer (after the first game) — friendlier "personalised" copy. */
  suggestionIsFirst?: boolean;
  onRecalibrate: (s: CalibrationSettings) => void;
}

export function GameOver({
  stats,
  busy,
  onRetry,
  onHome,
  onFineTune,
  settings,
  suggestion,
  suggestionIsFirst = false,
  onRecalibrate,
}: Props) {
  const breakdown = toneBreakdown(stats);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  // Read once on mount. GameApp's onRunOver has already called recordRun()
  // synchronously before routing here, so bestScore includes this run — a new
  // record shows as score === bestScore.
  const history = useMemo(() => loadRunHistory(), []);
  const isNewBest = stats.score > 0 && stats.score >= history.bestScore;

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

      {/* The personal best, treated as an earned record — a gold plaque in the
          Pip's own beak-gold. A fresh record fills it solid and sweeps a
          one-shot shine (reduced-motion safe, see App.css). */}
      <div className={`highscore${isNewBest ? " highscore-new" : ""}`}>
        <span className="highscore-seal" aria-hidden>
          ★
        </span>
        <span className="highscore-body">
          <span className="highscore-label">
            {isNewBest ? "New best" : "Personal best"}
          </span>
          <span className="highscore-value">{history.bestScore}</span>
        </span>
      </div>

      <div className="pause-accuracy gameover-accuracy">
        <p className="pause-accuracy-label">This run — tone accuracy</p>
        <div className="pause-accuracy-grid">
          {breakdown.map((b) => (
            <div className="pause-tone-card" key={b.tone}>
              <ToneMarkIcon tone={b.tone} className="pause-tone-icon" />
              <div className="pause-tone-bar">
                <div
                  className="pause-tone-bar-fill"
                  style={{ width: `${Math.round(b.pct ?? 0)}%` }}
                />
              </div>
              <span className="pause-tone-pct">
                {b.pct === null ? "—" : `${Math.round(b.pct)}%`}
              </span>
              {b.unheard > 0 && (
                <span className="pause-tone-note">couldn't hear ×{b.unheard}</span>
              )}
              {b.mismatched > 0 && (
                <span className="pause-tone-note">
                  sounded like T{b.mismatchedAsMostly}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="prompt">{takeaway(breakdown)}</p>

      {/* A manual way into fine-tuning, distinct from the data-driven
          `suggestion` card below — hidden while that card is offering, so the
          player isn't shown two calibration prompts at once. */}
      {settings && !(suggestion && !dismissed && !applied) && (
        <div className="gameover-finetune">
          <p className="note">Did some tones feel too hard to reach?</p>
          <button type="button" className="finetune-button" onClick={onFineTune}>
            Fine-tune your calibration
          </button>
        </div>
      )}

      {applied && (
        <div className="recal-card recal-applied">
          <p>Calibration updated — the new range applies from your next run.</p>
        </div>
      )}
      {suggestion && !dismissed && !applied && (
        <div className="recal-card">
          <p>
            {suggestionIsFirst
              ? "We personalised your grid even further — want to update your calibration?"
              : "Your range in this run looked different from your calibration — update it?"}
          </p>
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
