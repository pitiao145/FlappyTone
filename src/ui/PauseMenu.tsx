import { useState } from "react";
import { CORRIDOR_WIDTHS, type CorridorWidth } from "../game/gates.ts";
import type { CueStyle, RunMode } from "../game/run.ts";
import type { RunStats } from "../game/scoring.ts";
import { toneBreakdown } from "../game/scoring.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadShowTranslation,
  saveCorridorWidth,
  saveCueStyle,
  saveShowTranslation,
} from "../game/settings.ts";
import { Choice } from "./Choice.tsx";
import { ChevronIcon, ToneMarkIcon } from "./toneIcons.tsx";
import { GearIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons.tsx";
import { Switch } from "./Switch.tsx";

const WIDTH_HELP: Record<CorridorWidth, string> = {
  narrow: "Demanding. Your pitch has to sit close to the line.",
  normal: "Moderate difficulty. Good for practice.",
  wide: "Forgiving on pitch. Good while a tone is still new.",
};

interface Props {
  mode: RunMode;
  score: number;
  /** How many "game" runs this session, this one included — null in the tutorial, which doesn't count. */
  runNumber: number | null;
  /** The run in progress, for the tone-accuracy bars. Null in the tutorial. */
  stats: RunStats | null;
  /** Controlled so the HUD's gear button can pause straight into an expanded card. */
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onCueStyle?: (style: CueStyle) => void;
  onShowTranslation?: (show: boolean) => void;
}

/**
 * Paused, merged with what used to be a second screen behind a "Game
 * options" reveal — one card instead of two, on the theory that a player who
 * paused to check their score and a player who paused to widen the tunnel
 * are usually the same player mid-run, not two different visits. Settings
 * stay collapsed by default: they're here to be found, not to compete with
 * Resume for the first glance.
 */
export function PauseMenu({
  mode,
  score,
  runNumber,
  stats,
  settingsOpen,
  onToggleSettings,
  onResume,
  onRestart,
  onQuit,
  onCueStyle,
  onShowTranslation,
}: Props) {
  const [width, setWidth] = useState<CorridorWidth>(loadCorridorWidth);
  // "off" is disabled below (broken), so a previously-persisted "off" is
  // coerced back to "pause" rather than silently staying selected.
  const [cueStyle, setCueStyle] = useState<CueStyle>(() => {
    const loaded = loadCueStyle();
    return loaded === "off" ? "pause" : loaded;
  });
  const [translation, setTranslation] = useState<boolean>(loadShowTranslation);

  const breakdown = stats ? toneBreakdown(stats) : null;

  return (
    <div className="pause-card">
      <div className="pause-header">
        <span className="pause-badge">
          <PauseIcon />
          Paused
        </span>
        {mode === "game" && (
          <span className="pause-score">
            <span className="pause-score-num">{score}</span>
            <span className="pause-score-caption">
              points{runNumber !== null ? ` · run ${runNumber}` : ""}
            </span>
          </span>
        )}
      </div>

      {mode === "game" && breakdown && (
        <div className="pause-accuracy">
          <p className="pause-accuracy-label">This run — tone accuracy</p>
          <div className="pause-accuracy-grid">
            {breakdown.map((b) => (
              <div className="pause-tone-card" key={b.tone}>
                <ToneMarkIcon tone={b.tone} className="pause-tone-icon" />
                <div className="pause-tone-bar">
                  <div
                    className="pause-tone-bar-fill"
                    style={{ width: `${Math.round(b.pct ?? 0)}%` }}
                  />
                </div>
                <span className="pause-tone-pct">
                  {b.pct === null ? "—" : `${Math.round(b.pct)}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="primary resume-button" onClick={onResume}>
        <PlayIcon />
        Resume
      </button>

      <div className="pause-action-row">
        <button className="pause-secondary" onClick={onRestart}>
          <RestartIcon />
          Restart
        </button>
        <button className="pause-secondary pause-quit" onClick={onQuit}>
          ■ Quit
        </button>
      </div>

      <div className="pause-divider" />

      <button
        type="button"
        className="pause-settings-toggle"
        aria-expanded={settingsOpen}
        onClick={onToggleSettings}
      >
        <GearIcon />
        Game settings
        <ChevronIcon open={settingsOpen} className="pause-settings-chevron" />
      </button>

      {settingsOpen && (
        <div className="pause-settings-body">
          <section>
            <h4>Tunnel width</h4>
            <Choice
              options={CORRIDOR_WIDTHS}
              value={width}
              onChange={(w) => {
                setWidth(w);
                saveCorridorWidth(w);
              }}
            />
            <p className="param-help">
              {WIDTH_HELP[width]} Takes effect next run.
            </p>
          </section>

          <Switch
            checked={translation}
            onChange={(show) => {
              setTranslation(show);
              saveShowTranslation(show);
              onShowTranslation?.(show);
            }}
            label="Translation"
            sublabel="English meaning above the pinyin"
          />

          <div>
            <Switch
              checked={cueStyle === "pause"}
              disabled
              onChange={(on) => {
                if (!on) return;
                const style: CueStyle = "pause";
                setCueStyle(style);
                saveCueStyle(style);
                onCueStyle?.(style);
              }}
              label="Listen-first example"
              sublabel="Native speaker says it, then your turn"
            />
            <p className="param-help">
              Turning it off is coming in a future update.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
