import { useEffect, useMemo, useState } from "react";
import { adoptInventory, inventoryNow, inventorySpeaker, loadInventory } from "../audio/inventory.ts";
import { ensureMic, stopMic } from "../audio/session.ts";
import { catalogFromFallback } from "../data/words.ts";
import {
  applyCorridorWidth,
  CORRIDOR_WIDTHS,
  newDifficulty,
  toleranceChao,
  type CorridorWidth,
  type Tone,
} from "../game/gates.ts";
import type { RunMode, RunSnapshot } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadSettings,
  saveCorridorWidth,
  type CalibrationSettings,
} from "../game/settings.ts";
import { multiWords, type Word } from "../game/words.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import { Choice } from "../ui/Choice.tsx";
import { Game } from "../ui/Game.tsx";
import { Visualiser } from "../ui/Visualiser.tsx";
import { FIXTURE_WORDS } from "./fixtureWords.ts";
import { GateStage } from "./GateStage.tsx";
import { PairGates } from "./PairGates.tsx";
import { ToneAverages } from "./ToneAverages.tsx";
import { TonePairs } from "./TonePairs.tsx";
import { TuningPanel } from "./TuningPanel.tsx";
import { WordGates } from "./WordGates.tsx";

type Tab = "play" | "words" | "averages" | "visualiser" | "tonepairs" | "pairgates";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "play", label: "Play", hint: "Fly one gate or a full run while moving the tuning sliders" },
  { id: "pairgates", label: "Pair gates", hint: "Every two-syllable gate, per tone combo and speech style" },
  { id: "words", label: "Words", hint: "Every single-syllable corridor, drawn at the current tuning" },
  { id: "averages", label: "Averages", hint: "The averaged tone shapes the classifier reads against" },
  { id: "visualiser", label: "Visualiser", hint: "The player-facing visualiser, for testing the recogniser" },
  { id: "tonepairs", label: "Tone pairs", hint: "Measured pair fixtures against the textbook sandhi shapes" },
];

/**
 * Calibration to run on when the Lab is opened on a machine that has never
 * calibrated. The Lab must never block on a 30-second flow that has nothing to
 * do with what is being tuned.
 */
const FALLBACK_SETTINGS: CalibrationSettings = {
  f0Center: DEFAULT_CONFIG.f0Center,
  noiseFloor: DEFAULT_CONFIG.noiseFloor,
  rangeSemitones: DEFAULT_CONFIG.rangeSemitones,
  rangeDownSemitones: DEFAULT_CONFIG.rangeDownSemitones,
};

const TONES: Tone[] = [1, 2, 3, 4];

interface Props {
  onBack: () => void;
}

/**
 * The dev Lab: a second, disposable instance of the game that exists to be
 * measured and re-tuned, kept out of the player-facing app entirely.
 *
 * Dev builds only — GameApp imports this lazily behind `import.meta.env.DEV`,
 * so Rollup drops the whole subtree (and the tuning UI with it) from a
 * production bundle.
 */
