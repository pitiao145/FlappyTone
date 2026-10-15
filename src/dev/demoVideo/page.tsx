/**
 * Demo-video render page (dev only — reached through `demo-video.html`, which
 * is not a build input, CLAUDE.md #7). Driven frame by frame by
 * `src/dev/render-demo.ts` through `window.demo`.
 *
 * Everything on screen is the game's own: a real `Run` flies the scenario's
 * words, `drawWorld` draws it, and `GameHud` (the component `Game.tsx`
 * renders) draws the HUD with the game's CSS. Only the voice is invented —
 * `flightChao` is fed through `tickAudio` where the PitchTracker's output
 * would go. Time is a fixed step per frame, CSS animations included, so a
 * render is deterministic however slow the capture is.
 */

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "../../index.css";
import "../../App.css";
import { Run, birdXFrac, type RunSnapshot } from "../../game/run.ts";
import { corridorChaoAt, corridorToleranceAt, makeGate, type Gate } from "../../game/gates.ts";
import type { Word } from "../../game/words.ts";
import { catalogFromFallback } from "../../data/words.ts";
import { drawWorld } from "../../render/world.ts";
import { GameHud, type OutcomeFlash } from "../../ui/GameHud.tsx";
import { GameOver } from "../../ui/GameOver.tsx";
import { PauseMenu } from "../../ui/PauseMenu.tsx";
import { renderShareCard } from "../../share/renderCard.ts";
import { recordRun } from "../../game/runHistory.ts";
import type { PitchState } from "../../pitch/types.ts";
import {
  flightChao,
  frameSize,
  validateScenario,
  type Card,
  type EndScreen,
  type Flight,
  type Scenario,
} from "./scenario.ts";

/** The voice starts a touch before the gate and trails a touch after, like a person. */
const LEAD_T = -0.05;
const TRAIL_T = 1.03;
/** Game.tsx's TOAST_MS: how long an outcome's toast stays mounted. */
const TOAST_MS = 1200;

/** A clip to lay into the soundtrack: Jane's take, at the moment the game would play it. */
export interface CueAudio {
  wordId: string;
  speakerId: string;
  updatedAt: string;
  atMs: number;
}

interface View {
  snap: RunSnapshot | null;
  flash: OutcomeFlash | null;
  card: { card: Card; opacity: number } | null;
  /** A results screen over the finished run, and how far it has faded in. */
  end: { screen: EndScreen; opacity: number } | null;
}

/** Results screens hold still; there is nothing to click in a video. */
const noop = () => {};

function EndView({ screen, snap, shareUrl }: { screen: EndScreen; snap: RunSnapshot; shareUrl: string | null }) {
  if (screen.screen === "share") {
    return (
      <div className="demo-end demo-share">{shareUrl && <img src={shareUrl} alt="" />}</div>
    );
  }
  if (screen.screen === "pause") {
    return (
      <div className="overlay pause-menu">
        <PauseMenu
          mode="game"
          score={snap.score}
          runNumber={null}
          stats={snap.stats}
          settingsOpen={false}
          onToggleSettings={noop}
          onResume={noop}
          onRestart={noop}
          onQuit={noop}
        />
      </div>
    );
  }
  // The real game-over screen. Mode "drill" keeps it off the network: in
  // "game" it would fetch the live leaderboard and pop the high-score modal.
  return (
    <div className="demo-end">
      <GameOver
        stats={snap.stats}
        busy={false}
        onRetry={noop}
        onFineTune={noop}
        onVisualiser={noop}
        settings={null}
        suggestion={null}
        onRecalibrate={noop}
        mode="drill"
        challengeScore={null}
        onUpgrade={noop}
        onViewFullLeaderboard={noop}
      />
    </div>
  );
}

