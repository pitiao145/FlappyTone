import { useState } from "react";
import type { Tone } from "../game/gates.ts";
import { comboBreakdown, toneBreakdown, type RunStats } from "../game/scoring.ts";
import { ToneMarkIcon } from "./toneIcons.tsx";
import { TONE_LINE_COLOR } from "./toneColors.ts";

/** How many pair rows show before "Show all". */
const PAIRS_SHOWN = 4;

interface Props {
  stats: RunStats;
  /** The coach card's weak tone, outlined in the grid. Game over only. */
  weakTone?: Tone | null;
  /** Extra class on each tone tile (game over sizes them up on desktop). */
  tileClassName?: string;
}

/** Whether a run measured any tone accuracy at all — the breakdown renders nothing otherwise. */
export function hasToneAccuracy(stats: RunStats): boolean {
  return (
    toneBreakdown(stats).some((b) => b.gates > 0) ||
    Object.values(stats.perCombo).some((c) => c.gates > 0)
  );
}

/**
 * This run's TONE accuracy (did the voice make the right tone, timing-free —
 * `src/game/toneAccuracy.ts`), deliberately kept apart from the score: its
 * own labelled block, percentages only, no Perfect/Good/OK.
 *
 * Only what was played renders. A tone or combo with no measured gate this
 * run has nothing honest to show, so it is left out rather than drawn as
 * "—". Two groups: single tones as tiles, pair combos as a compact list,
 * weakest first, capped with a "show all".
 *
 * Shared by the pause menu and game over so the two can't drift apart.
 * Renders nothing when nothing was measured.
 */
export function ToneAccuracyBreakdown({ stats, weakTone = null, tileClassName = "" }: Props) {
  const [allPairs, setAllPairs] = useState(false);
  const tones = toneBreakdown(stats).filter(
    (b): b is typeof b & { pct: number } => b.pct !== null && b.gates > 0,
  );
  const pairs = comboBreakdown(stats.perCombo);
  if (tones.length === 0 && pairs.length === 0) return null;

  const shownPairs = allPairs ? pairs : pairs.slice(0, PAIRS_SHOWN);
  const showGroupLabels = tones.length > 0 && pairs.length > 0;

  return (
    <div className="pause-accuracy tone-acc">
      <p className="pause-accuracy-label">This run · tone accuracy</p>

      {tones.length > 0 && (
        <div className="tone-acc-group">
          {showGroupLabels && <p className="tone-acc-group-label">Tones</p>}
          <div className="pause-accuracy-grid">
            {tones.map((b) => (
              <div
                className={`pause-tone-card ${tileClassName}${
                  weakTone === b.tone ? " go-tone-tile-weak" : ""
                }`}
                key={b.tone}
                aria-label={`Tone ${b.tone}: ${Math.round(b.pct)}% tone accuracy`}
              >
                <ToneMarkIcon tone={b.tone} className="pause-tone-icon" />
                <div className="pause-tone-bar">
                  <div className="pause-tone-bar-fill" style={{ width: `${Math.round(b.pct)}%` }} />
                </div>
                <span className="pause-tone-pct">{Math.round(b.pct)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pairs.length > 0 && (
        <div className="tone-acc-group">
          {showGroupLabels && <p className="tone-acc-group-label">Tone pairs</p>}
          <ul className="tone-acc-pairs">
            {shownPairs.map((p) => (
              <li
                className="tone-acc-pair"
                key={p.key}
                aria-label={`Tone ${p.tones[0]} then tone ${p.tones[1]}: ${Math.round(p.pct)}% tone accuracy`}
              >
                <span className="tone-acc-pair-label" aria-hidden="true">
                  {p.tones.map((t, i) => (
                    <span key={i} className="tone-acc-pair-mark" style={{ color: TONE_LINE_COLOR[t] }}>
                      <ToneMarkIcon tone={t} />
                    </span>
                  ))}
                </span>
                <div className="pause-tone-bar">
                  <div className="pause-tone-bar-fill" style={{ width: `${Math.round(p.pct)}%` }} />
                </div>
                <span className="pause-tone-pct">{Math.round(p.pct)}%</span>
              </li>
            ))}
          </ul>
          {pairs.length > PAIRS_SHOWN && (
            <button type="button" className="tone-acc-more" onClick={() => setAllPairs((v) => !v)}>
              {allPairs ? "Show fewer" : `Show all ${pairs.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
