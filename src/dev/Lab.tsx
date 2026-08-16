import { useEffect, useMemo, useRef, useState } from "react";
import { loadInventory } from "../audio/inventory.ts";
import { ensureMic, setFrameSink, stopMic } from "../audio/session.ts";
import { setActiveTracker } from "../game/activeTracker.ts";
import { REST_CHAO } from "../game/dynamics.ts";
import {
  applyCorridorWidth,
  corridorChaoAt,
  CORRIDOR_WIDTHS,
  newDifficulty,
  shapeForTone,
  toleranceChao,
  type CorridorWidth,
  type Tone,
} from "../game/gates.ts";
import {
  configureTracker,
  handleFrame,
  startLoop,
} from "../game/loop.ts";
import { birdXFrac, type RunSnapshot } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadSettings,
  saveCorridorWidth,
  type CalibrationSettings,
} from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawDot } from "../render/scene.ts";
import { drawGate } from "../render/world.ts";
import { Choice } from "../ui/Choice.tsx";
import { Game } from "../ui/Game.tsx";
import { Capture } from "./Capture.tsx";
import { DevPanel } from "./DevPanel.tsx";
import { GateLogPanel } from "./GateLogPanel.tsx";
import { ToneAverages } from "./ToneAverages.tsx";
import { TuningPanel } from "./TuningPanel.tsx";
import { WordGates } from "./WordGates.tsx";

type Tab = "play" | "words" | "averages" | "pitch" | "gates" | "capture";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "play", label: "play" },
  { id: "words", label: "words" },
  { id: "averages", label: "averages" },
  { id: "pitch", label: "pitch" },
  { id: "gates", label: "gates" },
  { id: "capture", label: "capture" },
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

interface Props {
  onBack: () => void;
}

/**
 * The dev Lab: a second, disposable instance of the game that exists to be
 * measured and re-tuned, kept out of the player-facing app entirely.
 *
 * Dev builds only — App.tsx imports this lazily behind `import.meta.env.DEV`,
 * so Rollup drops the whole subtree (and Capture and the tuning
 * UI with it) from a production bundle.
 */