interface State {
  sc: Scenario;
  fps: number;
  w: number;
  h: number;
  scale: number;
  ctx: CanvasRenderingContext2D;
  run: Run;
  flights: Map<number, Flight>;
  audioOn: Map<number, boolean>;
  cues: CueAudio[];
  lastCuedX: number;
  /** Video-time marks for an editor (Remotion): each gate's cue and verdict, each end screen. */
  marks: {
    gates: { hanzi: string; pinyin: string; cueAt: number | null; resolvedAt: number | null; outcome: string | null; points: number }[];
    gameEndAt: number | null;
    endScreens: { screen: string; from: number }[];
    outroFrom: number | null;
  };
  scriptLen: number;
  endScreens: { screen: EndScreen; frames: number }[];
  introFrames: number;
  outroFrames: number;
  gameEndFrame: number | null;
  tailFrames: number;
  lastSmoothed: number;
  /** Video time at which each CSS animation first appeared. */
  animBirth: Map<Animation, number>;
}

let S: State | null = null;
const root = createRoot(document.getElementById("root")!);
let canvasEl: HTMLCanvasElement | null = null;
/** The share card, rendered once the run is over (it is async). */
let shareUrl: string | null = null;

function findWord(words: Word[], key: string): Word {
  const w = words.find((x) => x.id === key) ?? words.find((x) => x.hanzi === key);
  if (!w) throw new Error(`word "${key}" is not in the bundled catalog (use an id like ma3b or its hanzi)`);
  return w;
}

