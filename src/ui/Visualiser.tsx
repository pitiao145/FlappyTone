import { useEffect, useRef, useState } from "react";
import { inventoryNow, loadInventory } from "../audio/inventory.ts";
import { isCueAudible, loadClip, playToneCue } from "../audio/reference.ts";
import { getMicSession, setFrameSink } from "../audio/session.ts";
import { publishState, setActiveTracker } from "../game/activeTracker.ts";
import { ContourRecorder } from "../game/contours.ts";
import { shapeForWord, TONE_INFO, type Tone } from "../game/gates.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import { visualAccuracy } from "../game/visualAccuracy.ts";
import type { Word } from "../game/words.ts";
import { wordsOfTone } from "../game/words.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawVisualiser } from "../render/visualiser.ts";

/** How much time the panel spans. Long enough for a citation syllable and a breath. */
const SPAN_MS = 1600;

const TONES: Tone[] = [1, 2, 3, 4];

/**
 * The tone diacritics on their own, the way tone charts show them — every
 * tone's pill used to be labelled with the same syllable ("mā", "má", "mǎ",
 * "mà"), which read as four variants of one word rather than four tones.
 */
const TONE_MARKS: Record<Tone, string> = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ" };

interface WordStats {
  attempts: number;
  sumAccuracy: number;
}

interface Props {
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
  onBack: () => void;
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
export function Visualiser({
  settings,
  canvasWidth,
  canvasHeight,
  onBack,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [words, setWords] = useState<Word[]>(() => inventoryNow() ?? []);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [paused, setPaused] = useState(false);
  /** Mobile only — the collapsed tone-mark icon opens this to pick a tone. */
  const [tonePopoverOpen, setTonePopoverOpen] = useState(false);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? scaleForDpr(canvas, canvasWidth, canvasHeight) : null;
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
    setFrameSink((frame, sampleRate) => {
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
    });

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
          wordStatsRef.current = {
            attempts: stats.attempts + 1,
            sumAccuracy: stats.sumAccuracy + accuracy,
          };
        }
      }
      const stats = word ? wordStatsRef.current : null;

      drawVisualiser(ctx, canvasWidth, canvasHeight, {
        tone: toneRef.current,
        word,
        live,
        finished,
        spanMs: SPAN_MS,
        chao: displayChao,
        voiced: voiced || now - lastVoicedAt <= tuning().graceMs,
        accuracy:
          stats && stats.attempts > 0
            ? { value: stats.sumAccuracy / stats.attempts, attempts: stats.attempts }
            : null,
      });
      if (running) rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
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
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameSink(null);
      setActiveTracker(null);
    };
  }, [settings, canvasWidth, canvasHeight]);

  const chooseTone = (t: Tone | null) => {
    setTone(t);
    setSelectedWord(null);
    resetAttempts();
    setTonePopoverOpen(false);
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

  const noteText =
    tone === null
      ? "Say anything. The line is your pitch, left to right."
      : selectedWord
        ? `${selectedWord.pinyin} ${selectedWord.hanzi} — tap again to replay.`
        : `${TONE_INFO[tone].pinyin} ${TONE_INFO[tone].hanzi}, ${TONE_INFO[tone].cue}. Tap a word to hear it.`;

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

  return (
    <div className="screen visualiser-screen">
      {/* Mobile and desktop are genuinely different layouts here, not just a
          CSS reflow of the same controls — mobile gets a collapsed
          tone-picker popover and a vertical word rail so the grid stays
          uncluttered; desktop has room for everything laid out flat. Both
          markups always render; App.css's `min-width: 720px` query is what
          picks one. */}
      {/* Mobile only (see App.css) — sits above the grid, not overlaid on it. */}
      <button className="link vis-back-link" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 5 8 12l7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back
      </button>

      <div className="visualiser-body">
        <div className="stage">
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />

          {paused && (
            <div className="overlay" onClick={() => resumeRef.current()}>
              <p>paused, tap to continue</p>
            </div>
          )}

          {/* ---------------------------------------------------- mobile */}
          <button
            className="vis-tone-toggle"
            onClick={() => setTonePopoverOpen((v) => !v)}
            aria-label="Choose tone"
            aria-expanded={tonePopoverOpen}
          >
            {TONES.map((t) => (
              <span
                key={t}
                className={tone === t ? "tone-toggle-dot active" : "tone-toggle-dot"}
              >
                {TONE_MARKS[t]}
              </span>
            ))}
          </button>

          {tone !== null && <div className="word-rail">{wordsForTone.map(wordChip)}</div>}

          {tonePopoverOpen && (
            <div className="tone-popover-backdrop" onClick={() => setTonePopoverOpen(false)}>
              <div className="tone-popover" onClick={(e) => e.stopPropagation()}>
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
                    className={
                      tone === t ? "choice-option tone-pill active" : "choice-option tone-pill"
                    }
                    onClick={() => chooseTone(t)}
                    aria-label={`${TONE_INFO[t].pinyin}, tone ${t}`}
                  >
                    {TONE_MARKS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="vis-bottom-bar">
            <button onClick={resetAttempts}>Clear</button>
            <p className="note">{noteText}</p>
          </div>
        </div>

        {/* --------------------------------------------------- desktop */}
        <div className="visualiser-panel">
          <div className="tone-rail">
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
                aria-label={`${TONE_INFO[t].pinyin}, tone ${t}`}
              >
                {TONE_MARKS[t]}
              </button>
            ))}
          </div>

          {tone !== null && <div className="word-strip">{wordsForTone.map(wordChip)}</div>}

          <p className="note">{noteText}</p>

          <div className="setting-actions">
            <button onClick={resetAttempts}>Clear</button>
            <button className="primary" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
