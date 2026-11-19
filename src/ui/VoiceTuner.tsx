/**
 * Brief 50: calibration as a calm tuner (Settings → Calibrate / Adjust one
 * part). Four parts: Room · Middle · Top · Bottom, then a Done screen with
 * Redo on each part. No bird, no scrolling, no Hz on screen.
 *
 * The live line, the five voice bars and the hold bar are drawn from refs in
 * a requestAnimationFrame loop (hard rule 1): React renders only when a step
 * changes phase (listening → locked, too short, stalled). Mic frames arrive
 * through `setFrameSink`; Settings opened the mic in the player's tap (hard
 * rule 4). The logic (lock on silence, measurements) is `src/game/tuner.ts`.
 */
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { inventoryNow, loadInventory } from "../audio/inventory.ts";
import { prefetchPool } from "../audio/prefetch.ts";
import { ensurePlaybackCtx, isCueAudible, playToneCue } from "../audio/reference.ts";
import { getMicSession, setFrameSink } from "../audio/session.ts";
import type { Tone } from "../game/gates.ts";
import { MIDDLE_WORD_IDS } from "../game/run.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import {
  StepCapture,
  applyTunerResult,
  captureOptions,
  measureBottom,
  measureMiddleTakes,
  measureTop,
  roomBars,
  roomMarker,
  roomVerdict,
  semitoneWord,
  voiceBars,
  type RoomVerdict,
  type TunerPart,
  type TunerResult,
  tunerTrackerConfig,
} from "../game/tuner.ts";
import { speakerFMin, tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { computeNoiseFloor } from "../pitch/calibration.ts";
import { rmsOf } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";

const STEPS: TunerPart[] = ["room", "middle", "top", "bottom"];
const STEP_LABEL: Record<TunerPart, string> = { room: "Room", middle: "Middle", top: "Top", bottom: "Bottom" };
/** The word each voice step asks for (Traditional hanzi, hard rule 9). */
const TOP_WORD = "ma1b"; // 媽 mā
const BOTTOM_WORD = "ma3b"; // 馬 mǎ
/** A start for the drawing before anything is measured: a voice between the two presets. */
const NEUTRAL: CalibrationSettings = { f0Center: 150, noiseFloor: 0.0005, rangeSemitones: 5, rangeDownSemitones: 5 };

export const ROOM_COPY: Record<RoomVerdict, { title: string; body: string; tip: string | null }> = {
  quiet: { title: "Quiet", body: "Good. The game can hear your whole voice, low notes included.", tip: null },
  noisy: {
    title: "A bit noisy",
    body: "A fan, music or traffic can cover your voice. The game may hear your low notes less well, so your bottom line could come out too high.",
    tip: "Try: a quieter spot, or hold the phone a bit closer.",
  },
  tooNoisy: {
    title: "Too noisy",
    body: "The game will miss parts of your voice, mostly the low notes. Your lines could come out wrong.",
    tip: "Try: a quieter room, or turn off the fan or music, then listen again.",
  },
};

interface Props {
  /** The settings in use now (a calibration, a quick-start preset, or null). */
  settings: CalibrationSettings | null;
  /** "full": all four parts. "adjust": start on the Done screen to redo one part. */
  start: "full" | "adjust";
  onDone: (s: CalibrationSettings, room: RoomVerdict | null) => void;
  onCancel: () => void;
}

type View = { kind: "step"; part: TunerPart; back: "next" | "done" } | { kind: "done" };

export function VoiceTuner({ settings, start, onDone, onCancel }: Props) {
  const base = settings && !settings.quickStart ? settings : null;
  const [draft, setDraft] = useState<CalibrationSettings>(() => ({ ...(base ?? settings ?? NEUTRAL) }));
  const [room, setRoom] = useState<RoomVerdict | null>(null);
  const [view, setView] = useState<View>(start === "adjust" && base ? { kind: "done" } : { kind: "step", part: "room", back: "next" });
  const [words, setWords] = useState<Map<string, Word> | null>(null);
  const stepName = view.kind === "done" ? "done" : view.part;

  useEffect(() => {
    track({ type: "calib_step", step: stepName });
  }, [stepName]);

  useEffect(() => {
    let live = true;
    void (async () => {
      let ws: Word[];
      try {
        ws = inventoryNow() ?? (await loadInventory());
      } catch {
        ws = [];
      }
      if (!live) return;
      const m = new Map(ws.map((w) => [w.id, w]));
      const found = [...MIDDLE_WORD_IDS, TOP_WORD, BOTTOM_WORD].map((id) => m.get(id)).filter((w): w is Word => !!w);
      if (found.length > 0) prefetchPool(found);
      setWords(m);
    })();
    return () => {
      live = false;
    };
  }, []);

  const finishStep = (r: TunerResult | null, verdict?: RoomVerdict) => {
    if (r) setDraft((d) => applyTunerResult(d, r));
    if (verdict) setRoom(verdict);
    if (view.kind !== "step") return;
    if (view.back === "done") {
      setView({ kind: "done" });
      return;
    }
    const i = STEPS.indexOf(view.part);
    setView(i + 1 < STEPS.length ? { kind: "step", part: STEPS[i + 1], back: "next" } : { kind: "done" });
  };

  const cancel = () => {
    track({ type: "calib_abandoned", step: stepName });
    setFrameSink(null);
    onCancel();
  };

  if (view.kind === "done") {
    return (
      <DoneView
        draft={draft}
        room={room}
        changed={!base || JSON.stringify(base) !== JSON.stringify(draft) || room !== null}
        onRedo={(part) => setView({ kind: "step", part, back: "done" })}
        onDone={() => {
          track({ type: "calib_done" });
          onDone(draft, room);
        }}
        onCancel={cancel}
      />
    );
  }

  const stepIndex = STEPS.indexOf(view.part);
  return (
    <div className="screen tuner-screen">
      <div className="tuner-top">
        <button className="tuner-cancel" onClick={cancel}>Cancel</button>
        <span className="tuner-count">
          {view.back === "done" ? `Redo: ${STEP_LABEL[view.part]}` : `Step ${stepIndex + 1} of 4`}
        </span>
      </div>
      <div className="tuner-steps" aria-hidden={view.back === "done"}>
        {STEPS.map((p, i) => (
          <div key={p} className={`tuner-step${i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : ""}`}>
            <div className="tuner-step-bar" />
            <span>{STEP_LABEL[p]}{i < stepIndex ? " ✓" : ""}</span>
          </div>
        ))}
      </div>
      {view.part === "room" ? (
        <RoomStep key={`room-${view.back}`} onDone={(floor, verdict) => finishStep({ part: "room", noiseFloor: floor }, verdict)} />
      ) : (
        <VoiceStep
          key={`${view.part}-${view.back}`}
          part={view.part}
          draft={draft}
          words={words}
          onDone={finishStep}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ room

function RoomStep({ onDone }: { onDone: (floor: number, verdict: RoomVerdict) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [floor, setFloor] = useState<number | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new listen clears the old result
    setFloor(null);
    const rms: number[] = [];
    setFrameSink((frame) => {
      rms.push(rmsOf(frame));
      // Live bars while it listens, from the frames so far (no React render per frame).
      const el = barsRef.current;
      if (el && rms.length % 4 === 0) paintBars(el, roomBars(computeNoiseFloor(rms)));
    });
    const id = setTimeout(() => {
      setFrameSink(null);
      setFloor(computeNoiseFloor(rms));
    }, tuning().roomListenMs);
    return () => {
      clearTimeout(id);
      setFrameSink(null);
    };
  }, [attempt]);

  useEffect(() => {
    if (floor !== null && barsRef.current) paintBars(barsRef.current, roomBars(floor));
  }, [floor]);

  const verdict = floor !== null ? roomVerdict(floor) : null;
  const copy = verdict ? ROOM_COPY[verdict] : null;
  return (
    <>
      <div className="tuner-head">
        <h2>Check your room</h2>
        <p className="note">Stay quiet for 2 seconds. We listen to the sound around you.</p>
      </div>
      <div className="tuner-panel tuner-room">
        <div className="tuner-room-bars" ref={barsRef} role="img" aria-label={copy ? `Room noise: ${copy.title}` : "Listening to the room"}>
          {Array.from({ length: 7 }, (_, i) => <span key={i} style={{ height: `${16 + i * 9}px` }} />)}
        </div>
        <div className="tuner-scale">
          <div className="tuner-scale-bar">
            {floor !== null && <span className="tuner-scale-mark" style={{ left: `${Math.round(roomMarker(floor) * 100)}%` }} />}
          </div>
          <div className="tuner-scale-labels"><span>Quiet</span><span>A bit noisy</span><span>Too noisy</span></div>
        </div>
      </div>
      {copy ? (
        <div className={`tuner-verdict is-${verdict}`} role="status">
          <strong>{copy.title}</strong>
          <span>{copy.body}</span>
          {copy.tip && <span className="tuner-tip">{copy.tip}</span>}
        </div>
      ) : (
        <p className="note" role="status">Listening…</p>
      )}
      <div className="tuner-grow" />
      <div className="tuner-actions">
        <button disabled={floor === null} onClick={() => setAttempt((a) => a + 1)}>Listen again</button>
        <button className="primary" disabled={floor === null || verdict === null} onClick={() => floor !== null && verdict && onDone(floor, verdict)}>
          Continue
        </button>
      </div>
    </>
  );
}

/** Lights the first `n` of the bars inside `el` (room: 7 bars, colours by zone; voice: 5). */
function paintBars(el: HTMLElement, n: number): void {
  const bars = el.children;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i] as HTMLElement;
    b.dataset.on = i < n ? "1" : "0";
  }
}

// ------------------------------------------------------------------ voice steps

/**
 * What each voice step asks for. The word itself is shown big (hanzi and
 * pinyin), with one short line on how to say it (Pierre, 19 Nov: learners
 * should see the word, not read a sentence).
 */
const STEP_COPY: Record<Exclude<TunerPart, "room">, { title: string; hint: string; fallback: { hanzi: string; pinyin: string } }> = {
  middle: { title: "Your middle", hint: "Say it in your normal voice", fallback: { hanzi: "媽", pinyin: "mā" } },
  top: { title: "Your top line", hint: "First tone: high, easy, flat", fallback: { hanzi: "媽", pinyin: "mā" } },
  bottom: { title: "Your bottom line", hint: "Third tone: go low, stay low", fallback: { hanzi: "馬", pinyin: "mǎ" } },
};

interface VoiceStepProps {
  part: Exclude<TunerPart, "room">;
  draft: CalibrationSettings;
  words: Map<string, Word> | null;
  onDone: (r: TunerResult | null) => void;
}

/** What the canvas loop reads each frame. Mutable, outside React (hard rule 1). */
interface Live {
  /** Every voiced frame of the last few seconds (st from the draft middle); `counted` = part of the take. */
  pts: Array<{ tMs: number; st: number; counted: boolean }>;
  bars: number;
  progress: number;
  /** After a top/bottom take locks: the measured line (st from the middle), drawn as "your new line". */
  result: number | null;
  /** The take has locked: the ring around the dot is full and shows a tick. */
  locked: boolean;
  /** The word to say, drawn where the dot will appear before any voice. */
  hanzi: string;
}

function VoiceStep({ part, draft, words, onDone }: VoiceStepProps) {
  const takes = part === "middle"
    ? Array.from({ length: tuning().middleTakesPerWord }, () => MIDDLE_WORD_IDS).flat()
    : [part === "top" ? TOP_WORD : BOTTOM_WORD];
  const [take, setTake] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<"hold" | "louder" | "pause" | "locked">("hold");
  /** "Couldn't hear that, try again": shown until the player's voice comes in again. */
  const [retry, setRetry] = useState(false);
  const retryRef = useRef(false);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  /** Each locked take's frames, per tracker floor. A ref: fills at frame rate. */
  const pooled = useRef<{ normal: number[][]; low: number[][] }>({ normal: [], low: [] });
  const live = useRef<Live>({ pts: [], bars: 0, progress: 0, result: null, locked: false, hanzi: "" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const word = words?.get(takes[take]);
  const tone: Tone = part === "top" ? 1 : part === "bottom" ? 3 : ((word?.tone ?? 1) as Tone);
  useEffect(() => {
    live.current.hanzi = word?.hanzi ?? STEP_COPY[part].fallback.hanzi;
  }, [word, part]);

  // Capture: one StepCapture per take. Locks on silence after enough voice.
  useEffect(() => {
    if (take === 0) pooled.current = { normal: [], low: [] };
    live.current = { pts: live.current.pts, bars: 0, progress: 0, result: null, locked: false, hanzi: live.current.hanzi };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the line under the meter for a new take
    setNote("hold");
    const cap = new StepCapture(captureOptions(), performance.now());
    const lowFrames: number[] = [];
    let normal: PitchTracker | null = null;
    let low: PitchTracker | null = null;
    let lastNote: string = "hold";
    const say = (n: "hold" | "louder" | "pause" | "locked") => {
      if (n !== lastNote) {
        lastNote = n;
        setNote(n);
      }
    };
    setFrameSink((frame, sampleRate) => {
      // Deaf while the example plays: the speaker would be measured, not the player.
      if (isCueAudible()) return;
      const cfg = tunerTrackerConfig(part, draft, sampleRate);
      normal ??= new PitchTracker(cfg);
      low ??= new PitchTracker({ ...cfg, fMin: tuning().pitchFloorLowHz });
      const p = normal.push(frame);
      const q = low.push(frame);
      const now = performance.now();
      const before = cap.phase;
      const before0 = cap.f0s.length;
      const phase = cap.push({ tMs: now, voiced: p.voiced, f0: p.f0 });
      // The low-floor tracker's frames for the same moments (middle step, deep voice).
      if (cap.f0s.length > before0 && q.voiced && q.f0 !== null) lowFrames.push(q.f0);
      const L = live.current;
      L.bars = voiceBars(p.rms, draft.noiseFloor);
      L.progress = cap.progress;
      // Every voiced frame is drawn, like the Visualiser; the ones in the take are drawn bold.
      if (p.voiced && p.f0 !== null) L.pts.push({ tMs: now, st: 12 * Math.log2(p.f0 / draft.f0Center), counted: cap.f0s.length > before0 });
      while (L.pts.length > 0 && now - L.pts[0].tMs > TRACE_MS) L.pts.shift();
      if (phase === "hearing" && retryRef.current) setRetry(false);
      if (phase === "locked" && before !== "locked") {
        setFrameSink(null);
        pooled.current.normal.push([...cap.f0s]);
        pooled.current.low.push([...lowFrames]);
        // Show where this take puts the line being measured, before moving on.
        L.result = part === "top" ? measureTop(cap.f0s, draft.f0Center) : part === "bottom" ? -(measureBottom(cap.f0s, draft.f0Center) ?? NaN) : null;
        if (L.result !== null && !Number.isFinite(L.result)) L.result = null;
        L.locked = true;
        say("locked");
      } else if (phase === "tooShort") {
        // Too little voice: say so and listen again, never a wrong result (hard rule 8).
        setFrameSink(null);
        setRetry(true);
        setAttempt((a) => a + 1);
      } else if (phase !== "locked") {
        // Voice before the short quiet that opens a take: tell the player, never stay silent.
        say(!cap.listening && p.voiced ? "pause" : cap.stalled(now) ? "louder" : "hold");
      }
    });
    const stall = setInterval(() => {
      if (cap.phase !== "locked" && cap.phase !== "tooShort" && cap.stalled(performance.now())) say("louder");
    }, 250);
    return () => {
      clearInterval(stall);
      setFrameSink(null);
    };
  }, [take, attempt, part, draft.f0Center, draft.noiseFloor]);

  // A locked take: next take, or measure the part. A short "got it" beat first.
  useEffect(() => {
    if (note !== "locked") return;
    const id = setTimeout(() => {
      if (take + 1 < takes.length) {
        setTake(take + 1);
        return;
      }
      const f = pooled.current;
      let r: TunerResult | null;
      if (part === "middle") {
        // Each word counts once, however long it was held.
        const first = measureMiddleTakes(f.normal);
        // A deep voice: its floor sits under the normal one, so the low tracker's frames are fair.
        const centre = first !== null && speakerFMin(first) < tuning().pitchFloorHighHz ? (measureMiddleTakes(f.low) ?? first) : first;
        r = centre !== null ? { part: "middle", f0Center: centre } : null;
      } else if (part === "top") {
        const up = measureTop(f.normal.flat(), draft.f0Center);
        r = up !== null ? { part: "top", up } : null;
      } else {
        const down = measureBottom(f.normal.flat(), draft.f0Center);
        r = down !== null ? { part: "bottom", down } : null;
      }
      if (r) onDone(r);
      else {
        // Never a wrong score: the app did not hear enough (hard rule 8).
        setTake(0);
        setAttempt((a) => a + 1);
        setRetry(true);
      }
    // Hold "Got it" a little longer on top/bottom, so the new line can be seen.
    }, part === "middle" ? 600 : 1400);
    return () => clearTimeout(id);
  }, [note]);

  // The drawing: five lines, the word's corridor, the player's line, the meters. rAF, refs only.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const L = live.current;
      if (meterRef.current) paintBars(meterRef.current, L.bars);
      const c = canvasRef.current;
      if (!c) return;
      const w = c.clientWidth, h = c.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      drawStep(g, w, h, tone, part, draft, L);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tone, part, draft]);

  const playExample = () => {
    if (!word) return;
    void ensurePlaybackCtx();
    const audio = getMicSession()?.ctx;
    if (audio && audio.state === "suspended") void audio.resume();
    playToneCue(word.tone as Tone, draft.f0Center, draft.rangeSemitones, word, draft.rangeDownSemitones);
  };

  const copy = STEP_COPY[part];
  const status =
    note === "locked" ? { title: "Got it", sub: "" }
    : retry ? { title: "Couldn't hear that, try again", sub: "Say it once more, a little longer." }
    : note === "louder" ? { title: "Still listening", sub: "A bit louder?" }
    : note === "pause" ? { title: "Ready when you are", sub: "Stop for a moment, then say it once." }
    : { title: "Listening", sub: "Hold it until the ring is full, then stop." };
  return (
    <>
      <div className="tuner-word">
        <span className="tuner-word-step">
          {copy.title}
          {part === "middle" && takes.length > 1 ? ` · word ${take + 1} of ${takes.length}` : ""}
        </span>
        <span className="tuner-word-hanzi" lang="zh-Hant">{word?.hanzi ?? copy.fallback.hanzi}</span>
        <span className="tuner-word-pinyin">{word?.pinyin ?? copy.fallback.pinyin}</span>
        <span className="tuner-word-hint">{copy.hint}</span>
      </div>
      <div className="tuner-panel tuner-stage">
        <canvas ref={canvasRef} role="img" aria-label={`Your voice as a moving line, with your middle${part === "top" ? " and the zone to aim for above it" : part === "bottom" ? " and the zone to aim for below it" : ""}`} />
      </div>
      <div className="tuner-panel tuner-meter">
        <div className="tuner-voice-bars" ref={meterRef} role="img" aria-label="Voice level">
          {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ height: `${8 + i * 5}px` }} />)}
        </div>
        <div className="tuner-meter-text">
          <strong role="status">{status.title}</strong>
          {status.sub && <span className="note">{status.sub}</span>}
        </div>
      </div>
      <div className="tuner-actions">
        <button disabled={!word} onClick={playExample}>
          ▶ Hear <span lang="zh-Hant">{word?.hanzi ?? ""}</span>
        </button>
        <button onClick={() => { setTake(0); setAttempt((a) => a + 1); }}>Try again</button>
      </div>
    </>
  );
}

