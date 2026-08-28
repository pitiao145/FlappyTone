import { useEffect, useRef, useState } from "react";
import { inventoryNow, loadInventory } from "../audio/inventory.ts";
import { MicError } from "../audio/mic.ts";
import { isCueAudible, loadClip, playToneCue } from "../audio/reference.ts";
import { ensureMic, getMicSession, MicCancelled, setFrameSink, stopMic } from "../audio/session.ts";
import { acquireWakeLock, releaseWakeLock } from "../audio/wakeLock.ts";
import { publishState, setActiveTracker } from "../game/activeTracker.ts";
import { ContourRecorder } from "../game/contours.ts";
import { shapeForWord, type Tone } from "../game/gates.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { classifyTone, type ToneClassification } from "../game/toneClassifier.ts";
import { tuning } from "../game/tuning.ts";
import { visualAccuracy } from "../game/visualAccuracy.ts";
import type { Word } from "../game/words.ts";
import { wordsOfTone } from "../game/words.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawVisualiser } from "../render/visualiser.ts";
import { micErrorCopy } from "./micErrors.ts";
import {
  ChevronIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  ToneMarkIcon,
  TonesGridIcon,
  TONE_SHORT_LABEL,
} from "./toneIcons.tsx";

/** How much time the panel spans. Long enough for a citation syllable and a breath. */
const SPAN_MS = 1600;

const TONES: Tone[] = [1, 2, 3, 4];

interface WordStats {
  attempts: number;
  sumAccuracy: number;
}

/** Colour tier for the accuracy readout — the same 85%/60% cut points the game's own perfect/good/ok outcomes use. */
function accuracyTier(value: number): "good" | "ok" | "bad" {
  return value >= 0.85 ? "good" : value >= 0.6 ? "ok" : "bad";
}

/**
 * Colour tier for the standalone recognizer's readout.
 *
 * `recognized` never looks at the practice target (see `recognizedReadout`'s
 * own comment) — it answers "what did this shape resemble", full stop. But
 * when the player *has* picked a tone to practice, the readout is the
 * fastest way to see whether what they just said actually was that tone, so
 * it has to read as right/wrong against that target rather than as a
 * confidence gauge: practicing Tone 2 and producing a confident Tone 1
 * should show red, not green, no matter how clearly it read as a T1.
 * Confidence-based tiering only applies in free play, where there is no
 * target to be right or wrong against.
 */
function recognizedTier(
  target: Tone | null,
  recognized: ToneClassification,
): "good" | "ok" | "bad" {
  if (recognized.tone === "none") return "bad";
  if (target !== null) return recognized.tone === target ? "good" : "bad";
  return accuracyTier(recognized.confidence);
}

