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
import type { CalibrationSettings } from "../game/settings.ts";
import {
  StepCapture,
  applyTunerResult,
  captureOptions,
  measureMiddle,
  settingsFromParts,
  type TunerTake,
  roomBars,
  roomMarker,
  roomVerdict,
  semitoneWord,
  voiceBars,
  type RoomVerdict,
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

/**
 * Room → Talk → 媽 → 馬 (Pierre, 22 Nov 2026). Talk (read numbers aloud, any
 * language) sets the middle; 媽 the top line, 馬 the bottom line
 * (`settingsFromParts`). Each part can be redone on its own.
 */
type VoicePart = "talk" | "t1" | "t3";
type StepPart = "room" | VoicePart;
const STEPS: StepPart[] = ["room", "talk", "t1", "t3"];
const TONE_WORD: Record<"t1" | "t3", { id: string; tone: 1 | 3; hanzi: string; pinyin: string; label: string; hint: string }> = {
  t1: { id: "ma1b", tone: 1, hanzi: "媽", pinyin: "mā", label: "First tone", hint: "Listen, then say it back" },
  t3: { id: "ma3b", tone: 3, hanzi: "馬", pinyin: "mǎ", label: "Third tone", hint: "Listen, then say it back" },
};
const STEP_LABEL: Record<StepPart, string> = { room: "Room", talk: "Talk", t1: "媽 mā", t3: "馬 mǎ" };
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
      const found = Object.values(TONE_WORD).map((w) => m.get(w.id)).filter((w): w is Word => !!w);
      if (found.length > 0) prefetchPool(found);
      setWords(m);
    })();
    return () => {
      live = false;
    };
  }, []);

  /** This session's takes, per part. */
  const takesRef = useRef<Partial<Record<VoicePart, TunerTake>>>({});
  /** The part that measured nothing usable: it shows "Couldn't hear that" when it opens again. */
  const [again, setAgain] = useState<VoicePart | null>(null);

  const finishStep = (r: TunerResult | null, verdict?: RoomVerdict) => {
    if (r) setDraft((d) => applyTunerResult(d, r));
    if (verdict) setRoom(verdict);
    advance();
  };

  /**
   * A take locked. Talk sets the middle at once (the bird then flies on it);
   * 媽 and 馬 set their line from that middle. A redo changes only its part.
   */
  const finishTake = (part: VoicePart, take: TunerTake) => {
    takesRef.current = { ...takesRef.current, [part]: take };
    const next = settingsFromParts(draft, { [part]: take });
    if (!next) {
      // Never a wrong result (hard rule 8): this part again.
      setAgain(part);
      setView({ kind: "step", part, back: view.kind === "step" ? view.back : "next" });
      return;
    }
    setAgain(null);
    setDraft(next);
    if (view.kind === "step" && view.back === "done") setView({ kind: "done" });
    else advance();
  };

  const advance = () => {
    if (view.kind !== "step") return;
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
      <div className="tuner-steps">
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
          again={again === view.part}
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
 * One voice part, same screen for all three:
 * - Talk: a number in the ring, a new one every 1.7 s; read them out loud,
 *   any language. The ring fills with voiced speech; pauses are fine.
 * - 媽 / 馬: the native example plays, then "Your turn"; the ring fills while
 *   the voice is heard and the word locks on the silence after it.
 * Below, the Visualiser's canvas: the bird on the left, the line behind it,
 * and for 媽 / 馬 the word's target as a guide.
 */
const SPAN_MS = 1600;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
/** The talk step's looser loudness gate (old calibration: normal speech must not be thrown away). */
const TALK_RMS_MULT = 1.5;
const NUMBER_FLASH_MS = 1700;
const randomNumber = (last: string | null): string => {
  let n: string;
  do n = String(Math.floor(10 + Math.random() * 90)); while (n === last);
  return n;
};

interface VoiceStepProps {
  part: VoicePart;
  draft: CalibrationSettings;
  words: Map<string, Word> | null;
  /** This part measured nothing usable last time: say so once. */
  again: boolean;
  onTake: (take: TunerTake) => void;
}

type Note = "listen" | "ready" | "hearing" | "louder" | "pause" | "locked";

function VoiceStep({ part, draft, words, again, onTake }: VoiceStepProps) {
  const talk = part === "talk";
  const spec = talk ? null : TONE_WORD[part];
  const word = spec ? words?.get(spec.id) : undefined;
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<Note>(talk ? "ready" : "listen");
  const [number, setNumber] = useState(() => randomNumber(null));
  /** "Couldn't hear that": shown until the player's voice comes in again. */
  const [retry, setRetry] = useState(again);
  const retryRef = useRef(again);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  /** What the drawing reads each frame. Mutable, outside React (hard rule 1). */
  const live = useRef({ trail: new PitchTrail(SPAN_MS, BRIDGE_MS), chao: 3, voiced: false, progress: 0, locked: false, bars: 0 });
  const takeRef = useRef<TunerTake | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  // The scale the bird flies on: the learned one if any, else this calibration (read only).
  const shown = withLearnedScale(draft);

  const playExample = () => {
    if (!word || !spec) return;
    void ensurePlaybackCtx();
    const audio = getMicSession()?.ctx;
    if (audio && audio.state === "suspended") void audio.resume();
    playToneCue(spec.tone, shown.f0Center, shown.rangeSemitones, word, shown.rangeDownSemitones);
  };

  // 媽 / 馬: the example plays once when the word appears (Settings' Calibrate tap unlocked audio).
  useEffect(() => {
    if (word && attempt === 0) playExample();
  }, [word]);

  // Talk: a new number to read every 1.7 s, until the ring is full.
  useEffect(() => {
    if (!talk || note === "locked") return;
    const id = setInterval(() => setNumber((n) => randomNumber(n)), NUMBER_FLASH_MS);
    return () => clearInterval(id);
  }, [talk, note]);

  // Capture.
  useEffect(() => {
    const L = live.current;
    L.progress = 0;
    L.locked = false;
    L.trail = new PitchTrail(SPAN_MS, BRIDGE_MS);
    const t = tuning();
    const cap = new StepCapture(
      talk
        ? { ...captureOptions(), needMs: t.tunerTalkVoicedMs, lockOnFull: true, allowPauses: true }
        : { ...captureOptions(), needMs: t.tunerToneNeedMs, lockOnFull: false },
      performance.now(),
    );
    const lowFrames: number[] = [];
    let normal: PitchTracker | null = null;
    let low: PitchTracker | null = null;
    let lastNote: Note | null = null;
    const say = (n: Note) => {
      if (n !== lastNote) {
        lastNote = n;
        setNote(n);
      }
    };
    setFrameSink((frame, sampleRate) => {
      // Deaf while the example plays (the speaker would be measured); the mic bars still move.
      if (isCueAudible()) {
        L.bars = voiceBars(rmsOf(frame), draft.noiseFloor);
        say("listen");
        return;
      }
      const cfg = { ...tunerTrackerConfig(talk ? "middle" : "top", draft, sampleRate), ...(talk ? { rmsMult: TALK_RMS_MULT } : {}) };
      normal ??= new PitchTracker({ ...cfg, f0Center: shown.f0Center, rangeSemitones: shown.rangeSemitones, rangeDownSemitones: shown.rangeDownSemitones });
      low ??= new PitchTracker({ ...cfg, fMin: t.pitchFloorLowHz });
      const p = normal.push(frame);
      const q = low.push(frame);
      const now = performance.now();
      L.bars = voiceBars(p.rms, draft.noiseFloor);
      const before = cap.f0s.length;
      const phase = cap.push({ tMs: now, voiced: p.voiced, f0: p.f0 });
      if (cap.f0s.length > before) lowFrames.push(q.voiced && q.f0 !== null ? q.f0 : (p.f0 as number));
      if (phase !== "locked") {
        L.trail.push(p.smoothedChao, p.voiced, now);
        if (p.voiced) L.chao = p.smoothedChao;
        L.voiced = p.voiced;
      }
      L.progress = cap.progress;
      if (phase === "hearing" && retryRef.current) setRetry(false);
      if (phase === "locked") {
        // Done: the bird stops; only the mic bars keep moving.
        setFrameSink((f) => {
          live.current.bars = voiceBars(rmsOf(f), draft.noiseFloor);
        });
        L.locked = true;
        L.voiced = false;
        L.progress = 1;
        takeRef.current = { normal: [...cap.f0s], low: lowFrames };
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
    return () => setFrameSink(null);
  }, [attempt, part, draft.noiseFloor]);

  // Locked: a short "done" beat, then the next part.
  useEffect(() => {
    if (note !== "locked") return;
    const id = setTimeout(() => {
      const tk = takeRef.current;
      if (tk && measureMiddle(tk.normal) !== null) onTake(tk);
      else {
        setRetry(true);
        setAttempt((a) => a + 1);
      }
    }, 900);
    return () => clearTimeout(id);
  }, [note]);

  // Drawing: the ring, the mic bars and the Visualiser canvas, from refs (hard rule 1).
  useEffect(() => {
    let raf = 0;
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
        tone: spec ? spec.tone : null,
        word: word ?? null,
        live: null,
        finished: [],
        spanMs: SPAN_MS,
        chao: L.chao,
        voiced: L.voiced,
        scroll: { points: L.trail.points(), nowMs: L.trail.clockMs(), originMs: L.trail.originMs() },
        scrollGuide: !!spec,
        corridor: "wide",
        band: true,
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [part, word]);

  const locked = note === "locked";
  const status =
    locked ? "Done ✓"
    : retry ? "Couldn't hear that. Again"
    : note === "listen" ? "Listen…"
    : note === "louder" ? "Louder?"
    : note === "pause" ? "Pause, then say it"
    : note === "hearing" ? (talk ? "Keep reading…" : "…")
    : talk ? "Read the number out loud" : "Your turn";
  return (
    <>
      <div className={`tuner-ring tuner-enter${locked ? " is-locked" : ""}`}>
        <span className="tuner-ring-label">{talk ? "Your speaking voice" : spec!.label}</span>
        <svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label={talk ? "Hold indicator: read the numbers" : `Hold indicator for ${spec!.hanzi}`}>
          <circle cx="64" cy="64" r={RING_R} className="tuner-ring-track" />
          <circle cx="64" cy="64" r={RING_R} className="tuner-ring-fill" ref={ringRef}
            style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C }} transform="rotate(-90 64 64)" />
          {talk ? (
            <text x="64" y="78" textAnchor="middle" className="tuner-ring-hanzi">{locked ? "✓" : number}</text>
          ) : (
            <>
              <text x="64" y="62" textAnchor="middle" className="tuner-ring-hanzi" lang="zh-Hant">{spec!.hanzi}</text>
              <text x="64" y="90" textAnchor="middle" className="tuner-ring-pinyin">{locked ? "✓" : spec!.pinyin}</text>
            </>
          )}
        </svg>
        <span className="tuner-ring-hint">{talk ? "In your normal voice, any language" : spec!.hint}</span>
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
        {!talk && <button disabled={!word} onClick={playExample}>▶ Hear it</button>}
        <button onClick={() => setAttempt((a) => a + 1)}>Start over</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ done

interface DoneProps {
  draft: CalibrationSettings;
  room: RoomVerdict | null;
  changed: boolean;
  onRedo: (p: VoicePart) => void;
  onDone: () => void;
  onCancel: () => void;
}

function DoneView({ draft, room, changed, onRedo, onDone, onCancel }: DoneProps) {
  const roomVerdictNow = room ?? roomVerdict(draft.noiseFloor);
  const rows: Array<{ part: VoicePart; dot: string; title: string; sub: string }> = [
    { part: "t1", dot: "top", title: `Top: ${semitoneWord(draft.rangeSemitones)} up`, sub: "from your first tone 媽" },
    { part: "talk", dot: "middle", title: "Middle: your speaking voice", sub: "line 3" },
    { part: "t3", dot: "bottom", title: `Bottom: ${semitoneWord(draft.rangeDownSemitones)} down`, sub: "from your third tone 馬" },
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
