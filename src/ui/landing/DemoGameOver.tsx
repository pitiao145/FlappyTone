import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { DEFAULT_TIER_LIMITS } from "../../game/tiers.ts";
import { GameOverHeader, weakestTone } from "../GameOverParts.tsx";

const COPY = brand.demoGameOver;
const QUOTE = {
  text: brand.notTextbook.quote,
  who: brand.notTextbook.quoteAttribution.replace(/^—\s*/, ""),
};

/**
 * Try it now's end screen. It has one job: the signup. The score, then the
 * signup card (titled with this run's weakest heard tone, three plain perks,
 * the button), a real player's quote, then a small "One more round". Phones
 * stack it in that order; wider screens put the quote on the right.
 * Nothing here reads or writes storage or the server.
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
  const pct = weakest ? Math.round(weakest.pct) : 0;
  const title = !weakest
    ? COPY.titleAny
    : pct >= COPY.strongPct
      ? COPY.titleStrong(weakest.tone, pct)
      : COPY.title(weakest.tone, pct);

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader eyebrow="Run over" score={stats.score} />

      <section className="go-card go-demo-pitch">
        <h3 className="go-demo-pitch-title">{title}</h3>
        <ul className="go-demo-perks">
          {COPY.perks(DEFAULT_TIER_LIMITS.free.runsPerDay).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <button type="button" className="go-btn-primary go-demo-pitch-btn" onClick={onSignup}>
          {COPY.signup}
        </button>
      </section>

      <figure className="go-demo-quote">
        <blockquote>{QUOTE.text}</blockquote>
        <figcaption>
          <img src="/lp/birds/lu_rou_fan.webp" width={40} height={40} alt="" loading="lazy" />
          <cite>{QUOTE.who}</cite>
        </figcaption>
      </figure>

      <div className="go-demo-actions">
        <button type="button" className="go-subtle-link" onClick={onRetry}>
          {COPY.retry}
        </button>
      </div>
    </div>
  );
}
