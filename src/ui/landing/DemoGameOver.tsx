import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { DEFAULT_TIER_LIMITS } from "../../game/tiers.ts";
import { GameOverHeader, weakestTone } from "../GameOverParts.tsx";
import { ToneMarkIcon } from "../toneIcons.tsx";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import { Testimonial } from "../Testimonial.tsx";
import { TESTIMONIALS } from "../testimonials.ts";
import { toneName } from "../../site/toneNames.ts";

const COPY = brand.demoGameOver;

/**
 * Try it now's end screen. It has one job: the signup. The score, then the
 * signup card (titled with this run's weakest heard tone, three plain perks,
 * the button), a real player's quote, then a small "One more round". The
 * score card also shows this run's tone accuracy per tone flown (heard gates
 * only, like the game's own tiles). Phones stack it in that order; wider
 * screens put the quote on the right. `quote` rotates the landing page's
 * quotes, one per end screen.
 * Nothing here reads or writes storage or the server.
 */
export function DemoGameOver({
  stats,
  onSignup,
  onRetry,
  quote = 0,
}: {
  stats: RunStats;
  /** Index into `TESTIMONIALS`. */
  quote?: number;
  onSignup: () => void;
  onRetry: () => void;
}) {
  const breakdown = toneBreakdown(stats);
  // Any heard tone counts: a 5-word run flies most tones once (hard rule 8:
  // an unheard gate has no accuracy, so it is never the weakest).
  const weakest = useMemo(() => weakestTone(breakdown, 1), [breakdown]);
  const pct = weakest ? Math.round(weakest.pct) : 0;
  const title = !weakest
    ? COPY.titleAny
    : pct >= COPY.strongPct
      ? COPY.titleStrong(toneName(weakest.tone), pct)
      : COPY.title(toneName(weakest.tone), pct);
  // Only tones with a heard gate: an unheard one has nothing honest to show.
  const tones = breakdown.filter((b): b is typeof b & { pct: number } => b.pct !== null && b.gates > 0);

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader
        eyebrow="Run over"
        score={stats.score}
        actions={
          tones.length > 0 && (
            <div className="go-demo-tones-block">
              <p className="go-demo-tones-label">{COPY.tonesLabel}</p>
              <ul className="go-demo-tones">
              {tones.map((b) => (
                <li key={b.tone} aria-label={`${toneName(b.tone, true)}: ${Math.round(b.pct)}% tone accuracy`}>
                  <span style={{ color: TONE_LINE_COLOR[b.tone] }}>
                    <ToneMarkIcon tone={b.tone} className="go-demo-tone-icon" />
                  </span>
                  <b>{Math.round(b.pct)}%</b>
                </li>
              ))}
              </ul>
            </div>
          )
        }
      />

      <section className="go-card go-demo-pitch">
        <h3 className="go-demo-pitch-title">
          {/* One sentence per line, so a phrase never breaks mid-way. */}
          {title.split(/(?<=[.!]) /).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h3>
        <ul className="go-demo-perks">
          {COPY.perks(DEFAULT_TIER_LIMITS.free.runsPerDay).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <button type="button" className="go-btn-primary go-demo-pitch-btn" onClick={onSignup}>
          {COPY.signup}
        </button>
      </section>

      <Testimonial className="go-demo-quote" quote={TESTIMONIALS[quote % TESTIMONIALS.length]} />

      <div className="go-demo-actions">
        <button type="button" className="go-subtle-link" onClick={onRetry}>
          {COPY.retry}
        </button>
      </div>
    </div>
  );
}
