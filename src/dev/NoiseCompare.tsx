// Lab tab: every noise mode side by side, live, on the same voice.
//
// One bird per mode, all fed at the same moment. "off" / "adaptive" /
// "strict" share the app's normal raw mic stream (one frame → three
// trackers). The two "browser*" modes need the browser's noise suppression,
// which is a property of the MediaStream, so they get a second stream of
// their own (noiseSuppression: true) through a private AudioContext + the
// same capture worklet. Desktop only in practice — iOS gives a page one
// live mic.
//
// No gates, no scoring: just the bird, its trail and the chao grid, with the
// same grace → drift-to-centre behaviour as the game (tuning().graceMs /
// driftChaoPerSec / easeTauMs). The point is to see which bird moves when you
// are silent, and which one still follows you when you talk.
//
// Rendering is one requestAnimationFrame loop over mutable pane state
// (hard rule 1); React only renders the shell.
import { useEffect, useRef, useState } from "react";
import { WORKLET_SOURCE } from "../audio/mic.ts";
import { ensureMic, setFrameSink } from "../audio/session.ts";
import { trackerNoiseConfig } from "../game/noise.ts";
import { loadSettings } from "../game/settings.ts";
import { NOISE_MODES, tuning, type NoiseMode } from "../game/tuning.ts";
import { DEFAULT_CONFIG, PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { chaoToY, drawChaoGrid, drawPip, drawTrail, type TrailSample } from "../render/scene.ts";
import { tapeDownload, tapePush } from "./micTape.ts";

const PANE_W = 230;
const PANE_H = 380;
const TRAIL_S = 4;
const STATS_S = 10;

interface Pane {
  mode: NoiseMode;
  tracker: PitchTracker | null;
  last: PitchState | null;
  lastVoicedAt: number;
  target: number;
  bird: number;
  trail: TrailSample[];
  /** [t, voiced, |Δbird|] per drawn frame, last STATS_S seconds. */
  stats: Array<[number, boolean, number]>;
  canvas: HTMLCanvasElement | null;
  label: HTMLDivElement | null;
}

const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(0) : "–∞");

