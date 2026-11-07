import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { GameOverHeader, weakestTone } from "../GameOverParts.tsx";
import { ContourSpark } from "../ContourSpark.tsx";
import { TONE_LINE_COLOR } from "../toneColors.ts";

/**
 * Try it now's end screen. It has one job: the signup. Top to bottom: the
 * score, the signup card (with this run's weakest tone), then a small "One
 * more round". Same parts and styles as the real game over (`GameOver.tsx`);
 * no share, board, recalibration, XP, personal best or feedback, and nothing
 * here reads or writes storage or the server.
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
  // Any heard tone counts: a 5-word run flies most tones once (hard rule 8:
  // an unheard gate has no accuracy, so it is never the weakest).
  const weakest = useMemo(() => weakestTone(breakdown, 1), [breakdown]);

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader eyebrow="Run over" score={stats.score} />

      <section className="go-card go-demo-pitch">
        <h3 className="go-demo-pitch-title">{brand.demoGameOver.pitchTitle}</h3>
        {weakest && (
          // The shape to work on, in its tone colour, on a paper tile (tone 2's jade would vanish on the card).
          <p className="go-demo-weak" style={{ color: TONE_LINE_COLOR[weakest.tone] }}>
            <ContourSpark tone={weakest.tone} width={64} height={30} />
            <span>Tone {weakest.tone}</span>
          </p>
        )}
        <p className="go-demo-pitch-body">
          {weakest
            ? brand.demoGameOver.pitchBody(weakest.tone, Math.round(weakest.pct))
            : brand.demoGameOver.pitchBodyAny}
        </p>
        <button type="button" className="go-btn-primary go-demo-pitch-btn" onClick={onSignup}>
          {brand.demoGameOver.signup}
        </button>
        <p className="go-demo-pitch-more">{brand.demoGameOver.pitchMore}</p>
      </section>

      <div className="go-demo-actions">
        <button type="button" className="go-subtle-link" onClick={onRetry}>
          {brand.demoGameOver.retry}
        </button>
      </div>
    </div>
  );
}