export function Lab({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>("play");
  const [settings] = useState<CalibrationSettings>(() => loadSettings() ?? FALLBACK_SETTINGS);
  const [corridorWidth, setCorridorWidth] = useState<CorridorWidth>(loadCorridorWidth);

  /**
   * The catalog the game itself would fly: whatever the inventory already
   * holds (seeded from the bundled export), upgraded to the live read once it
   * lands — the live read is the only one that carries natural takes. A word
   * list that changes mid-session is acceptable here; the picker keys on ids.
   */
  const [words, setWords] = useState<Word[]>(() => inventoryNow() ?? catalogFromFallback());
  useEffect(() => {
    let live = true;
    void loadInventory().then((w) => {
      if (live && w.length > 0) setWords(w);
    });
    return () => {
      live = false;
    };
  }, []);

  /** Pairs in the catalog, else (dev only) the four fixture words, so pairs can be flown before any is published. */
  const pairs = useMemo(() => {
    const real = multiWords(words);
    return real.length > 0 ? real : FIXTURE_WORDS;
  }, [words]);

  return (
    <div className="screen lab-screen">
      <header className="lab-header">
        <button className="lab-exit" onClick={onBack}>
          Exit lab
        </button>
        <h2 className="lab-title">Lab</h2>
        <nav className="lab-tabs" aria-label="Lab sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? "tab active" : "tab"}
              aria-current={t.id === tab ? "page" : undefined}
              title={t.hint}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="lab-width">
          <span className="param-name">Tunnel width</span>
          <Choice
            options={CORRIDOR_WIDTHS}
            value={corridorWidth}
            onChange={(w) => {
              setCorridorWidth(w);
              saveCorridorWidth(w);
            }}
          />
        </div>
      </header>

      <main className="lab-body">
        {tab === "play" && (
          <PlayTab words={words} pairs={pairs} settings={settings} corridorWidth={corridorWidth} />
        )}
        {tab === "pairgates" && (
          <PairGates pairs={pairs} settings={settings} corridorWidth={corridorWidth} />
        )}
        {tab === "words" && <WordGates />}
        {tab === "averages" && <ToneAverages />}
        {tab === "tonepairs" && <TonePairs />}
        {tab === "visualiser" && (
          <div className="lab-pane lab-pane-stage">
            <Visualiser settings={settings} canvasWidth={360} canvasHeight={640} />
          </div>
        )}
      </main>
    </div>
  );
}

function PlayTab({
  words,
  pairs,
  settings,
  corridorWidth,
}: {
  words: Word[];
  pairs: Word[];
  settings: CalibrationSettings;
  corridorWidth: CorridorWidth;
}) {
  const [toneFilter, setToneFilter] = useState<Tone | "all">("all");
  const [selected, setSelected] = useState<Word | null>(null);
  const singles = useMemo(() => words.filter((w) => w.syllables === 1), [words]);
  const shown = useMemo(
    () => (toneFilter === "all" ? singles : singles.filter((w) => w.tone === toneFilter)),
    [singles, toneFilter],
  );
  // Default to the first word once the list lands, without overriding a pick.
  const word = selected ?? singles[0] ?? null;

  return (
    <div className="lab-grid lab-grid-play">
      <section className="lab-pane lab-pane-picker" aria-label="Choose a word">
        <div className="pane-head">
          <h3>Word</h3>
          <div className="chips" role="group" aria-label="Tone">
            {(["all", ...TONES] as const).map((k) => (
              <button
                key={k}
                className={k === toneFilter ? "chip active" : "chip"}
                aria-pressed={k === toneFilter}
                onClick={() => setToneFilter(k)}
              >
                {k === "all" ? "All" : `T${k}`}
              </button>
            ))}
          </div>
        </div>
        {singles.length === 0 && (
          <p className="lab-empty">
            The catalog has no words yet. Run `npm run export-fallback`, or check that Supabase is
            reachable.
          </p>
        )}
        <ul className="word-list">
          {shown.map((w) => (
            <li key={w.id}>
              <button
                className={w.id === word?.id ? "word-item active" : "word-item"}
                aria-pressed={w.id === word?.id}
                onClick={() => setSelected(w)}
              >
                <span className="word-hanzi">{w.hanzi}</span>
                <span className="word-pinyin">{w.pinyin}</span>
                <span className={`word-tone t${w.tone}`}>T{w.tone}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="lab-pane lab-pane-stage" aria-label="Gate">
        <GateStage word={word} settings={settings} corridorWidth={corridorWidth} showCitation={false} />
        <EffectiveSettings corridorWidth={corridorWidth} />
        <FullRun pairs={pairs} words={words} settings={settings} />
      </section>

      <section className="lab-pane lab-pane-tuning" aria-label="Tuning">
        <TuningPanel />
      </section>
    </div>
  );
}

/**
 * The numbers tunnel width actually produces, once its factor is applied on top
 * of the tuning sliders. Polls rather than subscribing: `tuning()` is a mutable
 * singleton, not React state, so a slider dragged elsewhere has no event to hear.
 */
function EffectiveSettings({ corridorWidth }: { corridorWidth: CorridorWidth }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const d = applyCorridorWidth(newDifficulty(), corridorWidth);
  return (
    <details className="lab-fold">
      <summary>Effective values at {corridorWidth} width</summary>
      <pre className="diff">
        {`scroll speed       ${d.scrollSpeed.toFixed(0)} px/s
rest between gates ${d.restMs.toFixed(0)} ms
tunnel half-height ${d.toleranceH.toFixed(3)} of canvas height
tolerance in chao  ${TONES.map((t) => `T${t} ${toleranceChao(t, d.toleranceH).toFixed(2)}`).join("  ")}`}
      </pre>
    </details>
  );
}

/** A whole scored run, for checking pacing and difficulty rather than one gate. */
function FullRun({
  pairs,
  words,
  settings,
}: {
  pairs: Word[];
  words: Word[];
  settings: CalibrationSettings;
}) {
  const [runMode, setRunMode] = useState<RunMode>("game");
  const [runKey, setRunKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      await ensureMic();
      // Game.tsx reads a run's pool from the live inventory, so a pairs run has
      // to adopt the pair pool through the same seam a catalog switch uses.
      adoptInventory(runMode === "pairs" ? "lab-pairs" : inventorySpeaker(), runMode === "pairs" ? pairs : words);
      setLast(null);
      setRunKey((k) => k + 1);
      setRunning(true);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Microphone failed");
    }
  };

  const stop = () => {
    setRunning(false);
    stopMic();
  };

  return (
    <details className="lab-fold">
      <summary>Full run instead of one gate</summary>
      {running ? (
        <Game
          key={runKey}
          mode={runMode}
          settings={settings}
          canvasWidth={360}
          canvasHeight={640}
          onOver={(snap) => {
            setLast(snap);
            setRunning(false);
          }}
          onQuit={stop}
        />
      ) : (
        <div className="lab-fold-body">
          <div className="game-settings-row">
            <span className="param-name">Mode</span>
            <Choice
              options={["game", "pairs"] as const}
              value={runMode as "game" | "pairs"}
              onChange={setRunMode}
            />
          </div>
          <p className="param-help">
            Uses your saved calibration{loadSettings() === null ? " (none yet, so defaults)" : ""},{" "}
            {loadCorridorWidth()} tunnel, demo {loadCueStyle() === "off" ? "off" : "on"}.
          </p>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={runMode === "pairs" && pairs.length === 0} onClick={() => void start()}>
            {last ? "Run again" : "Start a run"}
          </button>
          {last && (
            <pre className="diff">
              {`score ${last.score}  gates ${last.gateLog.length}
unheard ${last.gateLog.filter((g) => g.outcome === "unheard").length}  collisions ${last.gateLog.filter((g) => g.outcome === "collision").length}
missed early ${last.missedUtterances}
worst excursion ${Math.round(Math.max(0, ...last.gateLog.map((g) => g.worstExcursionMs)))}ms`}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
