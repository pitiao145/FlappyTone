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
  /** Into the visualiser — the "practise a tone with no timing pressure" shortcut. */
  onVisualiser: () => void;
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
  onVisualiser,
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

      {/* This run's score beside the personal best, as a matched pair of
          cards. The best is the Pip's beak-gold plaque; a fresh record fills
          it solid and sweeps a one-shot shine (reduced-motion safe — App.css). */}
      <div className="gameover-scores">
        <div className="scorecard scorecard-you">
          <span className="scorecard-label">Your score</span>
          <span className="scorecard-value">{stats.score}</span>
        </div>
        <div className={`scorecard scorecard-best${isNewBest ? " is-new" : ""}`}>
          <span className="scorecard-label">
            {isNewBest ? "★ New best" : "Personal best"}
          </span>
          <span className="scorecard-value">{history.bestScore}</span>
        </div>
      </div>

      <p className="note">best multiplier ×{stats.bestMultiplier}</p>

      <div className="pause-accuracy gameover-accuracy">
        <p className="pause-accuracy-label">This run · tone accuracy</p>
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
            </div>
          ))}
        </div>
      </div>

      {/* The one-line recap. Its own copy already names the weak tone and what
          to fix, so the per-tone cards above stay purely numeric. */}
      <p className="prompt">{takeaway(breakdown)}</p>

      {/* Two shortcuts out of a bad run: practise the shape with no timing
          pressure (visualiser), or widen the board if a tone felt out of
          reach (fine-tune). Fine-tune is hidden while the data-driven
          suggestion card below is offering, so calibration isn't prompted
          twice at once. */}
      <div className="gameover-ctas">
        <div className="gameover-cta-block">
          <p className="note">Not getting the hang of a tone?</p>
          <button
            type="button"
            className="primary gameover-cta"
            onClick={onVisualiser}
          >
            Practise it in the visualiser
          </button>
        </div>
        {settings && !(suggestion && !dismissed && !applied) && (
          <div className="gameover-cta-block">
            <p className="note">Did some tones feel too hard to reach?</p>
            <button
              type="button"
              className="primary gameover-cta"
              onClick={onFineTune}
            >
              Fine-tune your calibration
            </button>
          </div>
        )}
      </div>

      {applied && (
        <div className="recal-card recal-applied">
          <p>Calibration updated. The new range applies from your next run.</p>
        </div>
      )}
      {suggestion && !dismissed && !applied && (
        <div className="recal-card">
          <p>
            {suggestionIsFirst
              ? "We personalised your grid even further. Want to update your calibration?"
              : "Your range in this run looked different from your calibration. Update it?"}
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
