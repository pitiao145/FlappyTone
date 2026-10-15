/**
 * Demo-video render page (dev only — reached through `demo-video.html`, which
 * is not a build input, CLAUDE.md #7). Driven frame by frame by
 * `src/dev/render-demo.ts` through `window.demo`.
 *
 * A real `Run` flies the scenario's words; the microphone is replaced by a
 * scripted voice (`flightChao`), fed through `tickAudio` exactly where the
 * PitchTracker's output would go. Time is a fixed step per frame, so a render
 * is deterministic and never drops a frame however slow the capture is.
 */

import "../../ui/tokens.css";
import { Run, birdXFrac, type RunSnapshot } from "../../game/run.ts";
import { corridorChaoAt, corridorToleranceAt, makeGate, type Gate } from "../../game/gates.ts";
import type { Word } from "../../game/words.ts";
import { catalogFromFallback } from "../../data/words.ts";
import { drawWorld } from "../../render/world.ts";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { rgb } from "../../render/palette.ts";
import type { PitchState } from "../../pitch/types.ts";
import {
  flightChao,
  frameSize,
  validateScenario,
  type Card,
  type Flight,
  type Scenario,
} from "./scenario.ts";

const DISPLAY = '"Fraunces", "Iowan Old Style", serif';
const SANS = '"Hanken Grotesk", system-ui, sans-serif';
const HANZI = '"PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';
/** The voice starts a touch before the gate and trails a touch after, like a person. */
const LEAD_T = -0.05;
const TRAIL_T = 1.03;

interface State {
  sc: Scenario;
  fps: number;
  w: number;
  h: number;
  scale: number;
  ctx: CanvasRenderingContext2D;
  run: Run;
  flights: Map<number, Flight>;
  scriptLen: number;
  introFrames: number;
  outroFrames: number;
  /** Frame at which the game part ended; null while it is running. */
  gameEndFrame: number | null;
  tailFrames: number;
  lastSnap: RunSnapshot | null;
  lastSmoothed: number;
}

let S: State | null = null;

function findWord(words: Word[], key: string): Word {
  const w = words.find((x) => x.id === key) ?? words.find((x) => x.hanzi === key);
  if (!w) throw new Error(`word "${key}" is not in the bundled catalog (use an id like ma3b or its hanzi)`);
  return w;
}

function setup(raw: unknown): { outW: number; outH: number; fps: number } {
  const sc = validateScenario(raw);
  const fps = sc.fps ?? 60;
  const { outW, outH, w, h } = frameSize(sc.format ?? "9:16");
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  const scale = outW / w;

  const catalog = catalogFromFallback();
  const script = sc.gates.map((g) => ({ word: findWord(catalog, g.word), flight: g.flight ?? "perfect" }));
  const flights = new Map<number, Flight>();

  const run = new Run({
    mode: "game",
    width: w,
    corridor: sc.corridor ?? "normal",
    cueStyle: sc.demo === false ? "off" : "pause",
    deferFill: true,
    rand: () => 0.5,
  });
  // The scenario, not the random picker, decides the gates. fillQueue is
  // private; replacing it on this one instance is the dev-only seam.
  let next = 0;
  const restScale = sc.gap ?? 0.5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = run as any;
  r.fillQueue = function (this: typeof r) {
    while (
      next < script.length &&
      this.gates.filter((g: Gate) => this.gateEnd(g) >= this.worldX).length < 2
    ) {
      const { word, flight } = script[next++];
      // The game's own gap, scaled: a clip has no time for empty sky.
      const last: Gate | undefined = this.gates[this.gates.length - 1];
      const restPx = (this.difficulty.scrollSpeed * this.difficulty.restMs * restScale) / 1000;
      const x = last ? Math.max(this.gateEnd(last) + restPx, this.worldX + restPx) : this.nextSpawnX();
      const gate = makeGate(word, x, this.difficulty);
      this.gates.push(gate);
      this.spawnedWords.push(word);
      flights.set(gate.xStart, flight);
    }
  };
  run.primeQueue();

  S = {
    sc,
    fps,
    w,
    h,
    scale,
    ctx,
    run,
    flights,
    scriptLen: script.length,
    introFrames: sc.intro ? Math.round((sc.intro.seconds ?? 1.6) * fps) : 0,
    outroFrames: sc.outro ? Math.round((sc.outro.seconds ?? 2.2) * fps) : 0,
    gameEndFrame: null,
    tailFrames: Math.round((sc.tailSeconds ?? 0.8) * fps),
    lastSnap: null,
    lastSmoothed: 3,
  };
  return { outW, outH, fps };
}

