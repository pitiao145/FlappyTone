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
import { corridorChaoAt, shapeForTone, type Tone } from "../game/gates.ts";
import { MIDDLE_WORD_IDS } from "../game/run.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import {
  StepCapture,
  applyTunerResult,
  captureOptions,
  measureBottom,
  measureMiddle,
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
import { rmsOf, semitonesToChao } from "../pitch/math.ts";
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

const STEP_COPY: Record<Exclude<TunerPart, "room">, { title: string; say: (w: Word | undefined) => React.ReactNode }> = {
  middle: {
    title: "Your middle",
    say: (w) => (
      <>Listen, then say <span lang="zh-Hant">{w?.hanzi ?? ""}</span> {w?.pinyin ?? ""} back in your normal voice. Stop when you are done.</>
    ),
  },
  top: {
    title: "Your top line",
    say: () => (
      <>Say <span lang="zh-Hant">媽</span> mā as a first tone: high and flat, on a note that feels easy. Stop when you are done.</>
    ),
  },
  bottom: {
    title: "Your bottom line",
    say: () => (
      <>Say <span lang="zh-Hant">馬</span> mǎ as a third tone: go low and stay low, without forcing it. Stop when you are done.</>
    ),
  },
};

interface VoiceStepProps {
  part: Exclude<TunerPart, "room">;
  draft: CalibrationSettings;
  words: Map<string, Word> | null;
  onDone: (r: TunerResult | null) => void;
}

