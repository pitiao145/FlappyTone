import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { comboBreakdown, newRunStats, toneBreakdown, type RunStats } from "../../game/scoring.ts";
import type { Tone } from "../../game/gates.ts";
import { DEFAULT_TIER_LIMITS } from "../../game/tiers.ts";
import { GameOverHeader, weakestTone } from "../GameOverParts.tsx";
import { ToneMarkIcon } from "../toneIcons.tsx";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import { Testimonial } from "../Testimonial.tsx";
import { TESTIMONIALS } from "../testimonials.ts";
import { toneName } from "../../site/toneNames.ts";

const COPY = brand.demoGameOver;
/** Pair tiles at most, weakest first: one row of four on the score card. */
const PAIRS_SHOWN = 4;

/** Every round's per-tone numbers added up: the "all rounds" tone accuracy. */
export function sumRounds(rounds: readonly RunStats[]): RunStats {
  const total = newRunStats();
  for (const r of rounds) {
    total.score = Math.max(total.score, r.score);
    for (const t of [1, 2, 3, 4] as Tone[]) {
      const a = total.perTone[t];
      const b = r.perTone[t];
      a.gates += b.gates;
      a.accSum += b.accSum;
      a.unheard += b.unheard;
      a.best = Math.max(a.best, b.best);
    }
    for (const [key, c] of Object.entries(r.perCombo)) {
      const a = (total.perCombo[key] ??= { gates: 0, accSum: 0, best: 0, unheard: 0 });
      a.gates += c.gates;
      a.accSum += c.accSum;
      a.unheard += c.unheard;
      a.best = Math.max(a.best, c.best);
    }
  }
  return total;
}