interface Props {
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The tone visualiser: the game's screen with the game taken out.
 *
 * No gates, no scrolling, no score — just the Chao grid, the target shape, and
 * your own contour drawn on a stationary time axis so the two can be compared.
 * It exists because the game asks you to produce a tone *and* hit a moving
 * corridor at the same time, and when that fails there is no way to tell which
 * half went wrong. Here there is only one half.
 */
export function Visualiser({ settings, canvasWidth, canvasHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /**
   * Measured size of the `.stage` box, which CSS now stretches to fill
   * whatever room the frame actually has (mobile: full height between the
   * nav and the bottom bar; desktop: capped at 420px wide, same as before).
   * Falls back to the `canvasWidth`/`canvasHeight` props until the first
   * observation lands, so first paint isn't 0x0.
   */
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const canvasW = measured?.w ?? canvasWidth;
  const canvasH = measured?.h ?? canvasHeight;
  const [tone, setTone] = useState<Tone | null>(1);
  const [words, setWords] = useState<Word[]>(() => inventoryNow() ?? []);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [paused, setPaused] = useState(false);
  /** Mobile only — the collapsed tone-mark icon opens this to pick a tone. */
  const [tonePopoverOpen, setTonePopoverOpen] = useState(false);
  const [popoverTab, setPopoverTab] = useState<"tone" | "wordlists">("tone");
  /**
   * Mirrors `wordStatsRef` into React state so the accuracy readout — now a
   * real DOM element, not canvas-drawn — can render it. Only set once per
   * finished attempt (inside the tick loop below), never per frame.
   */
  const [accuracyDisplay, setAccuracyDisplay] = useState<{
    value: number;
    attempts: number;
  } | null>(null);
  /** Read by the rAF loop, which must not re-run when the tone changes. */
  const toneRef = useRef<Tone | null>(null);
  toneRef.current = tone;
  const wordRef = useRef<Word | null>(null);
  wordRef.current = selectedWord;
  const recorderRef = useRef<ContourRecorder | null>(null);
  const resumeRef = useRef<() => void>(() => {});
  /** Combined accuracy for the current word — reset on word change or Clear. */
  const wordStatsRef = useRef<WordStats>({ attempts: 0, sumAccuracy: 0 });
  /** `startedAtMs` of the last finished attempt already folded into `wordStatsRef`. */
  const lastScoredAtRef = useRef<number | null>(null);
  /**
   * The standalone recognizer's read of the last finished attempt —
   * deliberately independent of `word`/`tone`: it runs off the same
   * `finished()` array the accuracy scoring does, but never looks at what
   * the "target" was. See `classifyTone` in `src/game/toneClassifier.ts`.
   */
  const [recognized, setRecognized] = useState<ToneClassification | null>(null);
  /** `startedAtMs` of the last finished attempt already classified. */
  const lastRecognizedAtRef = useRef<number | null>(null);
  /**
   * A real cut, not a soft ignore-the-frames mute: muting calls `stopMic()`,
   * which tears down the `MediaStream`/`AudioContext` and turns off the
   * OS-level mic indicator — the point, for a noisy-room toggle. Unmuting
   * calls `ensureMic()` again from this same click, which is its own gesture
   * (iOS Safari's requirement), so no separate "enable mic" flow is needed.
   */
  const [muted, setMuted] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [muteError, setMuteError] = useState<string | null>(null);
  /**
   * The main effect's own frame-sink callback, so `toggleMute` can
   * re-install it after `ensureMic()` reopens a session — `stopMic()` clears
   * the sink at the session-module level (see `src/audio/session.ts`), and
   * that must not restart the whole effect (it would drop the trail/recorder
   * and reset the wake lock/rAF loop for no reason).
   */
  const frameSinkRef = useRef<((frame: Float32Array, sampleRate: number) => void) | null>(null);

  const toggleMute = async () => {
    if (muteBusy) return;
    if (!muted) {
      stopMic();
      setMuted(true);
      return;
    }
    setMuteBusy(true);
    setMuteError(null);
    try {
      await ensureMic();
      setFrameSink(frameSinkRef.current);
      setMuted(false);
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setMuteError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setMuteBusy(false);
    }
  };

  /**
   * Clears both the trail and the running accuracy. Used whenever the word
   * actually changes: leaving the old word's trail in `recorder` would leave
   * its already-finished attempts sitting in `finished()`, which the tick
   * loop would then score against the *new* word's shape the moment
   * `lastScoredAtRef` resets to null.
   */
  const resetAttempts = () => {
    recorderRef.current?.clear();
    wordStatsRef.current = { attempts: 0, sumAccuracy: 0 };
    lastScoredAtRef.current = null;
    setAccuracyDisplay(null);
    lastRecognizedAtRef.current = null;
    setRecognized(null);
  };

  useEffect(() => {
    if (words.length > 0) return;
    void loadInventory().then(setWords);
  }, [words.length]);

  // Preload only the selected tone's clips (not all 120) so a tap plays
  // instantly without fetching every word up front.
  useEffect(() => {
    if (tone === null) return;
    const audio = getMicSession()?.ctx;
    if (!audio) return;
    for (const w of wordsOfTone(words, tone)) void loadClip(audio, w);
  }, [tone, words]);

  const wordsForTone = tone === null ? [] : wordsOfTone(words, tone);

  // CSS (App.css) now stretches `.stage` to fill the real space it has —
  // full height on mobile, the 420px-capped column on desktop — instead of
  // the canvas being fixed at a 9:16 constant. Measure that box directly so
  // the drawing space always matches what's actually on screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w <= 0 || h <= 0) return;
      setMeasured((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? scaleForDpr(canvas, canvasW, canvasH) : null;
    if (!canvas || !ctx) return;

    const recorder = new ContourRecorder();
    recorderRef.current = recorder;
    let tracker: PitchTracker | null = null;
    let rafId = 0;
    let running = true;
    /** Eased render position, exactly as the game eases its dot. */
    let displayChao = 3;
    let voiced = false;
    let lastVoicedAt = -Infinity;
    let lastT = performance.now();

    // The mic is already open — the caller opened it inside a click gesture.
    // Stored in a ref (not just handed to setFrameSink) so `toggleMute` can
    // re-install this exact callback after unmuting reopens the session,
    // without re-running this whole effect.
    const onFrame = (frame: Float32Array, sampleRate: number) => {
      // Deaf while the example plays — otherwise the game's own voice is drawn
      // as the player's contour.
      if (isCueAudible()) return;
      if (!tracker) {
        tracker = new PitchTracker({
          sampleRate,
          f0Center: settings.f0Center,
          noiseFloor: settings.noiseFloor,
          rangeSemitones: settings.rangeSemitones,
          rangeDownSemitones: settings.rangeDownSemitones,
        });
        setActiveTracker(tracker);
      }
      const p = tracker.push(frame);
      publishState(p);
      const now = performance.now();
      recorder.push(p.smoothedChao, p.voiced, now);
      voiced = p.voiced;
      if (p.voiced) lastVoicedAt = now;
    };
    frameSinkRef.current = onFrame;
    setFrameSink(onFrame);

    const tick = (now: number) => {
      const dt = Math.min(100, now - lastT);
      lastT = now;
      const live = recorder.live();
      const finished = recorder.finished();
      const head = live?.points.at(-1);
      // Between utterances the dot returns to the rest line, as it does in
      // play — but nothing drifts *while* you are speaking.
      const target = head && voiced ? head.chao : 3;
      displayChao +=
        (target - displayChao) * (1 - Math.exp(-dt / tuning().easeTauMs));

      // Score any attempt that finished since the last frame. `finished()` is
      // capped and shifts, so identity (startedAtMs) rather than length is
      // what says "this one is new" — length stops changing once the cap is
      // hit, right when a running average matters most.
      const word = wordRef.current;
      const latest = finished.at(-1);
      if (word && latest && latest.startedAtMs !== lastScoredAtRef.current) {
        lastScoredAtRef.current = latest.startedAtMs;
        const accuracy = visualAccuracy(latest, shapeForWord(word));
        if (accuracy !== null) {
          const stats = wordStatsRef.current;
          const next = {
            attempts: stats.attempts + 1,
            sumAccuracy: stats.sumAccuracy + accuracy,
          };
          wordStatsRef.current = next;
          // Event-driven, not per-frame: this branch only runs once per
          // completed utterance, when `finished()` grows a new entry.
          setAccuracyDisplay({ value: next.sumAccuracy / next.attempts, attempts: next.attempts });
        }
      }

      // Standalone recognition — runs off the same `finished()` array as the
      // accuracy scoring above, but deliberately never reads `word`/`tone`:
      // it answers "what did this shape resemble", not "how well did it hit
      // a target". See `classifyTone`.
      if (latest && latest.startedAtMs !== lastRecognizedAtRef.current) {
        lastRecognizedAtRef.current = latest.startedAtMs;
        setRecognized(classifyTone(latest));
      }

      drawVisualiser(ctx, canvasW, canvasH, {
        tone: toneRef.current,
        word,
        live,
        finished,
        spanMs: SPAN_MS,
        chao: displayChao,
        voiced: voiced || now - lastVoicedAt <= tuning().graceMs,
      });
      if (running) rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
      // No touch input drives this screen either — same rationale as Game.tsx.
      void acquireWakeLock();
    };
    resumeRef.current = () => {
      const audio = getMicSession()?.ctx;
      // resume() from the overlay's click handler — iOS requires the gesture.
      if (audio && audio.state === "suspended") void audio.resume();
      setPaused(false);
      start();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      running = false;
      cancelAnimationFrame(rafId);
      void getMicSession()?.ctx.suspend();
      releaseWakeLock();
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseWakeLock();
      setFrameSink(null);
      setActiveTracker(null);
      frameSinkRef.current = null;
    };
  }, [settings, canvasW, canvasH]);

  const chooseTone = (t: Tone | null) => {
    setTone(t);
    setSelectedWord(null);
    resetAttempts();
    setTonePopoverOpen(false);
    setPopoverTab("tone");
  };

  const playWord = (word: Word) => {
    // A tap on the already-selected word is a replay, not a new attempt at a
    // new word — the trail and the running accuracy must survive it.
    if (selectedWord?.id !== word.id) resetAttempts();
    setSelectedWord(word);
    const audio = getMicSession()?.ctx;
    // Same context the mic runs on, so it is already gesture-resumed.
    if (audio && audio.state === "running") {
      playToneCue(
        audio,
        word.tone,
        settings.f0Center,
        settings.rangeSemitones,
        word,
        settings.rangeDownSemitones,
      );
    }
  };

  /**
   * Shared by the mobile top bar and the desktop panel — a real cut/reopen
   * (see `toggleMute` above), so a permission failure on unmute gets its own
   * small inline error rather than failing silently.
   */
  const muteButton = (
    <div className="vis-mute-group">
      <button
        className={muted ? "vis-mute muted" : "vis-mute"}
        onClick={() => void toggleMute()}
        disabled={muteBusy}
        aria-pressed={muted}
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
      >
        {muted ? (
          <MicrophoneSlashIcon className="vis-mute-icon" />
        ) : (
          <MicrophoneIcon className="vis-mute-icon" />
        )}
      </button>
      {muteError && <p className="error vis-mute-error">{muteError}</p>}
    </div>
  );

  /** Shared by the mobile top bar and the desktop panel — same readout, two layouts. */
  const accuracyReadout = (
    <div className="vis-accuracy">
      <span className="vis-accuracy-label">accuracy</span>
      {accuracyDisplay ? (
        <>
          <strong className={`vis-accuracy-value tier-${accuracyTier(accuracyDisplay.value)}`}>
            {Math.round(accuracyDisplay.value * 100)}%
          </strong>
          <span className="vis-accuracy-tries">
            {accuracyDisplay.attempts === 1 ? "1 try" : `${accuracyDisplay.attempts} tries`}
          </span>
        </>
      ) : (
        <span className="vis-accuracy-value vis-accuracy-empty">–</span>
      )}
    </div>
  );

  /**
   * The standalone recognizer's readout, always shown next to accuracy now
   * (was Lab-only behind `showRecognizedTone`). What tone it reports is
   * deliberately independent of the practice target — see `classifyTone` —
   * but its colour is not: see `recognizedTier`.
   */
  const recognizedReadout = (
    <div
      className={recognized ? `vis-accuracy tier-${recognizedTier(tone, recognized)}` : "vis-accuracy"}
    >
      <span className="vis-accuracy-label">Tone</span>
      {recognized ? (
        <>
          <strong
            className={`vis-accuracy-value tier-${recognizedTier(tone, recognized)}`}
          >
            {recognized.tone === "none" ? "none" : `T${recognized.tone}`}
          </strong>
          <span className="vis-accuracy-tries">
            {Math.round(recognized.confidence * 100)}%
          </span>
        </>
      ) : (
        <span className="vis-accuracy-value vis-accuracy-empty">–</span>
      )}
    </div>
  );

  const wordChip = (w: Word) => (
    <button
      key={w.id}
      className={
        selectedWord?.id === w.id ? "choice-option word-chip active" : "choice-option word-chip"
      }
      onClick={() => playWord(w)}
    >
      <span className="word-chip-hanzi">{w.hanzi}</span>
      <span className="word-chip-pinyin">{w.pinyin}</span>
    </button>
  );

  /** Tab strip — shared by mobile popover and desktop panel. */
  const tonePickerTabs = (
    <div className="tone-popover-tabs">
      <button
        className={popoverTab === "tone" ? "tone-popover-tab active" : "tone-popover-tab"}
        onClick={() => setPopoverTab("tone")}
      >
        By tone
      </button>
      <button
        className={popoverTab === "wordlists" ? "tone-popover-tab active" : "tone-popover-tab"}
        onClick={() => setPopoverTab("wordlists")}
      >
        Word lists
      </button>
    </div>
  );

  const tonePickerWordlists = (
    <div className="tone-popover-wordlists">
      <p className="tone-popover-desc">
        Practice by curated word lists — HSK levels, your saved words, and more.
      </p>
      <div className="word-list-row">
        <span>HSK 1</span>
        <span className="word-list-soon">soon</span>
      </div>
      <div className="word-list-row">
        <span>My words</span>
        <span className="word-list-soon">soon</span>
      </div>
    </div>
  );

  /** Mobile popover — stacked rows with labels. */
  const tonePickerToneList = (
    <div className="tone-popover-list">
      <button
        className={tone === null ? "tone-popover-row active" : "tone-popover-row"}
        onClick={() => chooseTone(null)}
      >
        <span className="tone-popover-row-icon tone-popover-row-icon-free">—</span>
        Free (no filter)
      </button>
      {TONES.map((t) => (
        <button
          key={t}
          className={tone === t ? "tone-popover-row active" : "tone-popover-row"}
          onClick={() => chooseTone(t)}
        >
          <span className="tone-popover-row-icon">
            <ToneMarkIcon tone={t} className="tone-mark-icon" />
          </span>
          Tone {t} · {TONE_SHORT_LABEL[t]}
        </button>
      ))}
    </div>
  );

  /** Desktop panel — one horizontal row of round pills. */
  const tonePickerTonePills = (
    <div className="tone-rail-pills">
      <button
        className={
          tone === null
            ? "choice-option tone-pill tone-pill-free active"
            : "choice-option tone-pill tone-pill-free"
        }
        onClick={() => chooseTone(null)}
      >
        free
      </button>
      {TONES.map((t) => (
        <button
          key={t}
          className={tone === t ? "choice-option tone-pill active" : "choice-option tone-pill"}
          onClick={() => chooseTone(t)}
          aria-label={`Tone ${t}, ${TONE_SHORT_LABEL[t]}`}
        >
          <ToneMarkIcon tone={t} className="tone-mark-icon" />
        </button>
      ))}
    </div>
  );

  const mobileTonePickerPanel = (
    <>
      {tonePickerTabs}
      {popoverTab === "tone" ? tonePickerToneList : tonePickerWordlists}
    </>
  );

  const desktopTonePickerPanel = (
    <>
      {tonePickerTabs}
      {popoverTab === "tone" ? tonePickerTonePills : tonePickerWordlists}
    </>
  );

  return (
    // `stage game-stage` are the same two classes Game/PlayHome's own sized
    // element carries (see Game.tsx/PlayHome.tsx) — `stage` is what the base
    // `.frame, .stage { margin-inline: auto }` rule centers, and `game-stage`
    // is what makes `.frame:has(.game-stage) { max-width: none }` apply here
    // too. With the inline width/height below matching exactly what
    // PlayHome gets (see GameApp.tsx), the `.frame` this renders into ends
    // up centered and sized exactly like Play's, with no
    // Visualiser-specific margin/padding rules of its own.
    <div
      className="screen visualiser-screen stage game-stage"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      {/* Mobile and desktop are genuinely different layouts here, not just a
          CSS reflow of the same controls — mobile centers the accuracy/tone
          cards above a full-width canvas, with a horizontal word rail under
          it; desktop has room for everything laid out in a side column.
          Both markups always render; App.css's `min-width: 720px` query is
          what picks one. */}
      <div className="visualiser-body">
        <div className="vis-top-bar">
          {muteButton}
          <div className="vis-readouts">
            {accuracyReadout}
            {recognizedReadout}
          </div>
          <button onClick={resetAttempts}>Clear</button>
        </div>

        <div className="vis-canvas-column">
          <div className="stage" ref={stageRef}>
            <canvas ref={canvasRef} width={canvasW} height={canvasH} />

            {paused && (
              <div className="overlay" onClick={() => resumeRef.current()}>
                <p>paused, tap to continue</p>
              </div>
            )}
          </div>

          <div className="vis-canvas-clear">
            {muteButton}
            <button onClick={resetAttempts}>Clear</button>
          </div>
        </div>

        {/* ---------------------------------------------------- mobile */}
        {/* Under the canvas, not beside it: filter on the left, words
            scrolling sideways so the grid can use the full width. */}
        <div className={tone === null ? "vis-side-panel is-free" : "vis-side-panel"}>
          <div className="vis-filter-group">
            <button
              className="vis-filter-btn"
              onClick={() => setTonePopoverOpen((v) => !v)}
              aria-label="Filter words"
              aria-expanded={tonePopoverOpen}
            >
              {tone === null ? (
                <TonesGridIcon className="vis-filter-icon" />
              ) : (
                <ToneMarkIcon tone={tone} className="tone-mark-icon" />
              )}
              <ChevronIcon open={tonePopoverOpen} className="vis-filter-chevron" />
            </button>
          </div>

          <div className="word-rail-wrap">
            {tone !== null ? (
              <div className="word-rail">{wordsForTone.map(wordChip)}</div>
            ) : (
              <p className="vis-free-hint">Select the tones you want to practice</p>
            )}
          </div>
        </div>

        {/* --------------------------------------------------- desktop */}
        <div className="visualiser-panel">
          <div className="vis-readouts">
            {accuracyReadout}
            {recognizedReadout}
          </div>

          <div className="vis-tone-picker">{desktopTonePickerPanel}</div>

          {tone !== null && <div className="word-strip">{wordsForTone.map(wordChip)}</div>}
        </div>

        {tonePopoverOpen && (
          <div className="tone-popover-backdrop" onClick={() => setTonePopoverOpen(false)}>
            <div className="tone-popover" onClick={(e) => e.stopPropagation()}>
              {mobileTonePickerPanel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
