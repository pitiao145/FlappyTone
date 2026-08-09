import { useEffect, useMemo, useRef, useState } from "react";
import { loadInventory } from "../audio/inventory.ts";
import { loadClip, playToneCue } from "../audio/reference.ts";
import {
  corridorChaoAt,
  shapeForWord,
  toleranceChao,
  type GateShape,
  type Tone,
} from "../game/gates.ts";
import { loadSettings } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import { corridorEdges } from "../render/world.ts";
import { traceSmoothPath } from "../render/scene.ts";

/**
 * The whole inventory as gates, side by side.
 *
 * A corridor's shape was only ever inspectable one gate at a time, in a
 * scrolling world, at the pace of a run — so "is this word's corridor a
 * sensible shape?" cost a playthrough per word, across 120 of them. The
 * corridors are also not hand-drawn: they are measured off Jane's takes, one
 * per word, which is exactly the sort of thing that needs looking at in bulk
 * before it needs tuning.
 *
 * Draws with the game's own functions — `shapeForWord`, `corridorEdges`,
 * `traceSmoothPath` — so what is on screen here is the gate, not a diagram of
 * it. Time runs left to right over the tone window, as it does in play.
 *
 * Dev only.
 */

const CARD_W = 210;
const CARD_H = 150;
/** The corridor is measured against a full-height canvas, then mapped to the card. */
const VIRTUAL_H = 1000;

interface Band {
  top: number;
  bottom: number;
}

/**
 * The chao band every card is drawn against.
 *
 * Not 1–5. A corridor is a centreline *plus* a tolerance, and the tolerance
 * flares where the contour moves — so a T1 centred at chao 4.6 has its top
 * wall above 5, and a T4 cliff's flare reaches further still. Mapping 1–5 to
 * the card cut both off, and half a gate is not a review surface.
 *
 * Measured across the whole shown set rather than per card, deliberately: a
 * card that rescaled to fit its own gate would make every shape look the same
 * size, which is the one thing this view exists to compare.
 */
function bandFor(words: Word[], tolH: number): Band {
  let top = 5;
  let bottom = 1;
  for (const word of words) {
    const shape = shapeForWord(word);
    const tol = toleranceChao(word.tone, tolH);
    const { top: t, bottom: b } = corridorEdges(shape, tol, 0, CARD_W, VIRTUAL_H);
    for (const p of t) top = Math.max(top, yToChao(p.y));
    for (const p of b) bottom = Math.min(bottom, yToChao(p.y));
  }
  return { top: top + 0.15, bottom: bottom - 0.15 };
}

/** Inverse of chaoToY, so an edge measured in pixels can be read back in chao. */
function yToChao(y: number): number {
  return 1 + ((0.8 * VIRTUAL_H - y) / (0.6 * VIRTUAL_H)) * 4;
}

const TONE_COLOR: Record<Tone, string> = {
  1: "rgba(150, 200, 255,",
  2: "rgba(150, 235, 190,",
  3: "rgba(235, 200, 140,",
  4: "rgba(230, 165, 160,",
};

/**
 * Vertices in the corridor, ignoring the tail every contour ends on.
 *
 * The count is the readout that answers "is this shape too busy?" — a measured
 * contour with nine vertices is describing wobble, not a tone.
 */
function vertexCount(shape: GateShape): number {
  return shape.polyline.length;
}