/** What the canvas loop reads each frame. Mutable, outside React (hard rule 1). */
interface Live {
  pts: Array<{ tMs: number; st: number }>;
  bars: number;
  progress: number;
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
  const pooled = useRef<{ normal: number[]; low: number[] }>({ normal: [], low: [] });
  const live = useRef<Live>({ pts: [], bars: 0, progress: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);
  const word = words?.get(takes[take]);
  const tone: Tone = part === "top" ? 1 : part === "bottom" ? 3 : ((word?.tone ?? 1) as Tone);

  // Capture: one StepCapture per take. Locks on silence after enough voice.
  useEffect(() => {
    if (take === 0) pooled.current = { normal: [], low: [] };
    live.current = { pts: [], bars: 0, progress: 0 };
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
      if (cap.f0s.length > before0 && p.f0 !== null) L.pts.push({ tMs: now, st: 12 * Math.log2(p.f0 / draft.f0Center) });
      if (phase === "hearing" && retryRef.current) setRetry(false);
      if (phase === "locked" && before !== "locked") {
        setFrameSink(null);
        pooled.current.normal.push(...cap.f0s);
        pooled.current.low.push(...lowFrames);
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
        const first = measureMiddle(f.normal);
        // A deep voice: its floor sits under the normal one, so the low tracker's frames are fair.
        const centre = first !== null && speakerFMin(first) < tuning().pitchFloorHighHz ? (measureMiddle(f.low) ?? first) : first;
        r = centre !== null ? { part: "middle", f0Center: centre } : null;
      } else if (part === "top") {
        const up = measureTop(f.normal, draft.f0Center);
        r = up !== null ? { part: "top", up } : null;
      } else {
        const down = measureBottom(f.normal, draft.f0Center);
        r = down !== null ? { part: "bottom", down } : null;
      }
      if (r) onDone(r);
      else {
        // Never a wrong score: the app did not hear enough (hard rule 8).
        setTake(0);
        setAttempt((a) => a + 1);
        setRetry(true);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [note]);

  // The drawing: five lines, the word's corridor, the player's line, the meters. rAF, refs only.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const L = live.current;
      if (meterRef.current) paintBars(meterRef.current, L.bars);
      if (holdRef.current) holdRef.current.style.width = `${Math.round(L.progress * 100)}%`;
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
      drawStep(g, w, h, tone, part, draft, L.pts);
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
    : { title: "Listening", sub: "Hold it a little. It locks when you stop." };
  return (
    <>
      <div className="tuner-head">
        <h2>{copy.title}</h2>
        <p className="note">{copy.say(word)}</p>
        {part === "middle" && takes.length > 1 && <p className="tuner-take">Word {take + 1} of {takes.length}</p>}
      </div>
      <div className="tuner-panel tuner-stage">
        <canvas ref={canvasRef} role="img" aria-label={`Five lines with the ${part === "top" ? "first-tone" : part === "bottom" ? "third-tone" : "word's"} corridor and your line`} />
      </div>
      <div className="tuner-panel tuner-meter">
        <div className="tuner-voice-bars" ref={meterRef} role="img" aria-label="Voice level">
          {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ height: `${8 + i * 5}px` }} />)}
        </div>
        <div className="tuner-meter-text">
          <strong role="status">{status.title}</strong>
          <div className="tuner-hold"><div ref={holdRef} /></div>
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

/** The canvas: lines 1-5, the middle (set or not), the corridor, the player's line in place. */
function drawStep(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  tone: Tone,
  part: Exclude<TunerPart, "room">,
  s: CalibrationSettings,
  pts: Array<{ tMs: number; st: number }>,
): void {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ink = v("--ink-rgb", "36, 29, 21");
  const accent = v("--accent", "#1c7a63");
  const accentRgb = v("--accent-rgb", "28, 122, 99");
  const beak = v("--beak", "#c98a3c");
  const top = 18, bottom = h - 18, left = 26, right = w - 10;
  const y = (chao: number) => bottom - ((chao - 1) / 4) * (bottom - top);
  g.font = "12px system-ui, sans-serif";
  for (let c = 1; c <= 5; c++) {
    g.fillStyle = `rgba(${ink}, 0.6)`;
    g.fillText(String(c), 8, y(c) + 4);
    g.strokeStyle = c === 3 && part !== "middle" ? accent : `rgba(${ink}, 0.16)`;
    g.lineWidth = c === 3 && part !== "middle" ? 2.5 : 1;
    g.beginPath();
    g.moveTo(left, y(c));
    g.lineTo(right, y(c));
    g.stroke();
  }
  // The corridor for this word's tone, across the middle of the stage.
  const shape = shapeForTone(tone);
  const x0 = left + (right - left) * 0.12, x1 = right - 8;
  const tol = 0.55;
  g.fillStyle = `rgba(${accentRgb}, 0.14)`;
  g.strokeStyle = `rgba(${accentRgb}, 0.7)`;
  g.lineWidth = 1.5;
  g.beginPath();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const yy = y(Math.min(5, corridorChaoAt(shape, t) + tol));
    if (i === 0) g.moveTo(x0 + (x1 - x0) * t, yy);
    else g.lineTo(x0 + (x1 - x0) * t, yy);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    g.lineTo(x0 + (x1 - x0) * t, y(Math.max(1, corridorChaoAt(shape, t) - tol)));
  }
  g.closePath();
  g.fill();
  g.setLineDash([6, 5]);
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const yy = y(corridorChaoAt(shape, t));
    if (i === 0) g.moveTo(x0 + (x1 - x0) * t, yy);
    else g.lineTo(x0 + (x1 - x0) * t, yy);
  }
  g.stroke();
  g.setLineDash([]);
  // The player's line, in place: from the corridor's start, about one word long.
  if (pts.length < 2) return;
  const t0 = pts[0].tMs;
  const span = Math.max(700, pts[pts.length - 1].tMs - t0);
  g.strokeStyle = beak;
  g.lineWidth = 5;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  pts.forEach((p, i) => {
    const xx = x0 + (x1 - x0) * ((p.tMs - t0) / span);
    const yy = y(semitonesToChao(p.st, s.rangeSemitones, s.rangeDownSemitones));
    if (i === 0) g.moveTo(xx, yy);
    else g.lineTo(xx, yy);
  });
  g.stroke();
  const last = pts[pts.length - 1];
  g.fillStyle = beak;
  g.beginPath();
  g.arc(x0 + (x1 - x0) * ((last.tMs - t0) / span), y(semitonesToChao(last.st, s.rangeSemitones, s.rangeDownSemitones)), 8, 0, Math.PI * 2);
  g.fill();
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
              <span className="note">{r.sub}</span>
            </div>
            <button onClick={() => onRedo(r.part)}>Redo</button>
          </div>
        ))}
        <div className="tuner-row tuner-row-room">
          <span className={`tuner-dot is-room-${roomVerdictNow}`} />
          <span className="note">Room: {ROOM_COPY[roomVerdictNow].title.toLowerCase()}</span>
          <button className="tuner-link" onClick={() => onRedo("room")}>Check again</button>
        </div>
      </div>
      <span className="param-help">1 semitone = one key on a piano.</span>
      <div className="tuner-grow" />
      <button className="primary tuner-wide" onClick={changed ? onDone : onCancel}>Done</button>
    </div>
  );
}