function Frame({ v, w, h, scale, caption, hud }: { v: View; w: number; h: number; scale: number; caption?: string; hud: boolean }) {
  return (
    <div className="screen game-screen" style={{ padding: 0, minHeight: 0 }}>
      <div className="stage game-stage" style={{ width: w, height: h }}>
        <canvas
          ref={(el) => {
            canvasEl = el;
          }}
          width={Math.round(w * scale)}
          height={Math.round(h * scale)}
          style={{ width: w, height: h }}
        />
        {hud && (
          <GameHud
            hud={v.snap}
            flash={v.flash}
            mode="game"
            scored
            showTranslation={false}
            showPinyin
            showToneMarks
            showPause={false}
            onPause={() => {}}
          />
        )}
        {caption && !v.end && <div className="demo-caption">{caption}</div>}
        {v.end && v.snap && (
          <div style={{ position: "absolute", inset: 0, opacity: v.end.opacity }}>
            <EndView screen={v.end.screen} snap={v.snap} shareUrl={shareUrl} />
          </div>
        )}
        {v.card && (
          <div className="demo-card" style={{ opacity: v.card.opacity }}>
            <h1>{v.card.card.title}</h1>
            {v.card.card.subtitle && <p>{v.card.card.subtitle}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function paint(st: State, v: View): void {
  flushSync(() =>
    root.render(<Frame v={v} w={st.w} h={st.h} scale={st.scale} caption={st.sc.caption} hud={st.sc.hud !== false} />),
  );
}

function setup(raw: unknown): { fps: number; w: number; h: number; scale: number } {
  const sc = validateScenario(raw);
  const fps = sc.fps ?? 60;
  const { outW, w, h } = frameSize(sc.format ?? "9:16");
  const scale = outW / w;

  const catalog = catalogFromFallback();
  const audioDefault = sc.audio ?? true;
  const script = sc.gates.map((g) => ({
    word: findWord(catalog, g.word),
    flight: g.flight ?? "perfect",
    audio: g.audio ?? audioDefault,
    gap: g.gap,
  }));
  // Words whose listen cue keeps the world moving: the clip still plays.
  const noListen = new Set(sc.gates.filter((g) => g.listen === false).map((g) => findWord(catalog, g.word).id));
  const flights = new Map<number, Flight>();
  const audioOn = new Map<number, boolean>();

  const run = new Run({
    mode: "game",
    width: w,
    corridor: sc.corridor ?? "normal",
    cueStyle: sc.demo === false ? "off" : "pause",
    // As in the game once the clip is loaded: the freeze lasts the recording.
    // A no-listen gate gets a duration that ends the freeze before it starts.
    cueDurationMsFor: (word) =>
      word && noListen.has(word.id) ? -1e6 : word ? word.clipS * 1000 : 500,
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
      const { word, flight, audio, gap } = script[next++];
      // The game's own gap, scaled: a clip has no time for empty sky.
      const last: Gate | undefined = this.gates[this.gates.length - 1];
      const restPx = (this.difficulty.scrollSpeed * this.difficulty.restMs * (gap ?? restScale)) / 1000;
      const x = last ? Math.max(this.gateEnd(last) + restPx, this.worldX + restPx) : this.nextSpawnX();
      const gate = makeGate(word, x, this.difficulty);
      this.gates.push(gate);
      this.spawnedWords.push(word);
      flights.set(gate.xStart, flight);
      audioOn.set(gate.xStart, audio);
    }
  };
  run.primeQueue();

  S = {
    sc,
    fps,
    w,
    h,
    scale,
    ctx: null as unknown as CanvasRenderingContext2D,
    run,
    flights,
    audioOn,
    cues: [],
    lastCuedX: -Infinity,
    marks: {
      gates: script.map((g) => ({ hanzi: g.word.hanzi, pinyin: g.word.pinyin, cueAt: null, resolvedAt: null, outcome: null, points: 0 })),
      gameEndAt: null,
      endScreens: [],
      outroFrom: null,
    },
    scriptLen: script.length,
    endScreens: (sc.end ?? []).map((e) => ({ screen: e, frames: Math.round((e.seconds ?? 3) * fps) })),
    introFrames: sc.intro ? Math.round((sc.intro.seconds ?? 1.6) * fps) : 0,
    outroFrames: sc.outro ? Math.round((sc.outro.seconds ?? 2.2) * fps) : 0,
    gameEndFrame: null,
    tailFrames: Math.round((sc.tailSeconds ?? 0.8) * fps),
    lastSmoothed: 3,
    animBirth: new Map(),
  };
  paint(S, { snap: null, flash: null, card: null, end: null });
  S.ctx = canvasEl!.getContext("2d")!;
  return { fps, w, h, scale };
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

/** Game.tsx's flash: the last resolved gate, for TOAST_MS. */
function flashOf(snap: RunSnapshot, now: number): OutcomeFlash | null {
  const lo = snap.lastOutcome;
  if (!lo || now - lo.atMs >= TOAST_MS) return null;
  return {
    outcome: lo.outcome,
    points: lo.points,
    hint: lo.hint,
    tone: lo.tone,
    mismatchedAs: lo.mismatchedAs,
    mismatchedConfidence: lo.mismatchedConfidence,
    classifiedTone: lo.classifiedTone,
    classifiedConfidence: lo.classifiedConfidence,
    atMs: lo.atMs,
  };
}

/** Puts every CSS animation on the video clock instead of the wall clock. */
function stepAnimations(st: State, videoMs: number): void {
  for (const a of document.getAnimations()) {
    if (!st.animBirth.has(a)) st.animBirth.set(a, videoMs);
    a.pause();
    a.currentTime = videoMs - st.animBirth.get(a)!;
  }
}

/** Draws frame `i`. Must be called with i = 0, 1, 2… in order. Returns false past the end. */
function render(i: number): boolean {
  const st = S;
  if (!st) throw new Error("call demo.setup(scenario) first");
  const { ctx, scale, fps, sc } = st;
  const videoMs = (i * 1000) / fps;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (i < st.introFrames) {
    drawWorld(ctx, st.w, st.h, st.run.snapshot(), 10_000);
    paint(st, { snap: null, flash: null, card: { card: sc.intro!, opacity: 1 }, end: null });
    stepAnimations(st, videoMs);
    return true;
  }
  const gi = i - st.introFrames;
  const dt = 1000 / fps;
  // Run's clock starts well above 0: several of its "age" checks treat 0 as unset.
  const now = 10_000 + gi * dt;

  let card: View["card"] = null;
  let end: View["end"] = null;
  const fadeIn = (k: number) => Math.min(1, k / (fps * 0.3));
  if (st.gameEndFrame === null || gi - st.gameEndFrame < st.tailFrames) {
    if (!st.run.snapshot().over) st.run.tickFrame(dt, now);
    st.run.tickAudio(voice(st.run.snapshot(), st), now);
  } else {
    let k = gi - st.gameEndFrame - st.tailFrames;
    for (const e of st.endScreens) {
      if (k < e.frames) {
        end = { screen: e.screen, opacity: fadeIn(k) };
        break;
      }
      k -= e.frames;
    }
    if (!end) {
      if (k >= st.outroFrames) return false;
      card = { card: sc.outro!, opacity: fadeIn(k) };
    }
  }
  const snap = st.run.snapshot();

  // The moment the game would play Jane's clip for this gate (Game.tsx's tick).
  if (snap.cue && snap.cue.xStart > st.lastCuedX) {
    st.lastCuedX = snap.cue.xStart;
    const gm = st.marks.gates.find((g) => g.cueAt === null);
    if (gm) gm.cueAt = videoMs / 1000;
    const w = snap.cue.word;
    if (w && st.audioOn.get(snap.cue.xStart)) {
      st.cues.push({ wordId: w.id, speakerId: w.speakerId, updatedAt: w.updatedAt, atMs: videoMs + snap.cue.playDelayMs });
    }
  }

  // Each newly resolved gate, stamped with its verdict.
  for (let k = 0; k < snap.gateLog.length && k < st.marks.gates.length; k++) {
    const gm = st.marks.gates[k];
    if (gm.resolvedAt === null) {
      gm.resolvedAt = videoMs / 1000;
      gm.outcome = snap.gateLog[k].outcome;
      gm.points = snap.lastOutcome?.points ?? 0;
    }
  }
  if (end && !st.marks.endScreens.some((e) => e.screen === end!.screen.screen)) {
    st.marks.endScreens.push({ screen: end.screen.screen, from: videoMs / 1000 });
  }
  if (card && st.marks.outroFrom === null) st.marks.outroFrom = videoMs / 1000;

  drawWorld(ctx, st.w, st.h, snap, now);
  paint(st, { snap, flash: end ? null : flashOf(snap, now), card, end });
  stepAnimations(st, videoMs);
  if (st.gameEndFrame === null && (snap.over || snap.gateLog.length >= st.scriptLen)) {
    st.gameEndFrame = gi;
    st.marks.gameEndAt = videoMs / 1000;
  }
  return true;
}

/**
 * Readies the results screens once the run is over, as GameApp does before
 * GameOver mounts: the run goes into this (throwaway) browser profile's
 * history, so "best" is this run, and the share card is rendered (async).
 */
async function prepareEnd(): Promise<void> {
  const st = S;
  if (!st || st.endScreens.length === 0) return;
  const snap = st.run.snapshot();
  const history = recordRun(snap, snap.stats.hearts <= 0 ? "out_of_hearts" : "finished");
  const share = st.endScreens.find((e) => e.screen.screen === "share");
  if (!share) return;
  const blob = await renderShareCard(snap.stats, history, share.screen.name ?? "");
  shareUrl = URL.createObjectURL(blob);
  await new Promise<void>((ok) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = () => ok();
    img.src = shareUrl!;
  });
}

/** True once the run is over and the next frame belongs to the end screens. */
function gameDone(): boolean {
  return S !== null && S.gameEndFrame !== null;
}

function summary(): unknown {
  const s = S?.run.snapshot();
  return (
    s && {
      score: s.score,
      hearts: s.hearts,
      gates: s.gateLog.map((g) => ({ tones: g.tones.join("-"), outcome: g.outcome, toneAcc: g.toneAccuracy })),
      cues: S!.cues,
      marks: S!.marks,
      introSeconds: S!.introFrames / S!.fps,
    }
  );
}

declare global {
  interface Window {
    demo: {
      setup: typeof setup;
      render: typeof render;
      summary: typeof summary;
      prepareEnd: typeof prepareEnd;
      gameDone: typeof gameDone;
      ready: Promise<void>;
    };
  }
}

window.demo = { setup, render, summary, prepareEnd, gameDone, ready: document.fonts.ready.then(() => undefined) };
