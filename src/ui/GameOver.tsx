import { TONE_INFO } from "../game/gates.ts";
import { takeaway, toneBreakdown, type RunStats } from "../game/scoring.ts";

interface Props {
  stats: RunStats;
  onRetry: () => void;
  onHome: () => void;
}

export function GameOver({ stats, onRetry, onHome }: Props) {
  const breakdown = toneBreakdown(stats);

  return (
    <div className="screen gameover-screen">
      <h2>Run over</h2>
      <p className="score-big">{stats.score}</p>
      <p className="note">best multiplier ×{stats.bestMultiplier}</p>

      <div className="breakdown">
        {breakdown.map((b) => (
          <div className="breakdown-row" key={b.tone}>
            <span className="syllable">{TONE_INFO[b.tone].pinyin}</span>
            <span className="tone-num">({b.tone})</span>
            <span className="bar">
              <span
                className="bar-fill"
                style={{ width: `${b.pct ?? 0}%` }}
                aria-hidden
              />
            </span>
            <span className="pct">
              {b.pct === null ? "—" : `${Math.round(b.pct)}%`}
            </span>
            {b.unheard > 0 && (
              <span className="unheard">couldn't hear ×{b.unheard}</span>
            )}
          </div>
        ))}
      </div>

      <p className="prompt">{takeaway(breakdown)}</p>

      <div className="menu">
        <button className="primary" onClick={onRetry}>
          Retry
        </button>
        <button onClick={onHome}>Home</button>
      </div>
    </div>
  );
}
