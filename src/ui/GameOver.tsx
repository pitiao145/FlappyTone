import { useEffect, useMemo, useState } from "react";
import { takeaway, toneBreakdown, type RunStats } from "../game/scoring.ts";
import { loadRunHistory } from "../game/runHistory.ts";
import { loadDailyRuns } from "../game/dailyLimit.ts";
import { hasShownFeedbackToday, markFeedbackShown } from "../game/runFeedback.ts";
import type { RunMode } from "../game/run.ts";
import { GateLogPanel } from "../dev/GateLogPanel.tsx";
import { track } from "../analytics/client.ts";
import { displayName, hasJoined, joinBoard, submitScore } from "../data/leaderboard.ts";
import { JoinBoardModal } from "./JoinBoardModal.tsx";
import type { AnalyticsEvent } from "../analytics/session.ts";
import { saveSettings, type CalibrationSettings } from "../game/settings.ts";
import type { RangeHalves } from "../pitch/calibration.ts";
import { ToneMarkIcon } from "./toneIcons.tsx";
import { ShareIcon } from "./icons.tsx";
import { renderShareCard } from "../share/renderCard.ts";
import { downloadShareCard, shareRunResult } from "../share/share.ts";

type RunFeedbackSentiment = Extract<AnalyticsEvent, { type: "run_feedback" }>["sentiment"];

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
  /** The RunMode of the run that just ended — carried on the `run_feedback` event. */
  mode: RunMode;
  /** The target this run was chasing, if it arrived via a `?c=<score>` challenge link. */
  challengeScore: number | null;
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
  mode,
  challengeScore,
}: Props) {
  const breakdown = toneBreakdown(stats);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  // Read once on mount. GameApp's onRunOver has already called recordRun()
  // synchronously before routing here, so bestScore includes this run — a new
  // record shows as score === bestScore.
  const history = useMemo(() => loadRunHistory(), []);
  const isNewBest = stats.score > 0 && stats.score >= history.bestScore;

  /**
   * Read once on mount, same rationale as `history` above: GameApp's
   * onRunOver has already run before routing here, so `loadDailyRuns().count`
   * reflects this run — `dailyLimit.ts` increments at run *start*, not end.
   * No mutual suppression with the recal-suggestion card below: both can
   * show at once, deliberately (see docs/flappytone-SPEC-run-feedback.md).
   */
  const feedbackEligible = useMemo(
    () => loadDailyRuns().count >= 3 && !hasShownFeedbackToday(),
    [],
  );
  /**
   * The weekly board.
   *
   * A player already on the board gets every scored run sent up silently —
   * `api/score.ts` keeps only their best, so a worse run costs nothing. A
   * player who hasn't joined is *offered* the board, and only on a personal
   * best: it is the moment the offer means something, and it keeps the modal
   * from reappearing after every run the way an unconditional prompt would.
   * Because a first scored run is always a personal best, nobody misses the
   * offer entirely, and a later best brings it back for anyone who declined.
   *
   * None of this can break the end screen — every call below resolves rather
   * than throwing, and the screen renders identically if they all fail.
   */
  const [joinOffer, setJoinOffer] = useState(false);
  const [joining, setJoining] = useState(false);
  // Dev builds only: why the last submission didn't land. A player is never
  // shown this — a failed score costs them nothing and there is nothing they
  // could do about it — but without it on screen, a misconfigured local server
  // looks exactly like a working one.
  const [boardError, setBoardError] = useState<string | null>(null);
  const boardName = useMemo(() => displayName(), []);
  const boardEligible = mode === "game" && stats.score > 0;

  useEffect(() => {
    if (!boardEligible) return;
    let live = true;
    void (async () => {
      // `src/data/` promises never to throw, and this catch is the belt to
      // that module's braces. The promise is only as good as every line
      // inside it — a broken import or a logger that fails takes the whole
      // function down with it, and an unhandled rejection here would be an
      // error on the end screen of a run the player just finished. The
      // leaderboard is never worth that.
      try {
        const joined = await hasJoined();
        if (!live) return;
        if (joined) {
          const result = await submitScore(stats.score);
          if (!live) return;
          track({ type: "score_submitted", score: stats.score, is_best: isNewBest, ok: result.ok });
          if (!result.ok) setBoardError(result.reason);
        } else if (isNewBest) {
          setJoinOffer(true);
          track({ type: "join_board_shown", score: stats.score });
        }
      } catch (err) {
        if (live) setBoardError(String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [boardEligible, stats.score, isNewBest]);

  const acceptJoin = async () => {
    setJoining(true);
    // Same belt as the effect above: whatever happens, the modal closes and
    // the end screen stays intact.
    try {
      const joined = await joinBoard();
      const result = joined
        ? await submitScore(stats.score)
        : ({ ok: false, reason: "could not create the profile row" } as const);
      track({ type: "join_board_submitted", accepted: true, joined, ok: result.ok });
      if (joined) {
        track({ type: "score_submitted", score: stats.score, is_best: isNewBest, ok: result.ok });
      }
      if (!result.ok) setBoardError(result.reason);
    } catch (err) {
      setBoardError(String(err));
    }
    setJoining(false);
    setJoinOffer(false);
  };

  const declineJoin = () => {
    track({ type: "join_board_submitted", accepted: false, joined: false, ok: false });
    setJoinOffer(false);
  };

  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<RunFeedbackSentiment | null>(null);

  const FEEDBACK_THANKS_MS = 1500;
  useEffect(() => {
    if (feedbackSentiment === null) return;
    const id = setTimeout(() => setFeedbackDismissed(true), FEEDBACK_THANKS_MS);
    return () => clearTimeout(id);
  }, [feedbackSentiment]);

  const chooseFeedback = (sentiment: RunFeedbackSentiment) => {
    track({ type: "run_feedback", sentiment, mode });
    markFeedbackShown();
    setFeedbackSentiment(sentiment);
  };

  const dismissFeedback = () => {
    // No track() — dismissing without answering fires nothing, per spec.
    markFeedbackShown();
    setFeedbackDismissed(true);
  };

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

  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const onShare = async () => {
    if (shareBusy) return;
    // Fired before the share sheet opens (or the card even renders) — a
    // cancelled share still counts as intent, per the spec.
    track({ type: "share_clicked", mode, score: stats.score, is_best: isNewBest });
    setShareBusy(true);
    setShareCopied(false);
    try {
      const blob = await renderShareCard(stats, history);
      const outcome = await shareRunResult(stats, blob);
      if (outcome === "copied") {
        setShareCopied(true);
        if (!navigator.share) downloadShareCard(blob, stats.score);
      }
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="screen gameover-screen">
      <h2>Run over</h2>

      {challengeScore != null && (
        <p className="prompt">
          {stats.score >= challengeScore
            ? `You beat it! 🎉 (target ${challengeScore.toLocaleString()})`
            : `So close — ${challengeScore.toLocaleString()} to beat. Retry?`}
        </p>
      )}

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

      <div className="gameover-share-block">
        <button
          type="button"
          className="gameover-share"
          disabled={shareBusy}
          onClick={() => void onShare()}
        >
          <ShareIcon />
          {shareBusy ? "Sharing…" : "Share and challenge your friends!"}
        </button>
        {shareCopied && <p className="note">Copied to clipboard!</p>}
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

      {feedbackEligible && !feedbackDismissed && (
        <div className="feedback-card">
          <button
            type="button"
            className="feedback-close"
            aria-label="Dismiss"
            onClick={dismissFeedback}
          >
            ✕
          </button>
          {feedbackSentiment === null ? (
            <>
              <p>How&rsquo;s it feeling?</p>
              <div className="feedback-chips">
                <button
                  type="button"
                  className="feedback-chip"
                  onClick={() => chooseFeedback("great")}
                >
                  🎯 Felt great
                </button>
                <button
                  type="button"
                  className="feedback-chip"
                  onClick={() => chooseFeedback("calib_off")}
                >
                  🎙️ Calibration felt off
                </button>
                <button
                  type="button"
                  className="feedback-chip"
                  onClick={() => chooseFeedback("too_easy")}
                >
                  😴 Too easy
                </button>
                <button
                  type="button"
                  className="feedback-chip"
                  onClick={() => chooseFeedback("too_hard")}
                >
                  💥 Too hard
                </button>
              </div>
              <p className="feedback-mailto">
                <a href="mailto:pierre@pierrebuilds.dev">Anything else you'd like to add or any suggestions? Feel free to email me →</a>
              </p>
            </>
          ) : (
            <p>thanks!</p>
          )}
        </div>
      )}

      {/* Guarded here as well as inside the panel: the internal guard hides it,
          this one lets Rollup drop the component from the production bundle
          entirely (CLAUDE.md rule 7). */}
      {import.meta.env.DEV && <GateLogPanel />}

      {/* Gated here rather than inside a component so Rollup drops it, same as
          the panel above. Players never see a failed submission. */}
      {import.meta.env.DEV && boardError && (
        <p className="error">Leaderboard (dev only): {boardError}</p>
      )}

      <div className="menu">
        <button className="primary" disabled={busy} onClick={onRetry}>
          {busy ? "Starting…" : "Retry"}
        </button>
        <button onClick={onHome}>Home</button>
      </div>

      {joinOffer && (
        <JoinBoardModal
          name={boardName}
          busy={joining}
          onJoin={acceptJoin}
          onDismiss={declineJoin}
        />
      )}
    </div>
  );
}
