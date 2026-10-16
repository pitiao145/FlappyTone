/**
 * Demo-video panels (dev only, reached through `demo-panel.html`): app screens
 * that are not a run — the tone charts, the visualiser, Pro's tone evolution —
 * drawn by the app's own draw code and CSS and filmed frame by frame by
 * `render-demo.ts`, which drives this page through the same `window.demo` API
 * as `page.tsx`.
 *
 * What is real and what is scripted:
 * - tones: Jane's per-tone cards are `ToneAverageCard` over the bundled
 *   catalog (real). The textbook row draws the usual 55/35/214/51 marks with
 *   the same card renderer.
 * - visualiser: `drawVisualiser` and the visualiser's readout markup. The
 *   attempts are scripted (Jane's Tone 3 average said for a Tone 2 word); the
 *   readouts are the real `toneAccuracy` and `classifyTone` of that attempt.
 * - pro: `drawPlayerShapeChart` and the evolution card's markup, with the
 *   sample player's real shapes as "now" and an invented flatter "then".
 *   The frame says "example data".
 */

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "../../index.css";
import "../../App.css";
import { catalogFromFallback } from "../../data/words.ts";
import { corridorChaoAt, shapeForWord, type Tone } from "../../game/gates.ts";
import type { Contour } from "../../game/contours.ts";
import { classifyTone } from "../../game/toneClassifier.ts";
import { toneAccuracy } from "../../game/toneAccuracy.ts";
import { AVERAGED_TONE_SHAPE } from "../../game/toneAverages.ts";
import { wordsOfTone, type Word } from "../../game/words.ts";
import { drawVisualiser } from "../../render/visualiser.ts";
import { ToneAverageCard } from "../../ui/ToneAverageCard.tsx";
import { SAMPLE_TONE_SHAPES } from "../../ui/sampleToneShapes.ts";
import { drawPlayerShapeChart, TONE_AVERAGE_COLOR } from "../../ui/toneAverageChart.ts";
import { frameSize, type Format } from "./scenario.ts";

export type PanelKind = "tones" | "visualiser" | "pro";

interface PanelScenario {
  panel: PanelKind;
  format?: Format;
  fps?: number;
  seconds?: number;
}

const root = createRoot(document.getElementById("root")!);
let st: { sc: PanelScenario; fps: number; w: number; h: number; scale: number; frames: number; catalog: Word[] } | null = null;

const CARD_W = 160;
const CARD_H = 96;
const ease = (k: number) => Math.min(1, Math.max(0, k));

/** The textbook marks, on the 61-point grid the cards use. */
const TEXTBOOK: Record<Tone, number[]> = {
  1: Array.from({ length: 61 }, () => 5),
  2: Array.from({ length: 61 }, (_, i) => 3 + (2 * i) / 60),
  3: Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    return t < 0.45 ? 2 - Math.sin(((t / 0.45) * Math.PI) / 2) : 1 + 3 * ((t - 0.45) / 0.55) ** 1.4;
  }),
  4: Array.from({ length: 61 }, (_, i) => 5 - (4 * i) / 60),
};

/** A canvas redrawn with `draw` every frame. */
function Chart({ draw }: { draw: (c: HTMLCanvasElement) => void }) {
  return <canvas ref={(el) => { if (el) draw(el); }} style={{ width: CARD_W, height: CARD_H }} />;
}

const slice = (line: number[], k: number) => line.slice(0, Math.max(2, Math.round(line.length * ease(k))));