/** The scripted voice for this frame, from where the bird sits in the gates. */
function voice(snap: RunSnapshot, st: State): PitchState {
  const dotX = st.w * birdXFrac();
  let chao: number | null = null;
  if (!snap.cuePaused) {
    for (const g of snap.gates) {
      const t = (dotX - g.x0) / (g.x1 - g.x0);
      if (t < LEAD_T || t > TRAIL_T) continue;
      const flight = st.flights.get(g.xStart) ?? "perfect";
      const tc = Math.min(1, Math.max(0, t));
      const tol = corridorToleranceAt(g.shape, tc, g.tolChao);
      chao = flightChao(flight, t, (u) => corridorChaoAt(g.shape, u), tol);
      break;
    }
  }
  if (chao === null) {
    return { f0: null, clarity: 0, rms: 0.001, voiced: false, semitones: null, chao: null, smoothedChao: st.lastSmoothed };
  }
  const c = Math.min(5, Math.max(1, chao));
  st.lastSmoothed = c;
  return { f0: 200, clarity: 0.95, rms: 0.1, voiced: true, semitones: (c - 3) * 2, chao: c, smoothedChao: c };
}

function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): void {
  let size = px;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxW && size > 8) {
    size -= 1;
    ctx.font = font(size);
  }
}

function drawCard(st: State, card: Card, alpha: number): void {
  const { ctx, w, h } = st;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgb(${rgb("backdrop")})`;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgb(${rgb("ink")})`;
  fit(ctx, card.title, (px) => `600 ${px}px ${DISPLAY}`, Math.round(w * 0.11), w * 0.86);
  ctx.fillText(card.title, w / 2, h * 0.45);
  if (card.subtitle) {
    ctx.fillStyle = `rgb(${rgb("accent")})`;
    fit(ctx, card.subtitle, (px) => `500 ${px}px ${SANS}`, Math.round(w * 0.05), w * 0.86);
    ctx.fillText(card.subtitle, w / 2, h * 0.45 + w * 0.11);
  }
  ctx.restore();
}

const OUTCOME_LABEL: Record<string, string> = {
  perfect: "Perfect",
  good: "Good",
  ok: "OK",
  collision: "Ouch",
  unheard: "Couldn't hear that",
};