/** A circular "play again" arrow, in the button's ink. */
function ReplayIcon() {
  return (
    <svg className="go-demo-retry-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path
        d="M3.6 3.4v4.8h4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Two tone marks side by side: a two-syllable word. */
function PairsIcon() {
  return (
    <span className="go-demo-retry-icon go-demo-pairs-icon" aria-hidden="true">
      <span style={{ color: TONE_LINE_COLOR[3] }}>
        <ToneMarkIcon tone={3} />
      </span>
      <span style={{ color: TONE_LINE_COLOR[2] }}>
        <ToneMarkIcon tone={2} />
      </span>
    </span>
  );
}

/**
 * Try it now's end screen. It has one job: the signup.
 *
 * The score card holds this round's score, the free rounds as slots (each
 * finished round's score, the best starred, the rounds left empty), and the
 * tone accuracy per heard tone: this run's on round 1, from round 2 the
 * total of every round with this round's own figure under it. Then the
 * signup card (title from the weakest heard tone on round 1, from round 2
 * the player's rounds and best; three perks; the button), a real player's
 * quote, and a "Play round 2" / "Play your last round" button (after a
 * classic round, with "Too easy? Try tone pairs" beside it). Tone Pairs
 * rounds add their weakest pairs to the tiles. The last of
 * `freeRounds` (3) has no retry: "Sign up to keep playing" and a true line
 * that the rounds expire. Phones stack it; wider screens put the quote on
 * the right.
 *
 * `rounds` is this page load's finished rounds, oldest first, the current
 * one last. Nothing here reads or writes storage or the server: `TryItNow`
 * parks each round (`src/lib/demoRuns.ts`) before showing this.
 */
export function DemoGameOver({
  stats,
  onSignup,
  onRetry,
  onPairs,
  quote = 0,
  rounds = [stats],
}: {
  stats: RunStats;
  /** Index into `TESTIMONIALS`. */
  quote?: number;
  onSignup: () => void;
  onRetry: () => void;
  /** Classic rounds only: "Too easy? Try tone pairs", the next round flies Tone Pairs. */
  onPairs?: () => void;
  /** This page load's finished rounds, oldest first, ending with `stats`. */
  rounds?: readonly RunStats[];
}) {
  const played = rounds.length;
  const free = COPY.freeRounds;
  const last = played >= free;
  const multi = played > 1;
  const scores = rounds.map((r) => Math.round(r.score));
  const best = Math.max(0, ...scores);
  const bestIndex = best > 0 ? scores.lastIndexOf(best) : -1;

  const breakdown = toneBreakdown(stats);
  const summed = useMemo(() => sumRounds(rounds), [rounds]);
  const totals = toneBreakdown(summed);
  // Any heard tone counts: a 5-word run flies most tones once (hard rule 8:
  // an unheard gate has no accuracy, so it is never the weakest).
  const weakest = useMemo(() => weakestTone(breakdown, 1), [breakdown]);
  const pct = weakest ? Math.round(weakest.pct) : 0;
  const title = last
    ? COPY.lastTitle(played)
    : multi
      ? COPY.keepTitle(played, best)
      : !weakest
        ? COPY.titleAny
        : pct >= COPY.strongPct
          ? COPY.titleStrong(toneName(weakest.tone), pct)
          : COPY.title(toneName(weakest.tone), pct);
  // Only tones with a heard gate: an unheard one has nothing honest to show.
  const shown = (multi ? totals : breakdown).filter(
    (b): b is typeof b & { pct: number } => b.pct !== null && b.gates > 0,
  );
  const thisRound = new Map(breakdown.map((b) => [b.tone, b.pct]));
  // Tone Pairs rounds fill per-pair stats: their weakest pairs, as tiles too.
  const pairsShown = comboBreakdown((multi ? summed : stats).perCombo).slice(0, PAIRS_SHOWN);
  const pairThisRound = new Map(comboBreakdown(stats.perCombo).map((p) => [p.key, p.pct]));

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader
        eyebrow="Run over"
        score={stats.score}
        actions={
          <>
            <div className="go-demo-rounds-block">
              <p className="go-demo-rounds-label">{COPY.roundsLabel(Math.min(played, free), free)}</p>
              <ol className="go-demo-rounds">
                {Array.from({ length: free }, (_, i) => {
                  const done = i < played;
                  const isBest = multi && i === bestIndex;
                  const now = i === played - 1;
                  return (
                    <li
                      key={i}
                      className={`go-demo-round${done ? " is-done" : ""}${isBest ? " is-best" : ""}${now ? " is-now" : ""}`}
                      aria-label={
                        done
                          ? `Round ${i + 1}: ${scores[i].toLocaleString("en-US")}${isBest ? ", your best" : ""}`
                          : `Round ${i + 1}: not played yet`
                      }
                    >
                      <span className="go-demo-round-n" aria-hidden="true">
                        {i + 1}
                      </span>
                      <b aria-hidden="true">{done ? scores[i].toLocaleString("en-US") : "–"}</b>
                      {isBest && (
                        <span className="go-demo-round-star" aria-hidden="true">
                          ★
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
            {(shown.length > 0 || pairsShown.length > 0) && (
              <div className="go-demo-tones-block">
                <p className="go-demo-tones-label">{multi ? COPY.tonesTotalLabel(played) : COPY.tonesLabel}</p>
                <ul className="go-demo-tones">
                  {shown.map((b) => {
                    const mine = thisRound.get(b.tone);
                    return (
                      <li
                        key={b.tone}
                        aria-label={`${toneName(b.tone, true)}: ${Math.round(b.pct)}% tone accuracy${
                          multi && mine != null ? `, ${Math.round(mine)}% this round` : ""
                        }`}
                      >
                        <span className="go-demo-tone-main">
                          <span style={{ color: TONE_LINE_COLOR[b.tone] }}>
                            <ToneMarkIcon tone={b.tone} className="go-demo-tone-icon" />
                          </span>
                          <b>{Math.round(b.pct)}%</b>
                        </span>
                        {multi && (
                          <small aria-hidden="true">
                            {mine != null ? COPY.toneThisRound(Math.round(mine)) : " "}
                          </small>
                        )}
                      </li>
                    );
                  })}
                  {pairsShown.map((p) => {
                    const mine = pairThisRound.get(p.key);
                    return (
                      <li
                        key={p.key}
                        className="go-demo-pair"
                        aria-label={`${toneName(p.tones[0], true)} then ${toneName(p.tones[1])}: ${Math.round(p.pct)}% tone accuracy${
                          multi && mine != null ? `, ${Math.round(mine)}% this round` : ""
                        }`}
                      >
                        <span className="go-demo-tone-main">
                          <span className="go-demo-pair-marks">
                            {p.tones.map((t, i) => (
                              <span key={i} style={{ color: TONE_LINE_COLOR[t] }}>
                                <ToneMarkIcon tone={t} className="go-demo-pair-icon" />
                              </span>
                            ))}
                          </span>
                          <b>{Math.round(p.pct)}%</b>
                        </span>
                        {multi && (
                          <small aria-hidden="true">
                            {mine != null ? COPY.toneThisRound(Math.round(mine)) : "\u00a0"}
                          </small>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
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
          {last ? COPY.signupMore : COPY.signup}
        </button>
        {last && <p className="go-demo-loss">{COPY.lossLine}</p>}
      </section>

      <Testimonial className="go-demo-quote" quote={TESTIMONIALS[quote % TESTIMONIALS.length]} />

      {!last && (
        <div className="go-demo-actions">
          <button type="button" className="go-demo-retry" onClick={onRetry}>
            <ReplayIcon />
            {played >= free - 1 ? COPY.lastRetry : COPY.retry}
          </button>
          {onPairs && (
            <button type="button" className="go-demo-retry go-demo-pairs" onClick={onPairs}>
              <PairsIcon />
              {COPY.pairs}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