function Tones({ t }: { t: number }) {
  const words = st!.catalog;
  const tones: Tone[] = [1, 2, 3, 4];
  return (
    <div className="screen progress-screen demo-panel">
      <section className="progress-card sticker-card">
        <div className="progress-card-header"><h3>Textbook tones</h3></div>
        <div className="tone-average-grid">
          {tones.map((tone, i) => (
            <figure key={tone} className="tone-average-card" style={{ opacity: ease((t - 0.1 - i * 0.15) / 0.3) }}>
              <Chart draw={(c) => drawPlayerShapeChart(c, { jane: null, now: TEXTBOOK[tone], then: null }, TONE_AVERAGE_COLOR[tone], CARD_W, CARD_H)} />
              
            </figure>
          ))}
        </div>
      </section>
      <section className="progress-card sticker-card" style={{ opacity: ease((t - 1.3) / 0.4) }}>
        <div className="progress-card-header"><h3>How Jane really says them</h3></div>
        <div className="tone-average-grid">
          {tones.map((tone, i) => (
            <div key={tone} style={{ opacity: ease((t - 1.5 - i * 0.15) / 0.3) }}>
              <ToneAverageCard words={wordsOfTone(words, tone)} tone={tone} showCaption={false} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** A scripted attempt: Jane's Tone 3 average, said for a Tone 2 word, at that word's length. */
function attempt(word: Word, jitter: number): Contour {
  const avg = AVERAGED_TONE_SHAPE.textbook[3];
  const ms = shapeForWord(word).durationS * 1000;
  const points = avg.map((c, i) => ({ tMs: (i / 60) * ms, chao: c + 0.12 * Math.sin(i * 0.5 + jitter) }));
  return { points, startedAtMs: 0, endedAtMs: ms };
}

function Visualiser({ t }: { t: number }) {
  const { w, scale } = st!;
  const word = st!.catalog.find((x) => x.hanzi === "麻")!;
  const ms = shapeForWord(word).durationS * 1000;
  const tries = [attempt(word, 0), attempt(word, 2)];
  // Attempt 1 from 0.6s, attempt 2 from 3.0s; each draws over its own length.
  const starts = [0.6, 3.0];
  const finished: Contour[] = [];
  let live: Contour | null = null;
  let shown: Contour | null = null;
  starts.forEach((s, i) => {
    const el = (t - s) * 1000;
    if (el < 0) return;
    if (el >= ms) {
      finished.push(tries[i]);
      shown = tries[i];
    } else live = { ...tries[i], points: tries[i].points.filter((p) => p.tMs <= el), endedAtMs: null };
  });
  const readFrom: Contour | null = shown;
  const acc = readFrom ? toneAccuracy((readFrom as Contour).points, [2]) : null;
  const cls = readFrom ? classifyTone(readFrom) : null;
  const ch = h(w);
  const liveHead = (live as Contour | null)?.points.at(-1);
  const wrong = cls && cls.tone !== 2;
  return (
    <div className="screen visualiser-screen stage game-stage demo-panel" style={{ width: w }}>
      <div className="visualiser-body">
        <div className="vis-top-bar">
          <div className="vis-readouts">
            <div className="vis-accuracy">
              <span className="vis-accuracy-label">tone accuracy</span>
              {acc !== null ? (
                <>
                  <strong className="vis-accuracy-value tier-low">{Math.round(acc * 100)}%</strong>
                  <span className="vis-accuracy-tries">{finished.length === 1 ? "1 try" : `${finished.length} tries`}</span>
                </>
              ) : (
                <span className="vis-accuracy-value vis-accuracy-empty">–</span>
              )}
            </div>
            <div className={cls ? "vis-accuracy tier-bad" : "vis-accuracy"}>
              <span className="vis-accuracy-label">Tone</span>
              {cls ? (
                <>
                  <strong className="vis-accuracy-value tier-bad">{cls.tone === "none" ? "none" : `T${cls.tone}`}</strong>
                  <span className="vis-accuracy-tries">{Math.round(cls.confidence * 100)}%</span>
                </>
              ) : (
                <span className="vis-accuracy-value vis-accuracy-empty">–</span>
              )}
              <span className={wrong ? "vis-wrong-toast is-shown" : "vis-wrong-toast"}>wrong tone</span>
            </div>
          </div>
        </div>
        <div className="vis-target-word">
          <span className="syllable">{word.pinyin}</span> <span className="hanzi">{word.hanzi}</span> · Tone 2
        </div>
        <div className="vis-canvas-column">
          <div className="stage">
            <canvas
              ref={(el) => {
                if (!el) return;
                const ctx = el.getContext("2d")!;
                ctx.setTransform(scale, 0, 0, scale, 0, 0);
                drawVisualiser(ctx, w, ch, {
                  tone: 2,
                  word,
                  live,
                  finished,
                  spanMs: Math.max(1600, ms * 1.25),
                  chao: liveHead?.chao ?? corridorChaoAt(shapeForWord(word), 0),
                  voiced: !!liveHead,
                });
              }}
              width={Math.round(w * scale)}
              height={Math.round(ch * scale)}
              style={{ width: w, height: ch }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const h = (w: number) => Math.round(w * 1.25);

function Pro({ t }: { t: number }) {
  const keys = ["2", "3", "4"];
  return (
    <div className="screen progress-screen demo-panel">
      <section className="progress-card sticker-card">
        <div className="progress-card-header">
          <h3>See how your tones evolve over time</h3>
          <span className="badge-solid badge-solid-jade">Pro</span>
        </div>
        <div className="player-shape-controls">
          <label>
            Compare with{" "}
            <select value="1m" onChange={() => {}}>
              <option value="1m">1 month ago</option>
            </select>
          </label>
        </div>
        <p className="note player-shape-legend">
          <span className="player-shape-key player-shape-key-jane" /> Jane&apos;s average ·{" "}
          <span className="player-shape-key player-shape-key-now" /> yours now ·{" "}
          <span className="player-shape-key player-shape-key-then" /> yours 1 month ago
        </p>
        <div className="tone-average-grid">
          {keys.map((key, i) => {
            const tone = Number(key) as Tone;
            const now = SAMPLE_TONE_SHAPES[key];
            const jane = AVERAGED_TONE_SHAPE.textbook[tone];
            // Invented: a month earlier the shape barely moved.
            const then = now.line.map((c) => 2.8 + (c - 2.8) * 0.3);
            const k = (t - 0.8 - i * 0.35) / 0.9;
            return (
              <figure key={key} className="tone-average-card player-shape-card">
                <Chart draw={(c) => drawPlayerShapeChart(c, { jane, then, now: k > 0 ? slice(now.line, k) : null }, TONE_AVERAGE_COLOR[tone], CARD_W, CARD_H)} />
                <figcaption>
                  <span className="syllable">Tone {key}</span>
                  <span className="cue">based on {now.count * 6} attempts</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
        <p className="note">Example data</p>
      </section>
    </div>
  );
}

function setup(raw: unknown): { fps: number } {
  const sc = raw as PanelScenario;
  if (!["tones", "visualiser", "pro"].includes(sc.panel)) throw new Error(`panel "${sc.panel}" — use tones, visualiser or pro`);
  const fps = sc.fps ?? 60;
  const { outW, w, h: hh } = frameSize(sc.format ?? "9:16");
  st = { sc, fps, w, h: hh, scale: outW / w, frames: Math.round((sc.seconds ?? 5) * fps), catalog: catalogFromFallback() };
  return { fps };
}

function render(i: number): boolean {
  if (!st || i >= st.frames) return false;
  const t = i / st.fps;
  const P = st.sc.panel === "tones" ? Tones : st.sc.panel === "pro" ? Pro : Visualiser;
  flushSync(() =>
    root.render(
      <div className="demo-panel-frame" style={{ width: st!.w, height: st!.h }}>
        <P t={t} />
      </div>,
    ),
  );
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = 400;
  }
  return true;
}

const summary = () => ({ score: 0, hearts: 0, gates: [], cues: [], marks: {}, introSeconds: 0 });

window.demo = {
  setup: setup as never,
  render,
  summary: summary as never,
  prepareEnd: async () => {},
  gameDone: () => false,
  ready: document.fonts.ready.then(() => undefined),
};