function drawHud(st: State, snap: RunSnapshot, now: number): void {
  const { ctx, w, h } = st;
  const pad = w * 0.05;
  const ink = `rgb(${rgb("ink")})`;
  ctx.save();
  ctx.textBaseline = "top";

  // Score and combo, top left.
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(h * 0.034)}px ${SANS}`;
  ctx.fillText(String(snap.score), pad, pad);
  if (snap.comboMult > 1) {
    ctx.fillStyle = `rgb(${rgb("accent")})`;
    ctx.font = `600 ${Math.round(h * 0.024)}px ${SANS}`;
    ctx.fillText(`×${snap.comboMult}`, pad, pad + h * 0.042);
  }

  // Hearts, top right.
  ctx.textAlign = "right";
  ctx.font = `${Math.round(h * 0.03)}px ${SANS}`;
  let hearts = "";
  for (let i = 0; i < 3; i++) hearts += i < snap.hearts ? "♥" : "♡";
  ctx.fillStyle = `rgb(${rgb("danger")})`;
  ctx.fillText(hearts, w - pad, pad);

  // The word being asked for: the cued gate while listening, else the one in flight.
  const g = snap.cue ?? snap.activeGate ?? snap.upcoming;
  const word = g?.word ?? null;
  if (word) {
    const cy = h * 0.085;
    ctx.textAlign = "center";
    ctx.fillStyle = TONE_LINE_COLOR[word.tone] ?? ink;
    ctx.font = `600 ${Math.round(h * 0.06)}px ${HANZI}`;
    ctx.fillText(word.hanzi, w / 2, cy);
    ctx.fillStyle = ink;
    ctx.font = `500 ${Math.round(h * 0.028)}px ${SANS}`;
    ctx.fillText(word.pinyin, w / 2, cy + h * 0.07);
    if (snap.phase === "listen") {
      ctx.fillStyle = `rgb(${rgb("demo")})`;
      ctx.font = `italic 500 ${Math.round(h * 0.022)}px ${DISPLAY}`;
      ctx.fillText("listen…", w / 2, cy + h * 0.108);
    }
  }

  // The verdict, for a beat after each gate.
  const lo = snap.lastOutcome;
  if (lo) {
    const age = now - lo.atMs;
    if (age >= 0 && age < 900) {
      const a = age < 120 ? age / 120 : age > 650 ? (900 - age) / 250 : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = "center";
      const color =
        lo.outcome === "collision" ? rgb("danger") : lo.outcome === "unheard" ? rgb("gateUnheard") : rgb("good");
      ctx.fillStyle = `rgb(${color})`;
      ctx.font = `600 ${Math.round(h * 0.038)}px ${DISPLAY}`;
      const label = OUTCOME_LABEL[lo.outcome] ?? lo.outcome;
      ctx.fillText(lo.points > 0 ? `${label} +${lo.points}` : label, w / 2, h * 0.9 - (age / 900) * h * 0.02);
    }
  }

  if (st.sc.caption) {
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    fit(ctx, st.sc.caption, (px) => `600 ${px}px ${DISPLAY}`, Math.round(h * 0.034), w * 0.9);
    ctx.fillText(st.sc.caption, w / 2, h * 0.955);
  }
  ctx.restore();
}

/** Draws frame `i`. Must be called with i = 0, 1, 2… in order. Returns false past the end. */
function render(i: number): boolean {
  const st = S;
  if (!st) throw new Error("call demo.setup(scenario) first");
  const { ctx, scale, fps, sc } = st;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (i < st.introFrames) {
    drawCard(st, sc.intro!, 1);
    return true;
  }
  const gi = i - st.introFrames;
  const dt = 1000 / fps;
  // Run's clock starts well above 0: several of its "age" checks treat 0 as unset.
  const now = 10_000 + gi * dt;

  if (st.gameEndFrame === null) {
    st.run.tickFrame(dt, now);
    st.run.tickAudio(voice(st.run.snapshot(), st), now);
    const snap = st.run.snapshot();
    st.lastSnap = snap;
    drawWorld(ctx, st.w, st.h, snap, now);
    if (sc.hud !== false) drawHud(st, snap, now);
    if (snap.over || snap.gateLog.length >= st.scriptLen) st.gameEndFrame = gi;
    return true;
  }

  const sinceEnd = gi - st.gameEndFrame;
  if (sinceEnd < st.tailFrames) {
    // Keep flying the empty world for the tail, silent.
    if (!st.lastSnap!.over) st.run.tickFrame(dt, now);
    st.run.tickAudio(voice(st.run.snapshot(), st), now);
    const snap = st.run.snapshot();
    drawWorld(ctx, st.w, st.h, snap, now);
    if (sc.hud !== false) drawHud(st, snap, now);
    return true;
  }
  const oi = sinceEnd - st.tailFrames;
  if (oi < st.outroFrames) {
    const fade = Math.min(1, oi / (fps * 0.35));
    drawWorld(ctx, st.w, st.h, st.run.snapshot(), now);
    drawCard(st, sc.outro!, fade);
    return true;
  }
  return false;
}

function frame(): string {
  return (document.getElementById("c") as HTMLCanvasElement).toDataURL("image/png");
}

function summary(): unknown {
  const s = S?.run.snapshot();
  return s && { score: s.score, hearts: s.hearts, gates: s.gateLog.map((g) => ({ tones: g.tones.join("-"), outcome: g.outcome, toneAcc: g.toneAccuracy })) };
}

declare global {
  interface Window {
    demo: { setup: typeof setup; render: typeof render; frame: typeof frame; summary: typeof summary; ready: Promise<void> };
  }
}

window.demo = { setup, render, frame, summary, ready: document.fonts.ready.then(() => undefined) };
