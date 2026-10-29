import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import type { Tone } from "../game/gates.ts";
import { entriesFromRows, loadRunHistory, type RunHistoryEntry, type RunOutcome } from "../game/runHistory.ts";
import {
  effectivePeriod,
  PERIOD_LABEL,
  PERIODS,
  periodAccuracy,
  periodAllowed,
  type AccuracyPeriod,
} from "../game/accuracyPeriod.ts";
import { streakStatus } from "../game/streak.ts";
import { levelFor, totalXp } from "../game/xp.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { useTier } from "../data/tier.ts";
import { fetchTrendRows } from "../data/runlog.ts";
import { fetchRecentRuns, refreshServerStats } from "../data/stats.ts";
import { dailyTrend, trendKeys } from "../game/runTrend.ts";
import { Leaderboard } from "./Leaderboard.tsx";
import { brand } from "../brand.ts";
import { redirectToCheckoutForCurrentAccount } from "../data/checkout.ts";
import { FREE_HIGHLIGHTS, PRO_HIGHLIGHTS, PRO_PRICE } from "./plan.ts";
import { PlayerToneEvolution, SamplePlayerToneEvolution } from "./PlayerToneEvolution.tsx";
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
  restart: "restarted",
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

function RunRow({
  at,
  score,
  pct,
  gates,
  outcome,
}: {
  at: string;
  score: number;
  /** 0–100, or null when no gate was measured — "—", not "0%". */
  pct: number | null;
  gates: number;
  outcome: RunOutcome;
}) {
  return (
    <div className="run-history-row">
      <span className="run-history-date">
        {new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </span>
      <span className="run-history-score">{score}</span>
      <span className="run-history-detail">
        {pct === null ? "—" : `${Math.round(pct)}%`} · {gates} gates
      </span>
      <span className={`run-badge run-badge-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>
    </div>
  );
}

/** The last-5 list — for everyone (brief 05): the server's latest 5 for an account, this device's for a guest. */
function LocalRuns({ history }: { history: ReturnType<typeof loadRunHistory> }) {
  if (history.lastRuns.length === 0) return <p className="note">Play a run to see it here.</p>;
  return (
    <div className="run-history-list">
      {history.lastRuns.map((run) => {
        // Tone accuracy across the run's single-tone and pair gates. A run
        // from before the reset has none measured.
        const combos = Object.values(run.perCombo ?? {});
        const gates =
          TONES.reduce((sum, t) => sum + run.perTone[t].gates, 0) + combos.reduce((sum, c) => sum + c.gates, 0);
        const accSum =
          TONES.reduce((sum, t) => sum + run.perTone[t].accSum, 0) + combos.reduce((sum, c) => sum + c.accSum, 0);
        return (
          <RunRow
            key={run.atISO}
            at={run.atISO}
            score={run.score}
            pct={gates > 0 ? (accSum / gates) * 100 : null}
            gates={run.gates}
            outcome={run.outcome}
          />
        );
      })}
    </div>
  );
}

type AccuracyTab = "accuracy" | "progress";

/** "2" → "Tone 2"; "3-2" → "3 + 2". */
function keyLabel(key: string): string {
  return key.includes("-") ? key.split("-").join(" + ") : `Tone ${key}`;
}

/** A chart line takes its (first) tone's colour. */
function keyColor(key: string): string {
  return TONE_LINE_COLOR[Number(key[0]) as Tone];
}

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  /** Opens the EarlyBird modal — used only by the pricing card's "Join EarlyBird" CTA now. */
  onEarlyBird: (feature: string) => void;
  /**
   * Set true by GameOver's "view full leaderboard" link right before this
   * screen mounts. Read and cleared inside this component's own mount
   * effect, not by the caller during render — a ref read-and-cleared in the
   * render body can be torn by a second render pass (e.g. Strict Mode's
   * dev-only double-invoke) before this component ever sees `true`.
   */
  leaderboardIntentRef?: { current: boolean };
}

/**
 * The Progress tab. Real device-local stats (lifetime counts, streak, last-5-run
 * tone accuracy from `runHistory.ts`/`streak.ts`) alongside Pro teasers (level,
 * accuracy-over-time, tone evolution, leaderboard) that point at the new pricing
 * section at the bottom instead of opening the upsell modal directly. See the
 * design handoff in docs/design_handoff_progress_pricing/.
 */
export function Progress({ onEarlyBird, leaderboardIntentRef }: Props) {
  const tier = useTier();
  const leaderboardSectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Read-and-clear happens here, after commit, not during GameApp's
    // render — a ref mutated during render can be torn by a second render
    // pass (e.g. Strict Mode's dev-only double-invoke) before this effect
    // ever runs, silently dropping the scroll.
    if (leaderboardIntentRef?.current) {
      leaderboardIntentRef.current = false;
      leaderboardSectionRef.current?.scrollIntoView({ block: "start" });
    }
    // Runs once, on mount — GameOver's link remounts this screen fresh each
    // time, it never toggles the ref live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Ticks after a sign-in/sign-out finishes syncing local storage (or, for a
  // sign-out, right away) — see `sessionVersion.ts`. Without it these stats
  // stayed frozen at whatever they were when the tab first mounted.
  const version = useSessionVersion();
  const history = useMemo(() => loadRunHistory(), [version]);
  const isAccount = tier !== "guest";
  // An account's numbers live on the server (brief 05): refresh the local
  // cache on open, so a second device shows the same thing. `version` ticks
  // when it lands and the memos above re-read.
  useEffect(() => {
    if (isAccount) void refreshServerStats();
  }, [isAccount]);
  // Free/guest: always the last 5 runs. Pro: a period picker.
  const [chosenPeriod, setChosenPeriod] = useState<AccuracyPeriod>("last5");
  const period = effectivePeriod(tier, chosenPeriod);
  const [last50, setLast50] = useState<RunHistoryEntry[] | null>(null);
  useEffect(() => {
    if (period !== "last50") return;
    let live = true;
    void fetchRecentRuns(50).then((rows) => live && setLast50(entriesFromRows(rows)));
    return () => {
      live = false;
    };
  }, [period, version]);
  const accuracy = useMemo(() => periodAccuracy(period, history, last50), [period, history, last50]);
  const toneAccuracy = accuracy.tones;
  const comboAccuracy = accuracy.combos;
  const streak = useMemo(() => streakStatus(), [version]);
  const lvl = useMemo(() => levelFor(totalXp(history)), [history]);

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
  const isPro = tier === "pro";

  // Pro: the per-day trend, from every run in `run_log` (spec C; never trimmed for Pro).
  const [trendRows, setTrendRows] = useState<Awaited<ReturnType<typeof fetchTrendRows>> | null>(null);
  useEffect(() => {
    if (!isPro) return;
    let live = true;
    void fetchTrendRows().then((r) => live && setTrendRows(r));
    return () => {
      live = false;
    };
  }, [isPro, version]);
  const trend = useMemo(() => dailyTrend(trendRows ?? []), [trendRows]);
  const proKeys = useMemo(() => trendKeys(trend), [trend]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey && trend.has(selectedKey) ? selectedKey : (proKeys[0] ?? null);
  const proSeries = useMemo(() => {
    const pts = activeKey ? (trend.get(activeKey) ?? []) : [];
    return { labels: pts.map((p) => shortDay(p.day)), data: pts.map((p) => Math.round(p.accuracy * 100)) };
  }, [trend, activeKey]);

  /** Each teaser CTA fires its own named event (see call sites below) before scrolling. */
  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** The Pro lock for a teaser; a Pro player never sees a teaser (each card has a real Pro branch). */
  const lockBadge = <span className="pro-badge">🔒 Pro</span>;
  const lockCta = (label: string, card: string) => (
    <button
      type="button"
      className="link progress-card-cta"
      onClick={() => {
        track({ type: "progress_locked_cta_click", card });
        scrollToPricing();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="screen progress-screen">
      <h2>Your progress</h2>
      <p className="note">
        {tier === "guest"
          ? "Saved on this device · sign up to keep it forever"
          : "Synced to your account"}
      </p>

      {/* ---- Overview: streak + level, then the stat strip */}
      <div className="progress-overview">
        <div className="overview-cards">
          <div className="sticker-card streak-card">
            <span className="streak-flame" aria-hidden>
              🔥
            </span>
            <span className="streak-big">
              {streak.state === "broken"
                ? "Broken"
                : `${streak.current} ${streak.current === 1 ? "day" : "days"}`}
            </span>
            <span className="streak-label">
              {streak.state === "done_today"
                ? "Done today"
                : streak.state === "at_risk"
                  ? "Play today to keep it"
                  : streak.state === "broken"
                    ? "Play a run to start again"
                    : "Finish a run to start a streak"}
              {streak.best > streak.current ? ` · best ${streak.best}` : ""}
            </span>
            <span className="streak-warning">
              {tier === "guest"
                ? "⚠️ Saved only on this device — clearing your browser data resets it."
                : "Synced to your account."}
            </span>
          </div>

          <div className="sticker-card level-card">
            <div className="level-head">
              <span className="level-label">Level</span>
              <span className="level-xp">{lvl.xp.toLocaleString()} XP</span>
            </div>
            <span className="level-big">Level {lvl.level}</span>
            <span
              className="level-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lvl.levelSpan}
              aria-valuenow={lvl.intoLevel}
            >
              <span className="level-bar-fill" style={{ width: `${(lvl.intoLevel / lvl.levelSpan) * 100}%` }} />
            </span>
            <span className="level-sub">
              {lvl.toNext.toLocaleString()} XP to level {lvl.level + 1} · accurate tones earn the most
            </span>
            {tier === "guest" && (
              <span className="streak-warning">⚠️ Sign up to keep your XP and unlock themes.</span>
            )}
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
        {!isAccount && <p className="note">Saved on this device only.</p>}
      </div>

      {/* ---- Leaderboard. Real data and open to everyone, unlike the Pro
           sections below — a board only works if people can see it. */}
      <section className="progress-card sticker-card" ref={leaderboardSectionRef}>
        <div className="progress-card-header">
          <h3>Leaderboard</h3>
        </div>
        <Leaderboard tabs />
      </section>

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
          {activeTab === "progress" && !isPro && lockBadge}
        </div>

        {activeTab === "accuracy" ? (
          <>
            <div className="tone-pills" role="group" aria-label="Period">
              {PERIODS.map((p) =>
                periodAllowed(tier, p) ? (
                  <button
                    key={p}
                    type="button"
                    className={`tone-pill${period === p ? " tone-pill-active" : ""}`}
                    aria-pressed={period === p}
                    onClick={() => setChosenPeriod(p)}
                  >
                    {PERIOD_LABEL[p]}
                  </button>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className="tone-pill"
                    onClick={() => {
                      track({ type: "progress_locked_cta_click", card: `accuracy_${p}` });
                      scrollToPricing();
                    }}
                  >
                    🔒 {PERIOD_LABEL[p]}
                  </button>
                ),
              )}
            </div>
            <p className="note">
              {period === "all"
                ? "Tone accuracy over every run you've played."
                : period === "last50"
                  ? "Tone accuracy over your last 50 runs."
                  : `Tone accuracy over your last 5 runs${isAccount ? "" : " on this device"}.`}
            </p>
            {accuracy.empty ? (
              <p className="note">
                {period === "last50" && last50 === null ? "Loading…" : "Play a run to see it here."}
              </p>
            ) : (
            <>
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
            {comboAccuracy.length > 0 && (
              <>
                <p className="acc-subhead">Tone pairs</p>
                <div className="breakdown">
                  {comboAccuracy.map((c) => (
                    <div
                      className="breakdown-row"
                      key={c.key}
                      aria-label={`Tone ${c.tones[0]} then tone ${c.tones[1]}: ${Math.round(c.pct)}%`}
                    >
                      <span className="syllable" aria-hidden>
                        {c.tones.map((t, i) => (
                          <span key={i}>
                            {i > 0 && " + "}
                            <span style={{ color: TONE_LINE_COLOR[t] }}>{t}</span>
                          </span>
                        ))}
                      </span>
                      <span className="bar">
                        <span
                          className="bar-fill"
                          style={{
                            width: `${c.pct}%`,
                            background: `linear-gradient(90deg, ${TONE_LINE_COLOR[c.tones[0]]}, ${TONE_LINE_COLOR[c.tones[1]]})`,
                          }}
                          aria-hidden
                        />
                      </span>
                      <span className="pct">{Math.round(c.pct)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            </>
            )}
          </>
        ) : (
          isPro ? (
            <>
              {activeKey === null ? (
                <p className="note">
                  {trendRows === null
                    ? "Loading your trend…"
                    : "Your daily trend starts with your next run."}
                </p>
              ) : (
                <>
                  <p className="note">Tone accuracy per day, from every run since you went Pro.</p>
                  <div className="tone-pills">
                    {proKeys.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`tone-pill${activeKey === k ? " tone-pill-active" : ""}`}
                        style={activeKey === k ? { background: keyColor(k) } : undefined}
                        onClick={() => setSelectedKey(k)}
                      >
                        {keyLabel(k)}
                      </button>
                    ))}
                  </div>
                  <Suspense fallback={<div className="acc-chart acc-chart-loading" aria-hidden />}>
                    <AccuracyProgressChart
                      subject={keyLabel(activeKey).toLowerCase()}
                      color={keyColor(activeKey)}
                      labels={proSeries.labels}
                      data={proSeries.data}
                    />
                  </Suspense>
                </>
              )}
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
                  subject={`tone ${selectedTone}`}
                  color={TONE_LINE_COLOR[selectedTone]}
                  labels={mock.labels}
                  data={mock.series[selectedTone]}
                  example
                />
              </Suspense>
              {lockCta(
                "🔒 Compare against your own attempts — unlock with Pro",
                "accuracy_chart",
              )}
            </>
          )
        )}
      </section>

      {/* ---- Run history: the latest 5 for everyone (brief 05). An account's
           come from the server, a guest's from this device. */}
      <section className="progress-card sticker-card">
        <div className="progress-card-header">
          <h3>Run history</h3>
          <span className="badge-solid badge-solid-jade">Last 5 runs</span>
        </div>
        {!isAccount && <p className="note">Shows runs from this device only.</p>}
        <LocalRuns history={history} />
        {!isPro &&
          lockCta("🔒 See your accuracy over 50 runs, all time and per day — unlock with Pro", "run_history")}
      </section>

      {/* ---- Tone evolution (kept from today, restyled) */}
      <section className="progress-card sticker-card">
        <div className="progress-card-header">
          <h3>See how your tones evolve over time</h3>
          {!isPro && lockBadge}
        </div>
        {isPro ? (
          // Spec B: the player's own average shape over Jane's, per tone
          // and per combo, with an earlier point to compare against.
          <PlayerToneEvolution key={version} />
        ) : (
          <>
            <SamplePlayerToneEvolution />
            {lockCta(
              "🔒 Compare against your own attempts — unlock with Pro",
              "tone_evolution",
            )}
          </>
        )}
      </section>

      {/* ---- Pricing: a Pro player already has everything for sale here, so
          the plan comparison and "Join EarlyBird" CTA are for guest/free only. */}
      {!isPro && (
      <section id="pricing" className="pricing-section">
        <div className="pricing-head">
          <h2>{brand.pricing.title}</h2>
          <p className="note">{brand.pricing.pro.payOnce}</p>
        </div>

        <div className="pricing-cards">
          <div className="sticker-card price-card price-card-current">
            <div className="price-card-head">
              <h3>
                {brand.pricing.free.label}
                <span className="badge badge-free">Your plan</span>
              </h3>
            </div>
            <ul className="price-list">
              {FREE_HIGHLIGHTS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>

          <div className="sticker-card price-card price-card-pro">
            <span className="upsell-launch">{brand.pricing.pro.launch}</span>
            <div className="price-card-head price-card-head-pro">
              <h3>
                {brand.pricing.pro.label}: {PRO_PRICE} one-time
              </h3>
            </div>
            <p className="price-value">{brand.pricing.pro.value}</p>
            <ul className="price-list price-list-pro">
              {PRO_HIGHLIGHTS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <button
              type="button"
              className="price-cta"
              onClick={() => {
                track({ type: "progress_earlybird_pricing_click" });
                // Straight to checkout; the modal only opens when checkout
                // can't (no store configured, or no account to attach it to).
                void redirectToCheckoutForCurrentAccount().then((went) => {
                  if (went) track({ type: "earlybird_checkout_opened", surface: "progress", feature: "pricing" });
                  else onEarlyBird("pricing");
                });
              }}
            >
              {brand.pricing.pro.cta}
            </button>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
