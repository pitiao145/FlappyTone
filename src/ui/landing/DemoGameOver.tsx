import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { CoachCard, GameOverHeader, weakestTone } from "../GameOverParts.tsx";
import { hasToneAccuracy, ToneAccuracyBreakdown } from "../ToneAccuracyBreakdown.tsx";

/**
 * Try it now's end screen: the real game over (`GameOver.tsx`), stripped to
 * what one guest run can show. Same parts and styles; no share, board,
 * recalibration, XP, personal best or feedback, and nothing here reads or
 * writes storage or the server.
 */
export function DemoGameOver({
  stats,
  onSignup,
  onRetry,
}: {
  stats: RunStats;
  onSignup: () => void;
  onRetry: () => void;
}) {
  const breakdown = toneBreakdown(stats);
  const weakest = useMemo(() => weakestTone(breakdown), [breakdown]);

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader eyebrow="Run over" score={stats.score} />

      {hasToneAccuracy(stats) && (
        <section className="go-card go-tones">
          <ToneAccuracyBreakdown stats={stats} weakTone={weakest?.tone ?? null} tileClassName="go-tone-tile" />
        </section>
      )}

      {weakest && <CoachCard weakest={weakest} breakdown={breakdown} />}

      <section className="go-card go-demo-pitch">
        <h3 className="go-coach-title">{brand.demoGameOver.pitchTitle}</h3>
        <p className="go-coach-body">{brand.demoGameOver.pitchBody}</p>
        <button type="button" className="go-btn-primary" onClick={onSignup}>
          {brand.demoGameOver.signup}
        </button>
      </section>

      <div className="go-demo-actions">
        <button type="button" className="go-btn-ghost" onClick={onRetry}>
          {brand.demoGameOver.retry}
        </button>
      </div>
    </div>
  );
}