function drawWord(
  canvas: HTMLCanvasElement,
  word: Word,
  tolH: number,
  band: Band,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  const shape = shapeForWord(word);
  const tol = toleranceChao(word.tone, tolH);
  const tint = TONE_COLOR[word.tone];

  const y = (chao: number) =>
    ((band.top - chao) / (band.top - band.bottom)) * CARD_H;

  // Chao 1–5, as faint as in the game: guides recede, walls do not.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let chao = 1; chao <= 5; chao++) {
    ctx.beginPath();
    ctx.moveTo(0, y(chao));
    ctx.lineTo(CARD_W, y(chao));
    ctx.stroke();
  }

  const { top, bottom } = corridorEdges(shape, tol, 0, CARD_W, VIRTUAL_H);
  const lift = (pts: { x: number; y: number }[]) =>
    pts.map((p) => ({ x: p.x, y: y(yToChao(p.y)) }));

  // The channel, then its two walls — the same two edges collision uses.
  ctx.fillStyle = `${tint} 0.10)`;
  ctx.beginPath();
  const t = lift(top);
  const b = lift(bottom);
  ctx.moveTo(t[0].x, t[0].y);
  for (const p of t) ctx.lineTo(p.x, p.y);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `${tint} 0.85)`;
  ctx.lineWidth = 1.5;
  for (const edge of [t, b]) {
    traceSmoothPath(ctx, edge);
    ctx.stroke();
  }

  // The centreline: the measured contour itself, which is what is under review.
  ctx.strokeStyle = `${tint} 0.55)`;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const tt = i / 60;
    const px = tt * CARD_W;
    const py = y(corridorChaoAt(shape, tt));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Every vertex, marked. A shape reads as simple or busy from these alone.
  ctx.fillStyle = `${tint} 0.9)`;
  for (const [pt, chao] of shape.polyline) {
    ctx.beginPath();
    ctx.arc(pt * CARD_W, y(chao), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function Card({ word, tolH, band }: { word: Word; tolH: number; band: Band }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawWord(ref.current, word, tolH, band);
  }, [word, tolH, band]);

  const shape = shapeForWord(word);
  const synthetic = word.tone === 3;

  const play = async () => {
    // Gesture-scoped, as every audio entry point in this app must be.
    const audio = new AudioContext();
    if (audio.state === "suspended") await audio.resume();
    const s = loadSettings();
    await loadClip(audio, word);
    playToneCue(
      audio,
      word.tone,
      s?.f0Center ?? DEFAULT_CONFIG.f0Center,
      s?.rangeSemitones ?? DEFAULT_CONFIG.rangeSemitones,
      word,
      s?.rangeDownSemitones ?? DEFAULT_CONFIG.rangeDownSemitones,
    );
  };

  return (
    <div className="word-card">
      <canvas
        ref={ref}
        style={{ width: CARD_W, height: CARD_H }}
        onClick={() => void play()}
        title="play the clip"
      />
      <span className="param-name">
        {word.pinyin} {word.hanzi} — {word.id}
      </span>
      <span className="param-help">
        {vertexCount(shape)} vertices · tone {shape.durationS.toFixed(2)}s · clip{" "}
        {word.clipS.toFixed(2)}s
        {synthetic && " · citation shape, not measured"}
      </span>
    </div>
  );
}

export function WordGates() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [tone, setTone] = useState<Tone | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInventory().then(
      (w) => setWords(w),
      (e: unknown) => setError(e instanceof Error ? e.message : "manifest failed"),
    );
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!words) return <p className="param-help">loading the manifest…</p>;
  if (words.length === 0) {
    return (
      <p className="param-help">
        The inventory is empty — public/ref/manifest.json did not load. A run
        would degrade to the tuning defaults here, which looks like the game
        working; this does not.
      </p>
    );
  }

  const shown = tone === "all" ? words : words.filter((w) => w.tone === tone);
  const tolH = tuning().baseToleranceH;
  // Every card on one scale, measured across the whole inventory rather than
  // the filtered set — switching to T1 must not silently magnify a flat tone.
  // Memoised because it walks all 120 corridors, and a card re-renders on every
  // filter click.
  const band = useMemo(() => bandFor(words, tolH), [words, tolH]);

  return (
    <div className="word-gates">
      <div className="lab-controls">
        <nav className="lab-tabs">
          {(["all", 1, 2, 3, 4] as const).map((k) => (
            <button
              key={k}
              className={k === tone ? "tab active" : "tab"}
              onClick={() => setTone(k)}
            >
              {k === "all" ? "all" : `T${k}`}
            </button>
          ))}
        </nav>
        <p className="param-help">
          Every word's gate, drawn with the game's own corridor functions and at
          the current tuning — the tunnel-width and slack knobs on the play tab
          move these too. Click a card to hear its clip. T3 is the citation
          shape rather than the measured one (see shapeForWord), so those four
          rows say what the game flies, not what she said.
        </p>
      </div>
      <div className="word-grid">
        {shown.map((w) => (
          <Card key={w.id} word={w} tolH={tolH} band={band} />
        ))}
      </div>
    </div>
  );
}
