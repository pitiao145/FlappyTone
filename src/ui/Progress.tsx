import { useEffect, useMemo, useState } from "react";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import {
  loadRunHistory,
  toneAccuracyFromHistory,
  type RunOutcome,
} from "../game/runHistory.ts";
import { loadStreak } from "../game/streak.ts";
import type { Word } from "../game/words.ts";
import { ToneAverageCard } from "./ToneAverageCard.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  finished: "finished",
  out_of_hearts: "out of hearts",
  quit: "quit",
};

interface Props {
  onEarlyBird: (feature: string) => void;
}

/**
 * The Progress tab: real lifetime stats and last-5-run tone accuracy from
 * `runHistory.ts`, alongside honest "Soon" fake doors (streak, level,
 * leaderboard, comparing your own trace against the native target) that
 * open the EarlyBird modal. See docs/PRD.md §8 (screen 2b/2c neighbours) —
 * this isn't a spec'd screen, it's the teaser CLAUDE.md's session note
 * describes.
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

  return (
    <div className="screen progress-screen">
      <h2>Your progress</h2>
      <p className="note">Saved on this device · sign up to keep it forever</p>

      <div className="teaser-row">
        <div className="teaser-card teaser-card-live">
          <span className="teaser-icon" aria-hidden>
            🔥
          </span>
          <span className="teaser-big">
            {streak.current} {streak.current === 1 ? "day" : "days"}
          </span>
          <span className="teaser-label">streak</span>
          {streak.best > streak.current && (
            <span className="teaser-sub">best {streak.best}</span>
          )}
          <button
            type="button"
            className="link teaser-cta"
            onClick={() => onEarlyBird("streak")}
          >
            🔒 Keep across devices
          </button>
        </div>
        <button
          type="button"
          className="teaser-card teaser-card-soon"
          onClick={() => onEarlyBird("level")}
        >
          <span className="badge badge-soon teaser-badge-top">🔒 Soon</span>
          <span className="teaser-label">Level</span>
          <span className="teaser-big">Level 4</span>
          <span className="teaser-bar">
            <span className="teaser-bar-fill" style={{ width: "45%" }} />
          </span>
          <span className="teaser-label">Earn XP & rank up</span>
        </button>
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

      <section className="progress-card">
        <div className="progress-card-header">
          <h3>Accuracy per tone</h3>
        </div>
        <p className="note">Averaged over your last {Math.min(5, history.lastRuns.length)} runs.</p>
        <div className="breakdown">
          {toneAccuracy.map((t) => (
            <div className="breakdown-row" key={t.tone}>
              <span className="syllable">Tone {t.tone}</span>
              <span className="bar">
                <span className="bar-fill" style={{ width: `${t.pct ?? 0}%` }} aria-hidden />
              </span>
              <span className="pct">{t.pct === null ? "—" : `${Math.round(t.pct)}%`}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="progress-card progress-card-soon">
        <div className="progress-card-header">
          <h3>See how your tones evolve over time</h3>
          <span className="badge badge-soon">🔒 Soon</span>
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
          onClick={() => onEarlyBird("tone_shape")}
        >
          🔒 Compare against your own attempts — EarlyBird access
        </button>
      </section>

      <section className="progress-card progress-card-soon">
        <div className="progress-card-header">
          <h3>Leaderboard</h3>
          <span className="badge badge-soon">🔒 Soon</span>
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
          onClick={() => onEarlyBird("leaderboard")}
        >
          🔒 Compete weekly — EarlyBird access
        </button>
      </section>

      <section className="progress-card">
        <div className="progress-card-header">
          <h3>Run history</h3>
          <span className="badge badge-free">Last 5 runs</span>
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
                  <span className={`badge badge-outcome-${run.outcome}`}>
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
          onClick={() => onEarlyBird("run_history")}
        >
          🔒 See all {history.totalRuns} runs & trends — EarlyBird access
        </button>
      </section>
    </div>
  );
}
