import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import {
  loadRunHistory,
  toneAccuracyFromHistory,
  type RunOutcome,
} from "../game/runHistory.ts";
import { loadStreak } from "../game/streak.ts";
import type { Word } from "../game/words.ts";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "./plan.ts";
import { ToneAverageCard } from "./ToneAverageCard.tsx";
import { TONE_LINE_COLOR } from "./toneColors.ts";

// Lazy so Chart.js (~165KB) loads only when the "Accuracy progress" tab is
// opened, not on every game-app boot.
const AccuracyProgressChart = lazy(() =>
  import("./AccuracyProgressChart.tsx").then((m) => ({ default: m.AccuracyProgressChart })),
);

const TONES: Tone[] = [1, 2, 3, 4];

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  finished: "finished",
  out_of_hearts: "out of hearts",
  quit: "quit",
};

/** Eight short date labels, one every ~3 days ending today — the mock chart's x-axis. */
function mockDateLabels(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 3 * 86_400_000);
    out.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  return out;
}

/** One tone's placeholder accuracy series — an upward random walk, clamped 0–100. */
function mockToneSeries(n: number): number[] {
  const out: number[] = [];
  let v = 10 + Math.random() * 25;
  for (let i = 0; i < n; i++) {
    out.push(Math.round(Math.max(0, Math.min(100, v))));
    v += Math.random() * 12 - 3; // drifts upward on average
  }
  return out;
}

type AccuracyTab = "accuracy" | "progress";

interface Props {
  /** Opens the EarlyBird modal — used only by the pricing card's "Join EarlyBird" CTA now. */
  onEarlyBird: (feature: string) => void;
}

/**
 * The Progress tab. Real device-local stats (lifetime counts, streak, last-5-run
 * tone accuracy from `runHistory.ts`/`streak.ts`) alongside Pro teasers (level,
 * accuracy-over-time, tone evolution, leaderboard) that point at the new pricing
 * section at the bottom instead of opening the upsell modal directly. See the
 * design handoff in docs/design_handoff_progress_pricing/.
 */