/** How much of the past the moving line shows (ms), like the Visualiser's trail. */
const TRACE_MS = 4000;
/** The stage shows this many semitones above and below the middle: wide, so a voice never sticks to an edge. */
const SPAN_ST = 9;

/**
 * The canvas, Visualiser-style: your voice as a line that moves right to left,
 * with a dot (the bird) at your pitch now. The axis is plain semitones around
 * the middle, so nothing clamps while a line is being measured. Drawn: the
 * middle (solid), line 5 and line 1 as they are now (dashed), and on the Top
 * and Bottom steps the zone to aim for. After a take locks, the measured line.
 */
function drawStep(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  _tone: Tone,
  part: Exclude<TunerPart, "room">,
  s: CalibrationSettings,
  L: Live,
): void {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ink = v("--ink-rgb", "36, 29, 21");
  const accent = v("--accent", "#1c7a63");
  const accentRgb = v("--accent-rgb", "28, 122, 99");
  const beak = v("--beak", "#c98a3c");
  const beakRgb = v("--beak-rgb", "200, 138, 60");
  const top = 14, bottom = h - 14, left = 8, right = w - 26;
  const y = (st: number) => {
    const c = Math.max(-SPAN_ST, Math.min(SPAN_ST, st));
    return top + ((SPAN_ST - c) / (2 * SPAN_ST)) * (bottom - top);
  };
  const line = (st: number, color: string, width: number, dash: number[], label: string) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    g.moveTo(left, y(st));
    g.lineTo(right, y(st));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = color;
    g.font = "12px system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(label, w - 4, y(st) + 4);
  };
  // The zone to aim for: a first tone above the middle, a low third tone below it.
  if (part !== "middle") {
    const [a, b] = part === "top" ? [1.5, SPAN_ST] : [-1.5, -SPAN_ST];
    g.fillStyle = `rgba(${accentRgb}, 0.12)`;
    g.fillRect(left, Math.min(y(a), y(b)), right - left, Math.abs(y(a) - y(b)));
    g.fillStyle = accent;
    g.font = "600 13px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText(part === "top" ? "Aim here: high, easy, flat" : "Aim here: low, and stay low", left + 8, part === "top" ? top + 18 : bottom - 10);
  }
  line(s.rangeSemitones, `rgba(${ink}, 0.35)`, 1, [5, 5], "5");
  line(-s.rangeDownSemitones, `rgba(${ink}, 0.35)`, 1, [5, 5], "1");
  line(0, accent, 2.5, [], "3");
  g.fillStyle = `rgba(${ink}, 0.55)`;
  g.font = "12px system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText("your middle", left + 8, y(0) - 6);
  // The measured line once the take locks.
  if (L.result !== null) line(L.result, beak, 3, [], part === "top" ? "5 ✓" : "1 ✓");
  // Your voice: a trail moving right to left, and the dot at your pitch now.
  const now = performance.now();
  const xOf = (t: number) => right - 24 - ((now - t) / TRACE_MS) * (right - 24 - left);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let i = 1; i < L.pts.length; i++) {
    const a = L.pts[i - 1], b = L.pts[i];
    if (b.tMs - a.tMs > 120) continue; // a gap in the voice is a gap in the line
    g.strokeStyle = b.counted ? beak : `rgba(${beakRgb}, 0.35)`;
    g.lineWidth = b.counted ? 5 : 3;
    g.beginPath();
    g.moveTo(xOf(a.tMs), y(a.st));
    g.lineTo(xOf(b.tMs), y(b.st));
    g.stroke();
  }
  // The dot, with a ring that fills while the word is held: where the eyes already are.
  const last = L.pts[L.pts.length - 1];
  const live = !!last && now - last.tMs < 200;
  const heldOn = L.progress > 0 || L.locked;
  const cx = live || heldOn ? xOf(last ? last.tMs : now) : right - 24;
  const cy = last && (live || heldOn) ? y(last.st) : y(0);
  const R = 18;
  if (!live && !heldOn) {
    // Nothing heard yet: a waiting ring with the word, where the dot will appear.
    g.strokeStyle = `rgba(${beakRgb}, 0.45)`;
    g.lineWidth = 3;
    g.setLineDash([4, 5]);
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = beak;
    g.font = "600 16px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(L.hanzi, cx, cy + 6);
    return;
  }
  g.strokeStyle = `rgba(${beakRgb}, 0.25)`;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  const full = L.locked ? 1 : L.progress;
  g.strokeStyle = full >= 1 ? accent : beak;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + full * Math.PI * 2);
  g.stroke();
  g.fillStyle = live ? beak : `rgba(${beakRgb}, 0.5)`;
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  if (L.locked) {
    g.strokeStyle = accent;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + R + 6, cy);
    g.lineTo(cx + R + 10, cy + 5);
    g.lineTo(cx + R + 18, cy - 6);
    g.stroke();
  }
}