export function Lab({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>("play");
  const [settings] = useState<CalibrationSettings>(
    () => loadSettings() ?? FALLBACK_SETTINGS,
  );
  /** Bumped to tear down and rebuild the run — how a tuning change is applied. */
  const [runKey, setRunKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restart = async () => {
    setError(null);
    try {
      // Inside the click handler — iOS grants getUserMedia only during a gesture.
      await ensureMic();
      setLast(null);
      setRunKey((k) => k + 1);
      setRunning(true);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "mic failed");
    }
  };

  const stop = () => {
    setRunning(false);
    stopMic();
  };

  const [words, setWords] = useState<Word[] | null>(null);
  const [toneFilter, setToneFilter] = useState<Tone | "all">("all");
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [gateKey, setGateKey] = useState(0);
  const [flyingGate, setFlyingGate] = useState(false);
  const [gateResult, setGateResult] = useState<RunSnapshot | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  /**
   * The player-facing width setting — same localStorage the pause menu
   * writes to, so a choice made here is also what "test" (which reads it
   * fresh via `loadCorridorWidth` at mount) and a full run actually fly.
   * Without this the preview's tolerance and the tolerance a test gate is
   * scored against could silently disagree with what's shown.
   */
  const [corridorWidth, setCorridorWidth] = useState<CorridorWidth>(loadCorridorWidth);
  /**
   * Lab-only inspection toggle — overlays the citation T3 polyline (the shape
   * `shapeForWord` substitutes in for every T3 gate, per its comment in
   * gates.ts) on top of the word's own measured contour, so the two can be
   * compared. `GatePreview` never calls `shapeForWord` for its primary
   * corridor — it always draws `word.polyline` — so this is purely a paused,
   * dev-only canvas overlay. It touches no exported game function, so real
   * gates (`makeGate`/`shapeForWord`) are unaffected either way.
   */
  const [showCitation, setShowCitation] = useState(false);

  useEffect(() => {
    loadInventory().then(
      (w) => {
        setWords(w);
        setSelectedWord((cur) => cur ?? w[0] ?? null);
      },
      () => setWords([]),
    );
  }, []);

  const testGate = async () => {
    setGateError(null);
    try {
      await ensureMic();
      setGateResult(null);
      setGateKey((k) => k + 1);
      setFlyingGate(true);
    } catch (err) {
      setFlyingGate(false);
      setGateError(err instanceof Error ? err.message : "mic failed");
    }
  };

  const stopGate = () => {
    setFlyingGate(false);
    stopMic();
  };

  return (
    <div className="screen lab-screen">
      <header className="lab-header">
        <button className="link" onClick={onBack}>
          ← exit lab
        </button>
        <nav className="lab-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      {tab === "play" && (
        <div className="lab-play-grid">
          <div className="lab-picker">
            <GatePicker
              words={words}
              tone={toneFilter}
              onTone={setToneFilter}
              selected={selectedWord}
              onSelect={(w) => {
                setSelectedWord(w);
                setGateResult(null);
              }}
            />
          </div>

          <div className="lab-stage">
            {flyingGate && selectedWord ? (
              <Game
                key={gateKey}
                mode="single"
                singleWord={selectedWord}
                settings={settings}
                canvasWidth={360}
                canvasHeight={640}
                onOver={(snap) => {
                  setGateResult(snap);
                  setFlyingGate(false);
                }}
                onQuit={stopGate}
              />
            ) : (
              <div className="lab-idle">
                <GatePreview
                  word={selectedWord}
                  corridorWidth={corridorWidth}
                  showCitation={showCitation}
                />
                {selectedWord?.tone === 3 && (
                  <label className="param-help lab-checkbox">
                    <input
                      type="checkbox"
                      checked={showCitation}
                      onChange={(e) => setShowCitation(e.target.checked)}
                    />
                    overlay old citation T3 shape (no longer what the game flies)
                  </label>
                )}
                {gateError && <p className="error">{gateError}</p>}
                <button
                  className="primary"
                  disabled={!selectedWord}
                  onClick={() => void testGate()}
                >
                  test
                </button>
                {gateResult?.gateLog[0] && (
                  <p className="param-help">
                    {gateResult.gateLog[0].outcome} · accuracy{" "}
                    {Math.round(gateResult.gateLog[0].accuracy * 100)}%
                  </p>
                )}
              </div>
            )}

            <div className="lab-idle game-settings game-settings-compact">
              <div className="game-settings-row">
                <span className="param-name">tunnel width</span>
                <Choice
                  options={CORRIDOR_WIDTHS}
                  value={corridorWidth}
                  onChange={(w) => {
                    setCorridorWidth(w);
                    saveCorridorWidth(w);
                  }}
                />
              </div>
              <p className="param-help">
                Same setting the pause menu writes. It is a factor on top of
                the tuning sliders, not a slider of its own — the actual
                numbers a run flies with:
              </p>
              <EffectiveSettings corridorWidth={corridorWidth} />
            </div>

            <details className="lab-idle">
              <summary className="param-help">full run instead</summary>
              {running ? (
                <Game
                  key={runKey}
                  mode="game"
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
                <div className="lab-idle">
                  <p className="param-help">
                    Runs on {loadCorridorWidth()} tunnel ·{" "}
                    demo {loadCueStyle() === "off" ? "off" : "on"}, and on your saved calibration
                    {loadSettings() === null ? " (none — using defaults)" : ""}.
                  </p>
                  <button className="primary" onClick={() => void restart()}>
                    {last ? "run again" : "start a run"}
                  </button>
                  {last && (
                    <pre className="diff">
                      {`score ${last.score}  ·  gates ${last.gateLog.length}
unheard ${last.gateLog.filter((g) => g.outcome === "unheard").length}  ·  collisions ${last.gateLog.filter((g) => g.outcome === "collision").length}
missed early ${last.missedUtterances}
worst excursion ${Math.round(Math.max(0, ...last.gateLog.map((g) => g.worstExcursionMs)))}ms`}
                    </pre>
                  )}
                </div>
              )}
            </details>
          </div>
          <div className="lab-controls">
            <TuningPanel />
          </div>
        </div>
      )}

      {tab === "words" && <WordGates />}

      {tab === "averages" && <ToneAverages />}

      {tab === "pitch" && <PitchTab />}

      {tab === "gates" && (
        <div className="lab-controls">
          <GateLogPanel />
          <p className="param-help">
            The full per-gate log for the last run, live-mirrored to
            localStorage — a run ended by quitting or by closing the tab still
            leaves its numbers here, and a run flown outside the Lab lands here
            too.
          </p>
        </div>
      )}

      {tab === "capture" && <Capture onBack={() => setTab("play")} />}

    </div>
  );
}