export function Progress({ onEarlyBird }: Props) {
  const [words, setWords] = useState<Word[] | null>(null);
  useEffect(() => {
    loadInventory().then(setWords, () => setWords([]));
  }, []);
  const wordsByTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of TONES) map.set(t, (words ?? []).filter((w) => w.tone === t));
    return map;
  }, [words]);

  const history = useMemo(() => loadRunHistory(), []);
  const toneAccuracy = useMemo(() => toneAccuracyFromHistory(history), [history]);
  const streak = useMemo(() => loadStreak(), []);

  // Mock accuracy-over-time data for the Pro teaser chart — generated once so
  // switching tabs/tones doesn't re-randomise. No real time-series exists yet.
  const mock = useMemo(() => {
    const labels = mockDateLabels(8);
    const series = TONES.reduce(
      (acc, t) => {
        acc[t] = mockToneSeries(labels.length);
        return acc;
      },
      {} as Record<Tone, number[]>,
    );
    return { labels, series };
  }, []);

  const [activeTab, setActiveTab] = useState<AccuracyTab>("accuracy");
  const [selectedTone, setSelectedTone] = useState<Tone>(1);

  /** Each teaser CTA fires its own named event (see call sites below) before scrolling. */
  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="screen progress-screen">
      <h2>Your progress</h2>
      <p className="note">Saved on this device · sign up to keep it forever</p>

      {/* ---- Overview: streak + level, then the stat strip */}
      <div className="progress-overview">
        <div className="overview-cards">
          <div className="sticker-card streak-card">
            <span className="streak-flame" aria-hidden>
              🔥
            </span>
            <span className="streak-big">
              {streak.current} {streak.current === 1 ? "day" : "days"}
            </span>
            <span className="streak-label">
              streak{streak.best > streak.current ? ` · best ${streak.best}` : ""}
            </span>
            <span className="streak-warning">
              ⚠️ Saved only on this device — clearing your browser data resets it.
            </span>
          </div>

          <div className="sticker-card level-card">
            <div className="level-head">
              <span className="level-label">Level</span>
              <span className="pro-badge">🔒 Pro</span>
            </div>
            <span className="level-big">Level 4</span>
            <span className="level-bar">
              <span className="level-bar-fill" style={{ width: "45%" }} />
            </span>
            <span className="level-sub">Earn XP &amp; rank up</span>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-num">{history.totalRuns}</span>
            <span className="stat-label">runs</span>
          </div>
          <div className="stat-tile">
            <span className="stat-num">{history.bestScore}</span>
            <span className="stat-label">best</span>
          </div>
          <div className="stat-tile">
            <span className="stat-num">{history.totalGates}</span>
            <span className="stat-label">gates</span>
          </div>
          <div className="stat-tile">
            <span className="stat-num">{history.wordIds.length}</span>
            <span className="stat-label">words</span>
          </div>
        </div>
      </div>

      {/* ---- Accuracy (tabbed) */}
      <section className="progress-card sticker-card">
        <div className="acc-header">
          <div className="acc-tabs">
            <button
              type="button"
              className={`acc-tab${activeTab === "accuracy" ? " acc-tab-active" : ""}`}
              onClick={() => setActiveTab("accuracy")}
            >
              Accuracy per tone
            </button>
            <button
              type="button"
              className={`acc-tab${activeTab === "progress" ? " acc-tab-active" : ""}`}
              onClick={() => setActiveTab("progress")}
            >
              Accuracy progress
            </button>
          </div>
          {activeTab === "progress" && <span className="pro-badge">🔒 Pro</span>}
        </div>

        {activeTab === "accuracy" ? (
          <>
            <p className="note">
              Averaged over your last {Math.min(5, history.lastRuns.length)} runs.
            </p>
            <div className="breakdown">
              {toneAccuracy.map((t) => (
                <div className="breakdown-row" key={t.tone}>
                  <span className="syllable">Tone {t.tone}</span>
                  <span className="bar">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${t.pct ?? 0}%`,
                        background: TONE_LINE_COLOR[t.tone],
                      }}
                      aria-hidden
                    />
                  </span>
                  <span className="pct">{t.pct === null ? "—" : `${Math.round(t.pct)}%`}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="note">Accuracy over time for the selected tone (example data).</p>
            <div className="tone-pills">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tone-pill${selectedTone === t ? " tone-pill-active" : ""}`}
                  style={selectedTone === t ? { background: TONE_LINE_COLOR[t] } : undefined}
                  onClick={() => setSelectedTone(t)}
                >
                  Tone {t}
                </button>
              ))}
            </div>
            <Suspense fallback={<div className="acc-chart acc-chart-loading" aria-hidden />}>
              <AccuracyProgressChart
                tone={selectedTone}
                labels={mock.labels}
                data={mock.series[selectedTone]}
              />
            </Suspense>
            <button
              type="button"
              className="link progress-card-cta"
              onClick={() => {
                capturePostHogEvent("progress_accuracy_chart_upsell_click", {});
                scrollToPricing();
              }}
            >
              🔒 Compare against your own attempts — unlock with Pro
            </button>
          </>
        )}
      </section>

      {/* ---- Run history */}
      <section className="progress-card sticker-card">
        <div className="progress-card-header">
          <h3>Run history</h3>
          <span className="badge-solid badge-solid-jade">Last 5 runs</span>
        </div>
        {history.lastRuns.length === 0 ? (
          <p className="note">Play a run to see it here.</p>
        ) : (
          <div className="run-history-list">
            {history.lastRuns.map((run) => {
              const gates = TONES.reduce((sum, t) => sum + run.perTone[t].gates, 0);
              const accSum = TONES.reduce((sum, t) => sum + run.perTone[t].accSum, 0);
              const pct = gates > 0 ? Math.round((accSum / gates) * 100) : 0;
              return (
                <div className="run-history-row" key={run.atISO}>
                  <span className="run-history-date">
                    {new Date(run.atISO).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="run-history-score">{run.score}</span>
                  <span className="run-history-detail">
                    {pct}% · {run.gates} gates
                  </span>
                  <span className={`run-badge run-badge-${run.outcome}`}>
                    {OUTCOME_LABEL[run.outcome]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className="link progress-card-cta"
          onClick={() => {
            capturePostHogEvent("progress_run_history_upsell_click", {});
            scrollToPricing();
          }}
        >
          🔒 See all {history.totalRuns} runs &amp; trends — unlock with Pro
        </button>
      </section>

      {/* ---- Tone evolution (kept from today, restyled) */}
      <section className="progress-card sticker-card">
        <div className="progress-card-header">
          <h3>See how your tones evolve over time</h3>
          <span className="pro-badge">🔒 Pro</span>
        </div>
        <div className="tone-average-grid">
          {TONES.map((t) => (
            <ToneAverageCard
              key={t}
              tone={t}
              words={wordsByTone.get(t) ?? []}
              showCaption={false}
            />
          ))}
        </div>
        <button
          type="button"
          className="link progress-card-cta"
          onClick={() => {
            capturePostHogEvent("progress_tone_evolution_upsell_click", {});
            scrollToPricing();
          }}
        >
          🔒 Compare against your own attempts — unlock with Pro
        </button>
      </section>

      {/* ---- Leaderboard */}
      <section className="progress-card sticker-card sticker-card-pro">
        <div className="progress-card-header">
          <h3>Leaderboard</h3>
          <span className="pro-badge">🔒 Pro</span>
        </div>
        <div className="leaderboard-preview">
          <div className="leaderboard-row">
            <span className="leaderboard-rank">🥇</span>
            <span className="leaderboard-name">chloe_tw</span>
            <span className="leaderboard-score">2,140</span>
          </div>
          <div className="leaderboard-row">
            <span className="leaderboard-rank">🥈</span>
            <span className="leaderboard-name">marco</span>
            <span className="leaderboard-score">1,980</span>
          </div>
          <div className="leaderboard-row leaderboard-you">
            <span className="leaderboard-rank">7</span>
            <span className="leaderboard-name">you</span>
            <span className="leaderboard-score">{history.bestScore}</span>
          </div>
        </div>
        <button
          type="button"
          className="link progress-card-cta"
          onClick={() => {
            capturePostHogEvent("progress_leaderboard_upsell_click", {});
            scrollToPricing();
          }}
        >
          🔒 Compete weekly — unlock with Pro
        </button>
      </section>

      {/* ---- Pricing */}
      <section id="pricing" className="pricing-section">
        <div className="pricing-head">
          <h2>Free today, more with Pro</h2>
          <p className="note">
            EarlyBird gets you every Pro feature as it ships, at a one-time price, before it
            moves to ongoing credits.
          </p>
        </div>

        <div className="pricing-cards">
          <div className="sticker-card price-card">
            <div className="price-card-head">
              <h3>Free</h3>
              <p className="note">Everything you&rsquo;re using today</p>
            </div>
            <ul className="price-list">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className={f.soon ? "price-list-soon" : undefined}>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="sticker-card price-card price-card-pro">
            <div className="price-card-head price-card-head-pro">
              <h3>Pro - Support the app</h3>
              <span className="price-tag">
                {PRO_PRICE} <span className="price-tag-note">one-time, EarlyBird price</span>
              </span>
            </div>
            <ul className="price-list price-list-pro">
              {PRO_FEATURES.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <button
              type="button"
              className="price-cta"
              onClick={() => {
                capturePostHogEvent("progress_earlybird_pricing_click", {});
                onEarlyBird("pricing");
              }}
            >
              Join EarlyBird
            </button>
            <p className="price-foot">
              Later, Pro moves to credit-based system. You'll need to buy food for your bird to keep flying. EarlyBirds keep
              full access and will have access toall the future features.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
