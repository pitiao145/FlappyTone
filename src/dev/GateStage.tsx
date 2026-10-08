import { useEffect, useMemo, useRef, useState } from "react";
import { ensureMic, stopMic } from "../audio/session.ts";
import type { Contour } from "../game/contours.ts";
import { REST_CHAO } from "../game/dynamics.ts";
import {
  applyCorridorWidth,
  corridorChaoAt,
  shapeForTone,
  toleranceChao,
  type CorridorWidth,
} from "../game/gates.ts";
import { birdXFrac, type RunSnapshot } from "../game/run.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { classifyTone } from "../game/toneClassifier.ts";
import { tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawPip } from "../render/scene.ts";
import { drawGate } from "../render/world.ts";
import { Game } from "../ui/Game.tsx";

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
export function GatePreview({
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
          const baseTol = toleranceChao(word.tones, tuning().baseToleranceH);
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
              tones: word.tones,
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
        drawPip(ctx, height, REST_CHAO, width * birdXFrac(), 0, "flying", true, 0, Infinity, true, width);
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



interface StageProps {
  word: Word | null;
  settings: CalibrationSettings;
  corridorWidth: CorridorWidth;
  /** Lab-only overlay of the old citation T3 shape; the play tab offers it. */
  showCitation?: boolean;
}

/**
 * One gate, at rest and in flight: the paused corridor preview, a "Fly this
 * gate" button, and the last attempt's result with the standalone tone
 * recognizer's independent read. Shared by the play and pair-gates tabs so a
 * gate behaves the same wherever it is picked.
 *
 * The recognizer is never told the target tone, so a mismatch against the
 * outcome line is itself informative while tuning the classifier's knobs. It
 * reads `lastOutcome.path` (the voiced samples actually flown through the
 * gate), reshaped into the `Contour` `classifyTone` expects.
 */
export function GateStage({ word, settings, corridorWidth, showCitation = false }: StageProps) {
  const [gateKey, setGateKey] = useState(0);
  const [flying, setFlying] = useState(false);
  const [result, setResult] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A result belongs to the gate that produced it; picking another clears it.
  const identity = word ? `${word.id}:${word.clipStyle ?? "textbook"}` : "";
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [identity]);

  const recognized = useMemo(() => {
    const path = result?.lastOutcome?.path;
    if (!path || path.length < 2) return null;
    const startMs = path[0].t;
    const contour: Contour = {
      points: path.map((p) => ({ tMs: p.t - startMs, chao: p.chao })),
      startedAtMs: startMs,
      endedAtMs: path[path.length - 1].t,
    };
    return classifyTone(contour);
  }, [result]);

  const fly = async () => {
    setError(null);
    try {
      // Inside the click handler: iOS grants getUserMedia only during a gesture.
      await ensureMic();
      setResult(null);
      setGateKey((k) => k + 1);
      setFlying(true);
    } catch (err) {
      setFlying(false);
      setError(err instanceof Error ? err.message : "Microphone failed");
    }
  };

  const stop = () => {
    setFlying(false);
    stopMic();
  };

  const entry = result?.gateLog[0];

  if (flying && word) {
    return (
      <div className="gate-stage">
        <Game
          key={gateKey}
          mode="single"
          singleWord={word}
          settings={settings}
          canvasWidth={360}
          canvasHeight={640}
          onOver={(snap) => {
            setResult(snap);
            setFlying(false);
          }}
          onQuit={stop}
        />
      </div>
    );
  }

  return (
    <div className="gate-stage">
      <GatePreview word={word} corridorWidth={corridorWidth} showCitation={showCitation} />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!word} onClick={() => void fly()}>
        Fly this gate
      </button>
      {entry && (
        <dl className="result-card">
          <div>
            <dt>Outcome</dt>
            <dd>{entry.outcome}</dd>
          </div>
          <div>
            <dt>Score accuracy</dt>
            <dd>{Math.round(entry.accuracy * 100)}%</dd>
          </div>
          <div>
            <dt>Tone accuracy</dt>
            <dd>{entry.toneAccuracy === null ? "n/a" : `${Math.round(entry.toneAccuracy * 100)}%`}</dd>
          </div>
          {recognized && (
            <div>
              <dt>Recognised as</dt>
              <dd>
                {recognized.tone === "none" ? "none" : `T${recognized.tone}`}{" "}
                <span className="result-sub">{Math.round(recognized.confidence * 100)}%</span>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