const TONES: Tone[] = [1, 2, 3, 4];

/** Tone filter + the matching word list, for picking one gate to test. */
function GatePicker({
  words,
  tone,
  onTone,
  selected,
  onSelect,
}: {
  words: Word[] | null;
  tone: Tone | "all";
  onTone: (t: Tone | "all") => void;
  selected: Word | null;
  onSelect: (w: Word) => void;
}) {
  const shown = useMemo(
    () => (tone === "all" ? (words ?? []) : (words ?? []).filter((w) => w.tone === tone)),
    [words, tone],
  );

  return (
    <div className="gate-picker">
      <nav className="lab-tabs">
        {(["all", ...TONES] as const).map((k) => (
          <button
            key={k}
            className={k === tone ? "tab active" : "tab"}
            onClick={() => onTone(k)}
          >
            {k === "all" ? "all" : `T${k}`}
          </button>
        ))}
      </nav>
      {words === null && <p className="param-help">loading the manifest…</p>}
      {words?.length === 0 && (
        <p className="param-help">
          The inventory is empty — public/ref/manifest.json did not load.
        </p>
      )}
      <div className="gate-picker-list">
        {shown.map((w) => (
          <button
            key={w.id}
            className={w.id === selected?.id ? "gate-picker-item active" : "gate-picker-item"}
            onClick={() => onSelect(w)}
          >
            {w.pinyin} {w.hanzi} <span className="param-help">· {w.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TONE_LIST: Tone[] = [1, 2, 3, 4];

/**
 * The numbers speed/tunnel width actually produce, once their factor is
 * applied on top of whatever the tuning sliders currently say — the sliders
 * themselves never move, so without this readout "narrow" or "relaxed" is a
 * label with no visible number behind it.
 *
 * Polls rather than subscribing: `tuning()` is a mutable singleton (see
 * TuningPanel), not React state, so a slider dragged elsewhere on the page
 * has no event this component could listen for.
 */
function EffectiveSettings({
  corridorWidth,
}: {
  corridorWidth: CorridorWidth;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const d = applyCorridorWidth(newDifficulty(), corridorWidth);

  return (
    <pre className="diff">
      {`scroll speed      ${d.scrollSpeed.toFixed(0)} px/s
rest between gates ${d.restMs.toFixed(0)} ms
tunnel half-height  ${d.toleranceH.toFixed(3)}  (fraction of canvas height)
tolerance in chao   ${TONE_LIST.map((t) => `T${t} ${toleranceChao(t, d.toleranceH).toFixed(2)}`).join("  ")}`}
    </pre>
  );
}

/**
 * A single gate, paused: the Chao grid and the corridor the selected word
 * would fly, drawn with the same functions the live game draws with, at the
 * game's own canvas size. Redraws on every frame while idle so a slider
 * dragged in TuningPanel — a mutable singleton, not React state — shows up
 * immediately without any extra wiring back to this component.
 *
 * The grid is drawn a second time, on top of the gate. `drawGate` paints its
 * wall near-opaque on purpose (PRD: the grid should "survive only inside the
 * open channel" during play), but a wide corridor's wall is a sliver and a
 * paused inspection view has no channel/wall distinction to teach — the grid
 * is a measuring stick here, and it must stay legible under the whole gate,
 * not just the parts outside it.
 *
 * The dot sits at rest (chao 3) at the tuned `birdXFrac` — the one PACING
 * knob ("dot position") this static view can show without actually flying:
 * everything else in PACING/DOT/JUDGING is a timing or animation behaviour
 * that only exists while a gate is being flown, so "test" is what shows those.
 *
 * `corridorWidth` is the player's width setting (see `game-settings` above),
 * applied the same way `Run` applies it — through `toleranceChao`, then
 * `applyCorridorWidth` — so "narrow" and "wide" flare the drawn tunnel
 * exactly as much as they would in an actual run. The gate's pixel width
 * comes from the same formula `makeGate` uses: `scrollSpeed *
 * shape.durationS`. Stretching the polyline across the full canvas instead
 * (the previous behaviour) drew every gate at the same width regardless of
 * the tone's actual duration, which flattened or steepened corridors
 * relative to how they actually fly — the preview must use the same pixel
 * width the game computes or it stops matching gameplay.
 * The gate starts (t=0) at the bird's x, matching the moment the player
 * begins flying it in a live run — the dot sits at the gate's own entrance
 * rather than partway through the corridor.
 *
 * The corridor drawn here is always the word's own measured shape
 * (`word.polyline`/`word.durationS`) — as of 16 Aug 2026 this is what
 * `shapeForWord` returns for every tone including 3, now that `clipCut.ts`
 * measures all 30 T3 words' real dip-and-rise instead of falling back to one
 * synthetic citation polyline. `showCitation` optionally overlays that old
 * citation shape (`shapeForTone(3)`) as a second dashed line, kept as a
 * historical/QA comparison — it is no longer what a real run flies for any
 * word. Neither of these calls `shapeForWord` or touches anything
 * `makeGate`/a real run reads — this is a paused canvas-only overlay,
 * gameplay is untouched either way.
 */
function GatePreview({
  word,
  corridorWidth,
  showCitation,
}: {
  word: Word | null;
  corridorWidth: CorridorWidth;
  showCitation: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const { width, height } = canvas;
        ctx.fillStyle = BACKDROP;
        ctx.fillRect(0, 0, width, height);
        drawChaoGrid(ctx, width, height);
        if (word) {
          const baseTol = toleranceChao(word.tone, tuning().baseToleranceH);
          const d = applyCorridorWidth(
            { scrollSpeed: tuning().baseScrollSpeed, toleranceH: baseTol, restMs: 0 },
            corridorWidth,
          );
          const shape = { polyline: word.polyline, durationS: word.durationS };
          const widthPx = d.scrollSpeed * shape.durationS;
          const dotX = width * birdXFrac();
          const x0 = dotX;
          const x1 = dotX + widthPx;
          drawGate(
            ctx,
            width,
            height,
            {
              tone: word.tone,
              word,
              shape,
              x0,
              x1,
              tolChao: d.toleranceH,
              xStart: 0,
            },
            true,
          );
          if (showCitation && word.tone === 3) {
            drawCentrelineOverlay(ctx, height, shapeForTone(3), x0, x1);
          }
        }
        drawChaoGrid(ctx, width, height);
        drawDot(ctx, width, height, REST_CHAO, width * birdXFrac(), true, 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [word, corridorWidth, showCitation]);

  return (
    <div className="stage">
      <canvas ref={canvasRef} width={360} height={640} />
    </div>
  );
}

/**
 * A single dashed centreline for a shape, drawn over an already-rendered
 * gate — the "what the game actually flies" overlay for T3. Deliberately
 * bare compared to `drawGate`'s own ghost centreline (no corridor fill or
 * wall): the primary gate already carries that, and a second wall here would
 * just be visual noise on top of it.
 */
function drawCentrelineOverlay(
  ctx: CanvasRenderingContext2D,
  height: number,
  shape: Parameters<typeof corridorChaoAt>[0],
  x0: number,
  x1: number,
): void {
  const steps = 60;
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(200, 60, 60, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + t * (x1 - x0);
    const y = chaoToY(corridorChaoAt(shape, t), height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The Step-0 prototype: one dot, the Chao grid, a trail, and the tracker
 * controls. No gates — pitch tuning should not require flying anything.
 */
function PitchTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!live) return;
    const saved = loadSettings();
    configureTracker(
      saved
        ? {
            f0Center: saved.f0Center,
            noiseFloor: saved.noiseFloor,
            rangeSemitones: saved.rangeSemitones,
            rangeDownSemitones: saved.rangeDownSemitones,
          }
        : {},
    );
    setFrameSink(handleFrame);
    const stopLoop = canvasRef.current
      ? startLoop(canvasRef.current, 360, 640)
      : null;
    return () => {
      stopLoop?.();
      setFrameSink(null);
      setActiveTracker(null);
    };
  }, [live]);

  return (
    <div className="lab-split">
      <div className="lab-stage">
        <div className="stage">
          <canvas ref={canvasRef} width={360} height={640} />
        </div>
        {!live && (
          <button
            className="primary"
            onClick={() => {
              // Gesture-scoped, as every audio entry point in this app must be.
              void ensureMic().then(() => setLive(true));
            }}
          >
            open the mic
          </button>
        )}
      </div>
      <div className="lab-controls">
        <DevPanel />
      </div>
    </div>
  );
}