export function NoiseCompare() {
  const panes = useRef<Pane[]>(
    NOISE_MODES.map((mode) => ({
      mode,
      tracker: null,
      last: null,
      lastVoicedAt: -Infinity,
      target: 3,
      bird: 3,
      trail: [],
      stats: [],
      canvas: null,
      label: null,
    })),
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nsNote, setNsNote] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function start() {
    setError(null);
    // Uncalibrated: run on the tracker defaults (120 Hz centre), and say so —
    // the birds still compare fairly, they just sit on a generic board.
    const settings = loadSettings() ?? {
      f0Center: DEFAULT_CONFIG.f0Center,
      noiseFloor: DEFAULT_CONFIG.noiseFloor,
      rangeSemitones: DEFAULT_CONFIG.rangeSemitones,
      rangeDownSemitones: DEFAULT_CONFIG.rangeDownSemitones,
    };
    if (!loadSettings()) setError("Not calibrated on this browser: using a default board. Calibrate from the home screen for your own.");
    const build = (mode: NoiseMode, sampleRate: number) =>
      new PitchTracker({
        sampleRate,
        f0Center: settings.f0Center,
        noiseFloor: settings.noiseFloor,
        rangeSemitones: settings.rangeSemitones,
        rangeDownSemitones: settings.rangeDownSemitones,
        ...trackerNoiseConfig(sampleRate, mode),
      });
    const feed = (modes: NoiseMode[], frame: Float32Array, sampleRate: number) => {
      for (const p of panes.current) {
        if (!modes.includes(p.mode)) continue;
        p.tracker ??= build(p.mode, sampleRate);
        p.last = p.tracker.push(frame);
      }
    };

    // Raw stream: off / adaptive / strict.
    try {
      await ensureMic();
    } catch (e) {
      setError(`Mic failed: ${(e as Error).message}`);
      return;
    }
    setFrameSink((frame, sr) => {
      tapePush(frame, sr);
      feed(["off", "adaptive", "strict"], frame, sr);
    });

    // Second stream with the browser's noise suppression: browser*.
    let nsCtx: AudioContext | null = null;
    let nsStream: MediaStream | null = null;
    try {
      nsStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
      });
      const applied = nsStream.getAudioTracks()[0]?.getSettings().noiseSuppression;
      setNsNote(applied ? null : "browser reports noiseSuppression NOT applied on the 2nd stream");
      nsCtx = new AudioContext();
      await nsCtx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await nsCtx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(nsCtx, "capture-processor");
      const sr = nsCtx.sampleRate;
      node.port.onmessage = (e: MessageEvent<Float32Array>) => feed(["browser", "browserAdaptive"], e.data, sr);
      nsCtx.createMediaStreamSource(nsStream).connect(node);
    } catch (e) {
      setNsNote(`browser modes unavailable: ${(e as Error).message}`);
    }

    let raf = 0;
    const loop = (now: number) => {
      for (const p of panes.current) step(p, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setRunning(true);

    stopRef.current = () => {
      cancelAnimationFrame(raf);
      setFrameSink(null);
      nsStream?.getTracks().forEach((t) => t.stop());
      void nsCtx?.close();
      for (const p of panes.current) {
        p.tracker = null;
        p.last = null;
        p.trail = [];
        p.stats = [];
      }
      stopRef.current = null;
    };
  }

  function stop() {
    stopRef.current?.();
    setRunning(false);
  }

  function resetStats() {
    for (const p of panes.current) p.stats = [];
  }

  return (
    <div style={{ padding: 12 }}>
      <p style={{ maxWidth: 760 }}>
        All five noise modes listen at once. Stay silent and watch which birds move; then speak and
        watch which still follow you. <b>voiced</b> = share of the last {STATS_S}s each tracker called
        voice, <b>move</b> = how far the bird travelled per second (chao/s). Reset stats before each
        phase. The browser modes use a second mic stream with noise suppression on.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {!running ? (
          <button type="button" onClick={start}>Start mic</button>
        ) : (
          <button type="button" onClick={stop}>Stop</button>
        )}
        <button type="button" onClick={resetStats} disabled={!running}>Reset stats</button>
        <button type="button" onClick={() => tapeDownload("compare")} disabled={!running}>
          Save last 30 s mic (raw)
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {nsNote && <p style={{ color: "darkorange" }}>{nsNote}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${PANE_W}px)`, gap: 10 }}>
        {panes.current.map((p) => (
          <div key={p.mode} style={{ border: "1px solid #8884", borderRadius: 6, overflow: "hidden" }}>
            <div
              ref={(el) => {
                p.label = el;
              }}
              style={{ font: "11px/1.35 monospace", padding: "4px 6px", whiteSpace: "pre" }}
            >
              {p.mode}
            </div>
            <canvas
              ref={(el) => {
                p.canvas = el;
              }}
              width={PANE_W * 2}
              height={PANE_H * 2}
              style={{ width: PANE_W, height: PANE_H, display: "block" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function step(p: Pane, now: number): void {
  const t = tuning();
  const st = p.last;
  // Same hold → drift behaviour as the game's dot (PRD §5.3).
  if (st?.voiced) {
    p.target = st.smoothedChao;
    p.lastVoicedAt = now;
  } else if (now - p.lastVoicedAt > t.graceMs) {
    const dt = 1 / 60;
    const d = 3 - p.target;
    p.target += Math.sign(d) * Math.min(Math.abs(d), t.driftChaoPerSec * dt);
  }
  const prev = p.bird;
  p.bird += (p.target - p.bird) * (1 - Math.exp(-16.7 / Math.max(1, t.easeTauMs)));
  const voiced = !!st?.voiced;
  p.trail.push({ chao: p.bird, voiced, t: now });
  while (p.trail.length && now - p.trail[0].t > TRAIL_S * 1000) p.trail.shift();
  p.stats.push([now, voiced, Math.abs(p.bird - prev)]);
  while (p.stats.length && now - p.stats[0][0] > STATS_S * 1000) p.stats.shift();

  const c = p.canvas;
  const ctx = c?.getContext("2d");
  if (c && ctx) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = "#f3ead8";
    ctx.fillRect(0, 0, PANE_W, PANE_H);
    drawChaoGrid(ctx, PANE_W, PANE_H);
    const dotX = PANE_W * 0.6;
    drawTrail(ctx, PANE_W, PANE_H, p.trail, TRAIL_S, dotX, now);
    drawPip(ctx, PANE_H, p.bird, dotX, 0, "flying", voiced, now, Infinity, voiced, PANE_W);
    if (voiced) {
      ctx.fillStyle = "#2a7";
      ctx.beginPath();
      ctx.arc(PANE_W - 14, chaoToY(5, PANE_H) - 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p.label && p.tracker) {
    const n = p.stats.length || 1;
    const vPct = (100 * p.stats.filter((s) => s[1]).length) / n;
    const span = p.stats.length > 1 ? (p.stats[p.stats.length - 1][0] - p.stats[0][0]) / 1000 : 1;
    const move = p.stats.reduce((a, s) => a + s[2], 0) / Math.max(0.5, span);
    const cfg = p.tracker.getConfig();
    p.label.textContent =
      `${p.mode}\n` +
      `voiced ${vPct.toFixed(0).padStart(3)}%  move ${move.toFixed(2)} chao/s\n` +
      `room ${db(p.tracker.getNoiseEstimate())} dBFS  gate ${db(p.tracker.getEffectiveNoiseFloor() * cfg.rmsMult)} dBFS`;
  }
}