// ------------------------------------------------------------------ done

interface DoneProps {
  draft: CalibrationSettings;
  room: RoomVerdict | null;
  changed: boolean;
  onRedo: (p: TunerPart) => void;
  onDone: () => void;
  onCancel: () => void;
}

function DoneView({ draft, room, changed, onRedo, onDone, onCancel }: DoneProps) {
  const roomVerdictNow = room ?? roomVerdict(draft.noiseFloor);
  const rows: Array<{ part: TunerPart; dot: string; title: string; sub: string }> = [
    { part: "top", dot: "top", title: `Top: ${semitoneWord(draft.rangeSemitones)} up`, sub: "from your normal voice to line 5" },
    { part: "middle", dot: "middle", title: "Middle: your normal voice", sub: "line 3" },
    { part: "bottom", dot: "bottom", title: `Bottom: ${semitoneWord(draft.rangeDownSemitones)} down`, sub: "from your normal voice to line 1" },
  ];
  return (
    <div className="screen tuner-screen tuner-done">
      <div className="tuner-top">
        <button className="tuner-cancel" onClick={onCancel}>Cancel</button>
      </div>
      <svg viewBox="0 0 160 160" width="120" height="120" role="img" aria-label="Done" className="tuner-check">
        <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="8" />
        <path d="M56 82 l16 16 l32 -36" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="tuner-head tuner-head-center">
        <h2>Your voice is set</h2>
        <p className="note">The game keeps fine-tuning it while you play. Something feel off? Redo just that part.</p>
      </div>
      <div className="tuner-rows">
        {rows.map((r) => (
          <div key={r.part} className="tuner-row">
            <span className={`tuner-dot is-${r.dot}`} />
            <div className="tuner-row-text">
              <strong>{r.title}</strong>
              <span className="tuner-sub">{r.sub}</span>
            </div>
            <button onClick={() => onRedo(r.part)}>Redo</button>
          </div>
        ))}
        {/* Information only (Pierre, 19 Nov): a new room check changes nothing you can act on. */}
        <div className="tuner-row tuner-row-room">
          <span className={`tuner-dot is-room-${roomVerdictNow}`} />
          <span className="tuner-sub">Room: {ROOM_COPY[roomVerdictNow].title.toLowerCase()}</span>
        </div>
      </div>
      <span className="param-help">1 semitone = one key on a piano.</span>
      <div className="tuner-grow" />
      <button className="primary tuner-wide" onClick={changed ? onDone : onCancel}>Done</button>
    </div>
  );
}
