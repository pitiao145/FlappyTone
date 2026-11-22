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
import type { CalibrationSettings } from "../game/settings.ts";
import {
  StepCapture,
  applyTunerResult,
  captureOptions,
  measureMiddle,
  settingsFromTakes,
  type TunerTake,
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
import { tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { computeNoiseFloor } from "../pitch/calibration.ts";
import { rmsOf } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { PitchTrail } from "../game/contours.ts";
import { BRIDGE_MS } from "../game/visualiserCore.ts";
import { withLearnedScale } from "../game/playerRuler.ts";
import { drawVisualiser } from "../render/visualiser.ts";

/** Three steps (22 Nov): the middle is set from the High and Low takes, no step of its own. */
type StepPart = "room" | "top" | "bottom";
type VoicePart = "top" | "bottom";
const STEPS: StepPart[] = ["room", "top", "bottom"];
const STEP_LABEL: Record<StepPart, string> = { room: "Room", top: "High", bottom: "Low" };
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

type View = { kind: "step"; part: StepPart; back: "next" | "done" } | { kind: "done" };

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
      const found = [TOP_WORD, BOTTOM_WORD].map((id) => m.get(id)).filter((w): w is Word => !!w);
      if (found.length > 0) prefetchPool(found);
      setWords(m);
    })();
    return () => {
      live = false;
    };
  }, []);

  /** This session's High and Low takes; the middle comes from both. */
  const takesRef = useRef<{ top?: TunerTake; bottom?: TunerTake }>({});

  const finishStep = (r: TunerResult | null, verdict?: RoomVerdict) => {
    if (r) setDraft((d) => applyTunerResult(d, r));
    if (verdict) setRoom(verdict);
    advance();
  };

  /** A voice take locked. Lines are set once both takes exist (or on a redo of one part). */
  const finishTake = (part: VoicePart, take: TunerTake) => {
    takesRef.current = { ...takesRef.current, [part]: take };
    const t = takesRef.current;
    const firstPass = view.kind === "step" && view.back === "next" && part === "top";
    if (!firstPass) {
      const next = settingsFromTakes(draft, t);
      if (next) setDraft(next);
    }
    advance();
  };

  const advance = () => {
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
          {view.back === "done" ? `Redo: ${STEP_LABEL[view.part]}` : `Step ${stepIndex + 1} of ${STEPS.length}`}
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
          part={view.part as VoicePart}
          draft={draft}
          words={words}
          onTake={(take) => finishTake(view.part as VoicePart, take)}
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
 * Each voice step, for a beginner: the word in a big ring (the ring fills
 * while you hold the word), one plain instruction, and below it the
 * Visualiser's own canvas: the bird on the left, your line scrolling behind
 * it, and (top and bottom) the word's target as a guide. Pierre, 22 Nov:
 * "like the rest of the game", the hold indicator where people look.
 */
const STEP_COPY: Record<VoicePart, { label: string; hint: string; fallback: { hanzi: string; pinyin: string } }> = {
  top: { label: "High note", hint: "High and steady", fallback: { hanzi: "媽", pinyin: "mā" } },
  bottom: { label: "Low note", hint: "Low and relaxed", fallback: { hanzi: "馬", pinyin: "mǎ" } },
};

/** Canvas width in time, the Visualiser's own (Visualiser.tsx `SPAN_MS`). */
const SPAN_MS = 1600;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

interface VoiceStepProps {
  part: VoicePart;
  draft: CalibrationSettings;
  words: Map<string, Word> | null;
  /** The locked take; the parent sets the lines (middle from both takes). */
  onTake: (take: TunerTake) => void;
}

type Note = "ready" | "hearing" | "louder" | "pause" | "locked";

function VoiceStep({ part, draft, words, onTake }: VoiceStepProps) {
  const takes = [part === "top" ? TOP_WORD : BOTTOM_WORD];
  const [take, setTake] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<Note>("ready");
  /** "Couldn't hear that, try again": shown until the player's voice comes in again. */
  const [retry, setRetry] = useState(false);
  const retryRef = useRef(false);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  /** Each locked take's frames, per tracker floor. A ref: fills at frame rate. */
  const pooled = useRef<{ normal: number[][]; low: number[][] }>({ normal: [], low: [] });
  /** What the drawing reads each frame. Mutable, outside React (hard rule 1). */
  const live = useRef({ trail: new PitchTrail(SPAN_MS, BRIDGE_MS), chao: 3, voiced: false, progress: 0, locked: false, bars: 0 });
  const barsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const word = words?.get(takes[take]);
  const copy = STEP_COPY[part];
  // The scale the bird flies on: the learned one if any, else this calibration (read only).
  const shown = withLearnedScale(draft);

  // Capture: one StepCapture per take. Locks on silence after enough voice.
  useEffect(() => {
    if (take === 0) pooled.current = { normal: [], low: [] };
    const L = live.current;
    L.progress = 0;
    L.locked = false;
    // A new word starts on a clean stage, so the change is visible.
    L.trail = new PitchTrail(SPAN_MS, BRIDGE_MS);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new take starts ready
    setNote("ready");
    const cap = new StepCapture(captureOptions(), performance.now());
    const lowFrames: number[] = [];
    let normal: PitchTracker | null = null;
    let low: PitchTracker | null = null;
    let lastNote: Note = "ready";
    const say = (n: Note) => {
      if (n !== lastNote) {
        lastNote = n;
        setNote(n);
      }
    };
    setFrameSink((frame, sampleRate) => {
      // Deaf while the example plays: the speaker would be measured, not the player.
      // The mic bars still move: the player always sees the mic is live.
      if (isCueAudible()) {
        L.bars = voiceBars(rmsOf(frame), draft.noiseFloor);
        return;
      }
      const cfg = tunerTrackerConfig(part, draft, sampleRate);
      normal ??= new PitchTracker({ ...cfg, f0Center: shown.f0Center, rangeSemitones: shown.rangeSemitones, rangeDownSemitones: shown.rangeDownSemitones });
      low ??= new PitchTracker({ ...cfg, fMin: tuning().pitchFloorLowHz });
      const p = normal.push(frame);
      const q = low.push(frame);
      const now = performance.now();
      L.bars = voiceBars(p.rms, draft.noiseFloor);
      const before = cap.phase;
      const before0 = cap.f0s.length;
      const phase = cap.push({ tMs: now, voiced: p.voiced, f0: p.f0 });
      if (cap.f0s.length > before0 && q.voiced && q.f0 !== null) lowFrames.push(q.f0);
      L.trail.push(p.smoothedChao, p.voiced, now);
      if (p.voiced) L.chao = p.smoothedChao;
      L.voiced = p.voiced;
      L.progress = cap.progress;
      if (phase === "hearing" && retryRef.current) setRetry(false);
      if (phase === "locked" && before !== "locked") {
        // The ring is full: the bird stops here. Only the mic bars keep moving.
        setFrameSink((f) => {
          live.current.bars = voiceBars(rmsOf(f), draft.noiseFloor);
        });
        pooled.current.normal.push([...cap.f0s]);
        pooled.current.low.push([...lowFrames]);
        L.locked = true;
        L.voiced = false;
        L.progress = 1;
        say("locked");
      } else if (phase === "tooShort") {
        // Too little voice: say so and listen again, never a wrong result (hard rule 8).
        setFrameSink(null);
        setRetry(true);
        setAttempt((a) => a + 1);
      } else {
        say(!cap.listening && p.voiced ? "pause" : phase === "hearing" ? "hearing" : cap.stalled(now) ? "louder" : "ready");
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
      const got: TunerTake = { normal: f.normal.flat(), low: f.low.flat() };
      // Enough of a voice to measure? Else "try again", never a wrong result (hard rule 8).
      if (measureMiddle(got.normal) !== null) onTake(got);
      else {
        setTake(0);
        setAttempt((a) => a + 1);
        setRetry(true);
      }
    }, 900);
    return () => clearTimeout(id);
  }, [note]);

  // Drawing: the ring and the Visualiser canvas, from refs in a rAF loop (hard rule 1).
  useEffect(() => {
    let raf = 0;
    const guide = word ?? null;
    const guideTone: Tone = (word?.tone as Tone | undefined) ?? (part === "bottom" ? 3 : 1);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const L = live.current;
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - (L.locked ? 1 : L.progress)));
      if (barsRef.current) paintBars(barsRef.current, L.bars);
      const c = canvasRef.current;
      if (!c) return;
      const w = c.clientWidth, h = c.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawVisualiser(g, w, h, {
        tone: guideTone,
        word: guide,
        live: null,
        finished: [],
        spanMs: SPAN_MS,
        chao: L.chao,
        voiced: L.voiced,
        scroll: { points: L.trail.points(), nowMs: L.trail.clockMs(), originMs: L.trail.originMs() },
        scrollGuide: true,
        corridor: "wide",
        band: true,
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [part, word]);

  const playExample = () => {
    if (!word) return;
    void ensurePlaybackCtx();
    const audio = getMicSession()?.ctx;
    if (audio && audio.state === "suspended") void audio.resume();
    playToneCue(word.tone as Tone, shown.f0Center, shown.rangeSemitones, word, shown.rangeDownSemitones);
  };

  const status =
    note === "locked" ? (take + 1 < takes.length ? "Done ✓ Next word…" : "Done ✓")
    : retry ? "Too short. Again"
    : note === "louder" ? "Louder?"
    : note === "pause" ? "Pause, then say it"
    : note === "hearing" ? "Hold…"
    : "Say it";
  const locked = note === "locked";
  return (
    <>
      <div key={`${part}-${take}`} className={`tuner-ring tuner-enter${locked ? " is-locked" : ""}`}>
        <span className="tuner-ring-label">
          {copy.label}
        </span>
        <svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label={`Hold indicator for ${word?.hanzi ?? copy.fallback.hanzi}`}>
          <circle cx="64" cy="64" r={RING_R} className="tuner-ring-track" />
          <circle cx="64" cy="64" r={RING_R} className="tuner-ring-fill" ref={ringRef}
            style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C }} transform="rotate(-90 64 64)" />
          <text x="64" y="62" textAnchor="middle" className="tuner-ring-hanzi" lang="zh-Hant">{word?.hanzi ?? copy.fallback.hanzi}</text>
          <text x="64" y="90" textAnchor="middle" className="tuner-ring-pinyin">{locked ? "✓" : (word?.pinyin ?? copy.fallback.pinyin)}</text>
        </svg>
        <span className="tuner-ring-hint">{copy.hint}</span>
      </div>
      <div className="tuner-panel tuner-stage">
        <canvas ref={canvasRef} role="img" aria-label="Your voice: the bird follows your pitch" />
      </div>
      <div className="tuner-panel tuner-meter">
        <div className="tuner-voice-bars" ref={barsRef} role="img" aria-label="Microphone level">
          {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ height: `${8 + i * 5}px` }} />)}
        </div>
        <strong className={`tuner-ring-status${locked ? " is-locked" : ""}`} role="status">{status}</strong>
      </div>
      <div className="tuner-actions">
        <button disabled={!word} onClick={playExample}>
          ▶ Hear it
        </button>
        <button onClick={() => { setTake(0); setAttempt((a) => a + 1); }}>Start over</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ done

interface DoneProps {
  draft: CalibrationSettings;
  room: RoomVerdict | null;
  changed: boolean;
  onRedo: (p: StepPart) => void;
  onDone: () => void;
  onCancel: () => void;
}

function DoneView({ draft, room, changed, onRedo, onDone, onCancel }: DoneProps) {
  const roomVerdictNow = room ?? roomVerdict(draft.noiseFloor);
  const rows: Array<{ part: TunerPart; dot: string; title: string; sub: string }> = [
    { part: "top", dot: "top", title: `Top: ${semitoneWord(draft.rangeSemitones)} up`, sub: "from the middle to line 5" },
    { part: "room", dot: "middle", title: "Middle: line 3", sub: "between your high and low notes" },
    { part: "bottom", dot: "bottom", title: `Bottom: ${semitoneWord(draft.rangeDownSemitones)} down`, sub: "from the middle to line 1" },
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
            {r.part !== "room" && <button onClick={() => onRedo(r.part as StepPart)}>Redo</button>}
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
