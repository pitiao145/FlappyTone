import { useEffect, useMemo, useState } from "react";
import {
  MIN_SCORED_GATES_FOR_TAKEAWAY,
  takeaway,
  toneBreakdown,
  type RunStats,
} from "../game/scoring.ts";
import { loadRunHistory } from "../game/runHistory.ts";
import { loadDailyRuns } from "../game/dailyLimit.ts";
import { hasShownFeedbackToday, markFeedbackShown } from "../game/runFeedback.ts";
import type { RunMode } from "../game/run.ts";
import { GateLogPanel } from "../dev/GateLogPanel.tsx";
import { track } from "../analytics/client.ts";
import {
  displayName,
  getBoard,
  hasJoined,
  joinBoard,
  myUserId,
  submitScore,
  type Board,
} from "../data/leaderboard.ts";
import { JoinBoardModal } from "./JoinBoardModal.tsx";
import { Leaderboard } from "./Leaderboard.tsx";
import type { AnalyticsEvent } from "../analytics/session.ts";
import { saveSettings, type CalibrationSettings } from "../game/settings.ts";
import type { RangeHalves } from "../pitch/calibration.ts";
import { ToneMarkIcon, TONE_SHORT_LABEL } from "./toneIcons.tsx";
import { ShareIcon } from "./icons.tsx";
import { renderShareCard } from "../share/renderCard.ts";
import { downloadShareCard, shareRunResult } from "../share/share.ts";

type RunFeedbackSentiment = Extract<AnalyticsEvent, { type: "run_feedback" }>["sentiment"];

