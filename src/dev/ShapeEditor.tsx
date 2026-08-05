import { useEffect, useRef, useState } from "react";
import { playToneCue } from "../audio/reference.ts";
import { getMicSession } from "../audio/session.ts";
import { corridorChaoAt, TONE_INFO, type Tone } from "../game/gates.ts";
import {
  DEFAULT_POLYLINES,
  setTuning,
  tuning,
  type Polyline,
} from "../game/tuning.ts";
import { loadSettings } from "../game/settings.ts";
import { formatTuningDiff, tuningDiff } from "./presets.ts";

const TONES: Tone[] = [1, 2, 3, 4];

const W = 420;
const H = 260;
const PAD = 26;
/** How close a pointer has to be to grab an existing point rather than add one. */
const GRAB_PX = 16;
/** Control points cannot be dragged past their neighbours in t. */
const MIN_T_GAP = 0.01;

const toX = (t: number) => PAD + t * (W - 2 * PAD);
const toY = (chao: number) => H - PAD - ((chao - 1) / 4) * (H - 2 * PAD);
const fromX = (x: number) => (x - PAD) / (W - 2 * PAD);
const fromY = (y: number) => 1 + ((H - PAD - y) / (H - 2 * PAD)) * 4;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Direct-manipulation editor for the corridor centrelines.
 *
 * The polylines are the one part of the game that was measured from a real
 * speaker and then never touched again, and they are hard to reason about as
 * numbers — "(0.3, 1.85)" does not tell you the T2 dip is too deep. Dragging
 * the shape and immediately flying it is the whole point; edits go straight
 * into the tuning singleton, so the corridor, the demo sweep and the scorer
 * all follow at once. Nothing here persists: a reload is the undo.
 *
 * Dev only.
 */
export function ShapeEditor() {
  const [tone, setTone] = useState<Tone>(1);
  const [selected, setSelected] = useState<number | null>(null);
  // The singleton lives outside React; this is the re-render trigger.
  const [rev, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);

  const points = tuning().polylines[tone];
  const isDefault =
    JSON.stringify(points) === JSON.stringify(DEFAULT_POLYLINES[tone]);

  const write = (next: Polyline) => {
    setTuning({ polylines: { [tone]: next } as Record<Tone, Polyline> });
    bump((n) => n + 1);
  };

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    draw(ctx, tone, selected);
  }, [tone, selected, rev]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPos(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    let nearest = -1;
    let best = GRAB_PX;
    points.forEach(([t, chao], i) => {
      const d = Math.hypot(toX(t) - x, toY(chao) - y);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });

    if (nearest >= 0) {
      dragRef.current = nearest;
      setSelected(nearest);
      return;
    }

    // Empty space adds a point there and starts dragging it — the fastest way
    // to say "the contour should go through about here".
    const t = clamp(fromX(x), 0, 1);
    const chao = clamp(fromY(y), 1, 5);
    const at = points.findIndex((p) => p[0] > t);
    const index = at === -1 ? points.length : at;
    const next: Polyline = [...points];
    next.splice(index, 0, [t, chao]);
    write(next);
    dragRef.current = index;
    setSelected(index);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = dragRef.current;
    if (i === null) return;
    const { x, y } = pointerPos(e);
    const next: Polyline = points.map((p) => [...p] as [number, number]);
    // The endpoints define the gate's own window: t=0 is the moment the bird
    // enters and t=1 the moment it leaves, so only their height is editable.
    const first = i === 0;
    const last = i === next.length - 1;
    const lo = first ? 0 : next[i - 1][0] + MIN_T_GAP;
    const hi = last ? 1 : next[i + 1][0] - MIN_T_GAP;
    next[i] = [
      first ? 0 : last ? 1 : clamp(fromX(x), lo, hi),
      clamp(fromY(y), 1, 5),
    ];
    write(next);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const removeSelected = () => {
    if (selected === null) return;
    // Two points is a straight line; below that there is no contour at all.
    if (points.length <= 2) return;
    write(points.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const playExample = () => {
    const audio = getMicSession()?.ctx;
    const saved = loadSettings();
    if (audio && audio.state === "running" && saved) {
      playToneCue(audio, tone, saved.f0Center, saved.rangeSemitones);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        formatTuningDiff({ polylines: tuningDiff(tuning()).polylines }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="shape-editor">
      <div className="choice">
        {TONES.map((t) => (
          <button
            key={t}
            className={t === tone ? "choice-option active" : "choice-option"}
            onClick={() => {
              setTone(t);
              setSelected(null);
            }}
          >
            {TONE_INFO[t].pinyin}
            {JSON.stringify(tuning().polylines[t]) !==
              JSON.stringify(DEFAULT_POLYLINES[t]) && " •"}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="shape-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />

      <p className="param-help">
        Drag a point to move it. Tap empty space to add one. The first and last
        points are pinned to the start and end of the gate — only their height
        moves. Changes are live: the corridor, the demo sweep and the scorer all
        read this.
      </p>

      <div className="row">
        <button disabled={selected === null || points.length <= 2} onClick={removeSelected}>
          remove point
        </button>
        <button disabled={isDefault} onClick={() => write(DEFAULT_POLYLINES[tone])}>
          reset T{tone}
        </button>
        <button onClick={playExample}>hear it</button>
        <button onClick={() => void copy()}>
          {copied ? "copied" : "copy shapes as TS"}
        </button>
      </div>

      <pre className="diff">
        {points.map(([t, c]) => `[${t.toFixed(2)}, ${c.toFixed(2)}]`).join("\n")}
      </pre>

      <p className="param-help">
        The shipped shapes were measured from `fixtures/captures/jane_ma*.wav`,
        one speaker, one syllable, citation register — thin evidence, and a big
        improvement on the tone marks they replaced. Simplifying one is a real
        change to what the game teaches, so fly it before you keep it, and
        remember the reference clip still has whatever contour it always had:
        the corridor can be simplified past the point where the example matches
        it.
      </p>
    </div>
  );
}

/** The editing surface: Chao grid, the interpolated contour, and the handles. */
function draw(
  ctx: CanvasRenderingContext2D,
  tone: Tone,
  selected: number | null,
): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#141821";
  ctx.fillRect(0, 0, W, H);

  ctx.font = "10px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (let chao = 1; chao <= 5; chao++) {
    const y = toY(chao);
    ctx.strokeStyle =
      chao === 3 ? "rgba(150,180,215,0.22)" : "rgba(150,180,215,0.10)";
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(150,180,215,0.45)";
    ctx.fillText(String(chao), 8, y);
  }

  // The default, ghosted, so an edit is always visible as a departure from
  // the measurement rather than as a shape with no history.
  ctx.strokeStyle = "rgba(235,208,170,0.28)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  DEFAULT_POLYLINES[tone].forEach(([t, chao], i) => {
    const x = toX(t);
    const y = toY(chao);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Sampled through corridorChaoAt rather than drawn between the points, so
  // this is literally the function the game evaluates.
  ctx.strokeStyle = "#60cdff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const STEPS = 96;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = toX(t);
    const y = toY(corridorChaoAt(tone, t));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  tuning().polylines[tone].forEach(([t, chao], i) => {
    const x = toX(t);
    const y = toY(chao);
    ctx.beginPath();
    ctx.arc(x, y, i === selected ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = i === selected ? "#f0b866" : "#0b0d12";
    ctx.fill();
    ctx.strokeStyle = i === selected ? "#f0b866" : "#60cdff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