interface Props {
  stats: RunStats;
  /** True while the mic is reopening — stops a second Retry racing the first. */
  busy: boolean;
  onRetry: () => void;
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
   * The weak tone the coach card is about — the same entry `takeaway()`
   * names, picked by the same eligibility rule, so the card's headline and
   * its body can never disagree. `null` means no tone had enough scored
   * gates to judge, and the card doesn't render at all.
   */
  const weakest = useMemo(() => {
    const eligible = breakdown.filter(
      (b): b is typeof b & { pct: number } =>
        b.pct !== null && b.gates >= MIN_SCORED_GATES_FOR_TAKEAWAY,
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((min, b) => (b.pct < min.pct ? b : min));
  }, [breakdown]);

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
  const [joined, setJoined] = useState(false);
  /**
   * A snapshot of this week's board, used for the two rank lines the slot
   * shows: the joined player's "#N of M", and the projected "would put you at
   * #R" on the CTA and in the join modal. Purely decorative — every use is
   * conditional on it being non-null, so a failed fetch simply drops the
   * line rather than changing what the slot does.
   */
  const [board, setBoard] = useState<Board | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
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
        const alreadyJoined = await hasJoined();
        if (!live) return;
        setJoined(alreadyJoined);
        if (alreadyJoined) {
          const result = await submitScore(stats.score);
          if (!live) return;
          track({ type: "score_submitted", score: stats.score, is_best: isNewBest, ok: result.ok });
          if (!result.ok) setBoardError(result.reason);
        } else if (isNewBest) {
          setJoinOffer(true);
          track({ type: "join_board_shown", score: stats.score });
        }
        // Fetched last so a joined player's freshly-submitted score is
        // already in the numbers we read back. Its own try/catch: losing the
        // board costs a rank line, never the screen.
        try {
          const [b, id] = await Promise.all([getBoard(), myUserId()]);
          if (!live) return;
          setBoard(b);
          setUserId(id);
        } catch {
          /* No rank lines this run. Nothing else depends on it. */
        }
      } catch (err) {
        if (live) setBoardError(String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [boardEligible, stats.score, isNewBest]);

  /** "Posting N would land you around #R of M" — omitted entirely without a board. */
  const projected = useMemo(() => {
    if (!board) return null;
    return {
      points: stats.score,
      rank: board.rows.filter((r) => r.score > stats.score).length + 1,
      // +1: they aren't on the board yet, and joining makes them a player on it.
      total: board.total + 1,
    };
  }, [board, stats.score]);

  /** How far off the top 5 a joined player is, or null when it isn't knowable. */
  const topFiveGap = useMemo(() => {
    if (!board || board.myRank == null || board.myRank <= 5 || userId == null) return null;
    const fifth = board.rows[4];
    const mine = board.rows.find((r) => r.userId === userId);
    if (fifth == null || mine == null) return null;
    const gap = fifth.score - mine.score;
    return gap > 0 ? gap : null;
  }, [board, userId]);

  const acceptJoin = async () => {
    setJoining(true);
    // Same belt as the effect above: whatever happens, the modal closes and
    // the end screen stays intact.
    try {
      const didJoin = await joinBoard();
      const result = didJoin
        ? await submitScore(stats.score)
        : ({ ok: false, reason: "could not create the profile row" } as const);
      track({ type: "join_board_submitted", accepted: true, joined: didJoin, ok: result.ok });
      if (didJoin) {
        setJoined(true);
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

  const recalOffering = Boolean(suggestion && !dismissed && !applied);

  /* The fine-tune shortcut "hangs off" the coach card, or the recal card when
     there is no coach card — never a row of its own (see the handoff). If
     neither card renders, the run simply doesn't offer it. */
  const fineTuneLink = settings ? (
    <div className="go-fine-tune">
      <p className="go-fine-tune-prompt">Tones not feeling right?</p>
      <button type="button" className="go-subtle-link" onClick={onFineTune}>
        Fine-tune calibration
      </button>
    </div>
  ) : null;

  const playAgainButton = (
    <button type="button" className="go-btn-primary" disabled={busy} onClick={onRetry}>
      {busy ? "Starting…" : "Play again"}
    </button>
  );
  const shareButton = (
    <button
      type="button"
      className="gameover-share"
      disabled={shareBusy}
      onClick={() => void onShare()}
    >
      <ShareIcon />
      {shareBusy ? "Sharing…" : "Share"}
    </button>
  );

  return (
    <div className="screen gameover-screen">
      {/* ---- 1. header / score card, with the Pip breaking out of its corner */}
      <header className="go-header">
        <img className="go-bird" src="/Bird-up-no-halo.png" alt="" aria-hidden="true" />
        <div className="go-header-score">
          <p className="go-eyebrow">{isNewBest ? "New personal best" : "Run over"}</p>
          <p className="go-score-line">
            <span className="go-score">{stats.score.toLocaleString()}</span>
            <span className="go-score-unit">score</span>
          </p>
          <p className="go-best">
            Best {history.bestScore.toLocaleString()} · ×{stats.bestMultiplier}
          </p>
          {challengeScore != null && (
            <p className="go-challenge">
              {stats.score >= challengeScore
                ? `You beat it! 🎉 (target ${challengeScore.toLocaleString()})`
                : `So close — ${challengeScore.toLocaleString()} to beat.`}
            </p>
          )}
        </div>
        {/* Share always lives here (right of the score). Play again joins it
            on desktop; on mobile Play again stays in the sticky footer. */}
        <div className="go-header-actions">
          <div className="go-share-cluster">
            {shareCopied && <p className="note go-share-copied">Copied to clipboard!</p>}
            {shareButton}
          </div>
          {playAgainButton}
        </div>
      </header>

      <div className="go-grid">
        {/* ---- 3. coach card */}
        <div className="go-col">
          {weakest && (
            <section className="go-card go-coach">
              <div className="go-coach-head">
                <span className="go-coach-mark">
                  <ToneMarkIcon tone={weakest.tone} className="go-coach-icon" />
                </span>
                <span className="go-coach-eyebrow">Coach</span>
              </div>
              <h3 className="go-coach-title">
                Weak spot: Tone {weakest.tone} ({TONE_SHORT_LABEL[weakest.tone]})
              </h3>
              <p className="go-coach-body">{takeaway(breakdown)}</p>
              <button type="button" className="go-btn-primary" onClick={onVisualiser}>
                Practise in visualiser →
              </button>
              {!recalOffering && fineTuneLink}
            </section>
          )}
        </div>

        {/* ---- 4. tone-accuracy grid */}
        <div className="go-col">
          <section className="go-card go-tones pause-accuracy">
            <p className="pause-accuracy-label">This run · tone accuracy</p>
            <div className="pause-accuracy-grid">
              {breakdown.map((b) => (
                <div
                  className={`pause-tone-card go-tone-tile${
                    weakest && b.tone === weakest.tone ? " go-tone-tile-weak" : ""
                  }`}
                  key={b.tone}
                >
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
          </section>
        </div>

        {/* ---- 5/6/7. leaderboard slot, recalibration, feedback */}
        <div className="go-col">
          {boardEligible && joined && (
            <section className="go-card go-rank-row">
              <span className="go-rank-num">
                <strong>#{board?.myRank ?? "–"}</strong>
                {board != null && <small>of {board.total}</small>}
              </span>
              <span className="go-rank-copy">
                <strong>You&rsquo;re on the weekly board</strong>
                {topFiveGap != null && (
                  <small>{topFiveGap.toLocaleString()} to reach the top 5</small>
                )}
              </span>
              <button
                type="button"
                className="go-rank-view"
                onClick={() => setLeaderboardOpen(true)}
              >
                View →
              </button>
            </section>
          )}

          {boardEligible && !joined && isNewBest && (
            <section className="go-card go-board-cta">
              <h3 className="go-board-cta-title">🏆 Post your score</h3>
              <p className="go-board-cta-body">
                {projected
                  ? `${stats.score.toLocaleString()} would put you at #${projected.rank} this week.`
                  : "Share your best score on this week's public board."}
              </p>
              <button
                type="button"
                className="go-btn-gold"
                onClick={() => setJoinOffer(true)}
              >
                Add to leaderboard
              </button>
            </section>
          )}

          {boardEligible && !joined && !isNewBest && (
            <button
              type="button"
              className="go-subtle-link go-board-link"
              onClick={() => setLeaderboardOpen(true)}
            >
              View leaderboard →
            </button>
          )}

          {/* Gated here rather than inside a component so Rollup drops it
              (CLAUDE.md rule 7). Players never see a failed submission. */}
          {import.meta.env.DEV && boardError && (
            <p className="error">Leaderboard (dev only): {boardError}</p>
          )}

          {applied && (
            <section className="go-card go-recal go-recal-applied">
              <p>Calibration updated. The new range applies from your next run.</p>
            </section>
          )}
          {recalOffering && (
            <section className="go-card go-recal">
              <p className="go-recal-copy">
                {suggestionIsFirst
                  ? "We personalised your grid even further. Want to update your calibration?"
                  : "Your range in this run looked different from your calibration. Update it?"}
              </p>
              <div className="go-recal-actions">
                <button type="button" className="go-btn-primary" onClick={applySuggestion}>
                  Update
                </button>
                <button type="button" className="go-btn-ghost" onClick={dismissSuggestion}>
                  Not now
                </button>
              </div>
              {!weakest && fineTuneLink}
            </section>
          )}

          {feedbackEligible && !feedbackDismissed && (
            <section className="go-card go-feedback">
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
                  <p className="go-feedback-q">How&rsquo;s it feeling?</p>
                  <div className="go-feedback-chips">
                    <button
                      type="button"
                      className="go-chip"
                      onClick={() => chooseFeedback("great")}
                    >
                      🎯 Felt great
                    </button>
                    <button
                      type="button"
                      className="go-chip"
                      onClick={() => chooseFeedback("calib_off")}
                    >
                      🎙️ Calibration off
                    </button>
                    <button
                      type="button"
                      className="go-chip"
                      onClick={() => chooseFeedback("too_easy")}
                    >
                      😴 Too easy
                    </button>
                    <button
                      type="button"
                      className="go-chip"
                      onClick={() => chooseFeedback("too_hard")}
                    >
                      💥 Too hard
                    </button>
                  </div>
                  <p className="feedback-mailto">
                    <a href="mailto:pierre@pierrebuilds.dev">
                      Anything else you'd like to add or any suggestions? Feel free to email me →
                    </a>
                  </p>
                </>
              ) : (
                <p className="go-feedback-q">thanks!</p>
              )}
            </section>
          )}

          {/* Guarded here as well as inside the panel: the internal guard hides
              it, this one lets Rollup drop the component from the production
              bundle entirely (CLAUDE.md rule 7). */}
          {import.meta.env.DEV && <GateLogPanel />}
        </div>
      </div>

      {/* ---- 8. primary actions. Sticky, not fixed: the mobile GameNav is an
          in-flow flex item below .app-main, so a fixed footer would sit on top
          of it. The scroll container is .frame (App.css, max-width 719px). */}
      <div className="go-footer">
        {playAgainButton}
      </div>

      {joinOffer && (
        <JoinBoardModal
          name={boardName}
          busy={joining}
          projected={projected}
          onJoin={acceptJoin}
          onDismiss={declineJoin}
        />
      )}

      {leaderboardOpen && <Leaderboard onClose={() => setLeaderboardOpen(false)} />}
    </div>
  );
}
