import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { inventoryNow, loadInventory, subscribeInventory } from "../audio/inventory.ts";
import { MicError } from "../audio/mic.ts";
import {
  ensurePlaybackCtx,
  isCueAudible,
  loadClip,
  playToneCue,
} from "../audio/reference.ts";
import { isChromeIOS, isIOS } from "../audio/platform.ts";
import {
  acquireMicStream,
  ensureMic,
  getMicSession,
  MicCancelled,
  releaseMicStream,
  setFrameSink,
  stopMic,
} from "../audio/session.ts";
import { acquireWakeLock, releaseWakeLock } from "../audio/wakeLock.ts";
import { useTier } from "../data/tier.ts";
import { ContourRecorder } from "../game/contours.ts";
import type { Tone } from "../game/gates.ts";
import { effectiveSpeechStyle, type CalibrationSettings } from "../game/settings.ts";
import { type ToneClassification } from "../game/toneClassifier.ts";
import { classifyToneV2 } from "../game/toneClassifierV2.ts";
import { tierLimits, type TocflLevel } from "../game/tiers.ts";
import { tuning } from "../game/tuning.ts";
import { referenceFromWord, toneAccuracyDetail } from "../game/toneAccuracy.ts";
import type { SpeechStyle, Word } from "../game/words.ts";
import {
  availableToneCombos,
  multiWords,
  toneComboKey,
  wordsForList,
  wordsInStyle,
  wordsOfCombo,
  wordsOfTone,
} from "../game/words.ts";
import { sessionNoiseMeter, startingNoiseFloor } from "../game/sessionNoise.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawVisualiser } from "../render/visualiser.ts";
import { micErrorCopy } from "./micErrors.ts";
import { SPEECH_STYLE_LABEL } from "./Settings.tsx";
import {
  ChevronIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  ToneMarkIcon,
  TonesGridIcon,
  TONE_SHORT_LABEL,
  type ToneOrNeutral,
} from "./toneIcons.tsx";

/**
 * How much time the panel spans. Long enough for a citation syllable and a
 * breath. Exported for the dev Lab's tone-pair exploration
 * (`src/dev/TonePairs.tsx`), which reuses `drawVisualiser` directly to render
 * a tone-pair fixture on identical axes for comparison.
 */
export const SPAN_MS = 1600;

/** How long the "wrong tone" toast stays up — matches .mismatch-toast's own fade (App.css). */
const WRONG_TOAST_MS = 1200;

const TONES: Tone[] = [1, 2, 3, 4];

/**
 * How long a tapped word waits for its clip before it plays the synthetic
 * sweep instead. Long enough for a cold fetch (~1.4s), short enough that a
 * dead network still answers the tap.
 */
const CLIP_WAIT_MS = 2500;

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

/**
 * The level a tier's picker should land on: TOCFL 1 when that tier has it,
 * else its lowest allowed level, else `null` for a tier with no level choice
 * at all (guest). Written as "prefer 1, else the lowest" rather than hardcoding
 * 1 so a future tier whose access starts higher still gets a sane default
 * instead of a level it cannot open.
 */
function defaultLevels(levels: TocflLevel[] | null): TocflLevel[] {
  if (levels === null || levels.length === 0) return [];
  return [levels.includes(1) ? 1 : [...levels].sort((a, b) => a - b)[0]];
}

interface Props {
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
  /** Called when a guest taps a locked tone row/pill or a locked word chip. */
  onLocked?: (feature: string) => void;
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
export function Visualiser({ settings, canvasWidth, canvasHeight, onLocked }: Props) {
  const tier = useTier();
  const limits = tierLimits()[tier];
  // The recording style the visualiser plays, draws and scores in (spec
  // decision 9). A guest is always textbook. Words with no natural take drop
  // out of the rail, as they do from a natural run's pool.
  //
  // The toggle on this screen overrides it for this visit only: it is never
  // written to settings, so leaving the visualiser restores the saved choice.
  // A guest cannot switch (always Slow), same as in Settings.
  const [styleOverride, setStyleOverride] = useState<SpeechStyle | null>(null);
  const speechStyle: SpeechStyle =
    tier === "guest" ? "textbook" : (styleOverride ?? effectiveSpeechStyle(tier));
  const speechStyleRef = useRef(speechStyle);
  speechStyleRef.current = speechStyle;
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
  const [tone, setTone] = useState<Tone | null>(null);
  /**
   * The tone pair being practised, e.g. [3, 2]. Exclusive with `tone`: picking
   * one clears the other.
   */
  const [combo, setCombo] = useState<Tone[] | null>(null);
  const [words, setWords] = useState<Word[]>(() => inventoryNow() ?? []);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [paused, setPaused] = useState(false);
  /** Mobile only — the collapsed tone-mark icon opens this to pick a tone. */
  const [tonePopoverOpen, setTonePopoverOpen] = useState(false);
  const [popoverTab, setPopoverTab] = useState<"free" | "tone" | "pairs">("free");
  /**
   * Desktop only: once a tone or pair is picked, its tab's grid folds away so
   * the word list below gets the room. Tapping the tab again unfolds it. (The
   * mobile popover closes on a pick instead, so it always opens unfolded.)
   */
  const [pickerFolded, setPickerFolded] = useState(false);
  /**
   * The visualiser only ever practices single-syllable words, so it reads
   * `beginner`'s access — a guest's is always `null` (no picker; the
   * existing `wordsPerTone: 0` cap already empties the practice list, this
   * just avoids offering a choice that changes nothing for guest).
   *
   * Defaults to a real level (TOCFL 1) for any tier that HAS a level choice,
   * rather than to `null`. `null` means "no list scoping", which resolves to
   * every level the tier allows at once — a reasonable neutral state, but not
   * a useful landing state for a practice screen: the player arrives with the
   * whole catalog shuffled together and nothing indicating the lists exist.
   * Several lists can be selected at once; their words are unioned. An empty
   * selection (every row toggled off) falls back to every level the tier
   * allows, the old `null` state.
   */
  const [selectedLevels, setSelectedLevels] = useState<TocflLevel[]>(
    () => defaultLevels(tierLimits()[tier].beginner.levels),
  );
  /**
   * Whether the default above has been applied for a tier whose levels were
   * actually known.
   *
   * `tier` resolves asynchronously and the store's default is `"guest"`, whose
   * `levels` is `null` — so on a cold load the initializer above legitimately
   * answers `null` and the real answer arrives a moment later. This applies it
   * once, when levels first exist, and never again, so a player who
   * deliberately cleared the selection does not have it re-imposed on the next
   * render or a later tier refresh.
   */
  const leveledRef = useRef(false);
  useEffect(() => {
    if (leveledRef.current) return;
    const levels = limits.beginner.levels;
    if (levels === null) return;
    leveledRef.current = true;
    setSelectedLevels(defaultLevels(levels));
  }, [limits.beginner.levels]);
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
  /** Pending timers for the iOS loud-cue dance, cleared on unmount. */
  const cueTimersRef = useRef<Set<number>>(new Set());
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
   * Session-summary accounting for the gameplay-tier `visualiser_session`
   * event, flushed on unmount (see the mount/unmount effect below). Refs, not
   * state — nothing here should trigger a re-render.
   */
  const sessionStartRef = useRef<number | null>(null);
  const sessionAttemptsRef = useRef(0);
  const sessionTonesRef = useRef<Set<Tone>>(new Set());
  const sessionWordSelectedRef = useRef(false);
  useEffect(() => {
    sessionStartRef.current = performance.now();
    return () => {
      const started = sessionStartRef.current ?? performance.now();
      track({
        type: "visualiser_session",
        toneCount: sessionTonesRef.current.size,
        wordSelected: sessionWordSelectedRef.current,
        durationMs: Math.round(performance.now() - started),
        attempts: sessionAttemptsRef.current,
        speechStyle: speechStyleRef.current,
      });
    };
  }, []);
  /**
   * Bumped on every wrong-tone attempt — used as the recognized-tone card's
   * `key`, so React remounts it and its CSS shake animation restarts, the
   * same brief jolt the game gives the bird on a wall collision (see
   * `SHAKE_MS`/`SHAKE_PX` in `render/world.ts`).
   */
  const [shakeSeq, setShakeSeq] = useState(0);
  /**
   * Set (to a fresh value, not just `true`) on every wrong attempt and
   * cleared after `WRONG_TOAST_MS` — the "wrong tone" toast's own mount
   * key, so two wrong attempts in a row each get their own fade-in rather
   * than the second being a no-op update to an already-true boolean.
   * Mirrors Game.tsx's `flash`/`TOAST_MS` pattern.
   */
  const [wrongToast, setWrongToast] = useState<number | null>(null);
  useEffect(() => {
    if (wrongToast === null) return;
    const id = setTimeout(() => setWrongToast(null), WRONG_TOAST_MS);
    return () => clearTimeout(id);
  }, [wrongToast]);
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
      void ensurePlaybackCtx(); // resume cue-playback ctx in-gesture (reference.ts)
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

  /**
   * Follow the live inventory, rather than fetching once if it happens to be
   * empty.
   *
   * `inventoryNow()` is now seeded synchronously from the bundled fallback
   * (see `audio/inventory.ts`), so it is never empty — and the old
   * `if (words.length > 0) return` guard would therefore have stopped this
   * screen from ever picking up the live catalog. Subscribing is the shape
   * `Settings.tsx` already uses, and it also means a mid-session voice switch
   * reaches the word rail.
   */
  useEffect(() => {
    const off = subscribeInventory(setWords);
    void loadInventory();
    return off;
  }, []);

  /**
   * The active TOCFL level narrows the practice pool BEFORE the per-tone
   * count cap — a separate gate from `wordsPerTone` (below), same
   * relationship `min_tier`/`wordsPerTone` already have: this decides which
   * words are even in play, the count decides how many of them. Guest's
   * `beginner.levels` is always `null` (no list scoping — its `wordsPerTone:
   * 0` already empties the list regardless), so this is a no-op for guest.
   */
  // Memoized, not recomputed inline: this array is the preload effect's
  // dependency, and a fresh identity every render made that effect re-run on
  // every render — harmless only because `loadClip` dedupes, and actively
  // wrong once the effect owns an AbortController it would tear down each time.
  const listWords = useMemo(
    () =>
      wordsInStyle(
        limits.beginner.levels === null
          ? words
          : wordsForList(
              words,
              selectedLevels.length > 0 ? selectedLevels : limits.beginner.levels,
              "beginner",
            ),
        speechStyle,
      ),
    [words, limits.beginner.levels, selectedLevels, speechStyle],
  );

  /**
   * Two-syllable words for the "Tone pairs" tab. Not scoped by the word lists
   * (those are single-syllable TOCFL lists); capped per combo by
   * `pairWordsPerCombo`, the same cap the pairs run mode uses.
   */
  const pairWords = useMemo(() => wordsInStyle(multiWords(words), speechStyle), [words, speechStyle]);
  const combos = useMemo(() => availableToneCombos(pairWords), [pairWords]);
  const pairsUnlocked = limits.pairWordsPerCombo > 0;

  /**
   * Warm the selected tone's clips so a tap plays instantly.
   *
   * Still the WHOLE tone list, deliberately — on-demand fetching would put a
   * ~200ms (warm) to ~1.4s (cold) wait in front of a tap, which is the one
   * thing this screen cannot have. What changed is the rate and the
   * cancellation, not the coverage: these go in at `"soon"`, so
   * `audio/clipQueue.ts` trickles them instead of firing one request per word
   * at once, and the `AbortController` drops the previous tone's outstanding
   * warm-up when the player switches tabs. Rapidly tabbing through all four
   * tones used to queue 120+ requests in a few seconds and trip the Worker's
   * rate limit; now each switch cancels the last.
   *
   * A tap still jumps the queue — `playWord` calls `loadClip` at the default
   * `"now"` priority.
   */
  useEffect(() => {
    if (tone === null && combo === null) return;
    const controller = new AbortController();
    const pool =
      combo !== null
        ? wordsOfCombo(pairWords, combo, limits.pairWordsPerCombo)
        : wordsOfTone(listWords, tone!, limits.wordsPerTone);
    for (const w of pool) {
      void loadClip(w, { priority: "soon", signal: controller.signal });
    }
    return () => controller.abort();
  }, [tone, combo, listWords, pairWords, limits.wordsPerTone, limits.pairWordsPerCombo]);

  /**
   * The practice list is limited by COUNT, not by `min_tier`.
   *
   * The two gates mean different things: `min_tier` is game access (enforced
   * at the clip route and in the run's pool — see `Game.tsx`), while
   * `TIER_LIMITS[tier].wordsPerTone` is how deep this tier may practise per
   * tone here. Filtering by both would tangle them; the count alone is what
   * keeps a guest's practice list empty (`wordsPerTone: 0`) and a free
   * account's at five, in `position` order.
   */
  const wordsForTone =
    combo !== null
      ? wordsOfCombo(pairWords, combo, limits.pairWordsPerCombo)
      : tone === null
        ? []
        : wordsOfTone(listWords, tone, limits.wordsPerTone);
  /** The rest of that tone's (or pair's) inventory, shown as locked chips for free players. */
  const lockedWordsForTone =
    combo !== null
      ? wordsOfCombo(pairWords, combo).slice(wordsForTone.length)
      : tone === null
        ? []
        : wordsOfTone(listWords, tone).slice(wordsForTone.length);
  /** Something is picked — a tone or a pair — so the word rail has content. */
  const filtering = tone !== null || combo !== null;

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
    // The player's tone lines this session (spec B, Pro only), sent in one
    // batch when the session ends or the tab is hidden — whichever is first.
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
    // Measures the room in the first quiet moments after the mic opens (the
    // warm-up hold in a run, before the first tap in the Visualiser) instead
    // of trusting the floor saved at calibration — src/pitch/noiseMeter.ts.
    const measureNoise = sessionNoiseMeter(settings.voiceRms);
    const onFrame = (frame: Float32Array, sampleRate: number) => {
      // Deaf while the example plays — otherwise the game's own voice is drawn
      // as the player's contour.
      if (isCueAudible()) return;
      if (!tracker) {
        tracker = new PitchTracker({
          sampleRate,
          f0Center: settings.f0Center,
          // The saved calibration floor, capped, until this session's own
          // measurement of the room lands (`measureNoise` below).
          noiseFloor: startingNoiseFloor(settings.noiseFloor, settings.voiceRms),
          minVoicedRun: tuning().minVoicedRun,
          rangeSemitones: settings.rangeSemitones,
          rangeDownSemitones: settings.rangeDownSemitones,
        });
      }
      const measured = measureNoise(frame, sampleRate);
      if (measured !== null) tracker.setNoiseFloor(measured);
      const p = tracker.push(frame);
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
      // A tone pair holds through the pause between its two syllables, as a
      // pair gate does in play (`multiMergeGapMs`): the recorder keeps one
      // utterance open across the gap, and the dot holds its last height
      // instead of falling back to the rest line.
      const pair = (wordRef.current?.syllables ?? 1) > 1;
      const gapMs = pair ? tuning().multiMergeGapMs : tuning().mergeGapMs;
      recorder.setMergeGapMs(gapMs);
      const holding = pair && head !== undefined && now - lastVoicedAt <= gapMs;
      // Between utterances the dot returns to the rest line, as it does in
      // play — but nothing drifts *while* you are speaking.
      const target = head && (voiced || holding) ? head.chao : 3;
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
        // Tone accuracy — the same timing-free measure the game logs per gate,
        // but judged against THIS word's own recorded contour (the line on
        // screen), not the tone's average. `latest` is already one utterance
        // (the recorder merges short gaps), time-zeroed.
        const accuracy =
          toneAccuracyDetail(latest.points, word.tones, referenceFromWord(word), word.clipStyle ?? "textbook")?.accuracy ?? null;
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
      // Single-syllable only: the classifier misreads a two-syllable contour
      // (same rule as the pairs run mode), so a pair word gets no read.
      if (
        latest &&
        latest.startedAtMs !== lastRecognizedAtRef.current &&
        (word?.syllables ?? 1) === 1
      ) {
        lastRecognizedAtRef.current = latest.startedAtMs;
        const result = classifyToneV2(latest);
        sessionAttemptsRef.current += 1;
        // Dev only: keep every attempt for offline classifier tests. In the
        // console: copy(JSON.stringify(window.__toneLog)).
        if (import.meta.env.DEV) {
          const w = window as unknown as { __toneLog?: unknown[] };
          (w.__toneLog ??= []).push({
            target: toneRef.current,
            word: wordRef.current?.id ?? null,
            points: latest.points.map((p) => [Math.round(p.tMs), Math.round(p.chao * 1000) / 1000]),
            read: result,
          });
        }
        setRecognized(result);
        // Bumps a remount key (see recognizedReadout) rather than a plain
        // boolean — the card has to shake again for a second wrong attempt
        // in a row, and a boolean that's already true wouldn't re-trigger
        // the CSS animation on an unchanged value.
        if (result && recognizedTier(toneRef.current, result) === "bad") {
          setShakeSeq((n) => n + 1);
          setWrongToast(now);
        }
      }

      drawVisualiser(ctx, canvasW, canvasH, {
        // A pair has no generic per-tone shape to fall back on: draw its
        // target only once a word is picked (then `word`'s own line is used).
        tone: word ? word.tone : toneRef.current,
        word,
        live,
        finished,
        spanMs: SPAN_MS,
        chao: displayChao,
        voiced: voiced || holding || now - lastVoicedAt <= tuning().graceMs,
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
      frameSinkRef.current = null;
    };
  }, [settings, canvasW, canvasH]);

  // Clean up the loud-cue dance on unmount: drop pending timers, and if we left
  // mid-cue with the mic released, restore the shared stream so the next screen
  // isn't deaf (same guard as Game.tsx).
  useEffect(() => {
    const timers = cueTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      const s = getMicSession();
      if (s && !s.hasStream()) void acquireMicStream();
    };
  }, []);

  const chooseTone = (t: Tone | null) => {
    if (t !== null && !limits.visualiserPerTone) {
      showLocked("visualiser-tone-practice");
      return;
    }
    if (t !== null) sessionTonesRef.current.add(t);
    setPickerFolded(t !== null);
    setTone(t);
    setCombo(null);
    setSelectedWord(null);
    resetAttempts();
    setTonePopoverOpen(false);
  };

  /** The Free tab: no target, no word — say anything and see its shape. */
  const chooseFree = () => {
    setPopoverTab("free");
    if (tone === null && combo === null) return;
    setTone(null);
    setCombo(null);
    setSelectedWord(null);
    resetAttempts();
  };

  const chooseCombo = (c: Tone[]) => {
    if (!pairsUnlocked) {
      showLocked("visualiser-tone-pairs");
      return;
    }
    setPickerFolded(true);
    setCombo(c);
    setTone(null);
    setSelectedWord(null);
    resetAttempts();
    setTonePopoverOpen(false);
  };

  /**
   * Hand a locked tap to the host's upsell.
   *
   * Closes the tone/word-list popover first: on mobile these rows live inside
   * it, and leaving it open would put the upsell modal up behind a sheet the
   * player then has to dismiss separately. `chooseTone` already closes it for
   * the same reason.
   */
  const showLocked = (feature: string) => {
    setTonePopoverOpen(false);
    onLocked?.(feature);
  };

  /** Bumped on every word tap, so a slow clip load cannot play over a newer tap. */
  const tapSeqRef = useRef(0);

  const playWord = (word: Word) => {
    // A tap on the already-selected word is a replay, not a new attempt at a
    // new word — the trail and the running accuracy must survive it.
    if (selectedWord?.id !== word.id) resetAttempts();
    sessionWordSelectedRef.current = true;
    setSelectedWord(word);
    // Resume the output context inside the tap: the play below may run after
    // an await, and iOS only allows a resume from a gesture.
    void ensurePlaybackCtx();
    const seq = ++tapSeqRef.current;
    // Jumps the warm-up queue: the tapped word is needed now, whatever the
    // background trickle is currently working through. Wait for it (up to
    // CLIP_WAIT_MS) so a word the warm-up has not reached yet plays its real
    // clip, not the synthetic sweep. A clip that is already loaded resolves
    // at once.
    const ready = Promise.race([
      loadClip(word).catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, CLIP_WAIT_MS)),
    ]);
    void ready.then(() => {
      // A newer tap supersedes this one.
      if (seq === tapSeqRef.current) startCue(word);
    });
  };

  const startCue = (word: Word) => {
    const play = () =>
      // Plays on the dedicated output-only context (reference.ts).
      playToneCue(
        word.tone,
        settings.f0Center,
        settings.rangeSemitones,
        word,
        settings.rangeDownSemitones,
      );
    if (isIOS() && !isChromeIOS()) {
      // Loud-speaker dance (Safari/PWA), same as the game: release the mic so
      // output routes to the speaker, wait out the route cling, play, then
      // re-acquire. The visualiser ignores mic frames while the cue is audible
      // (isCueAudible), so releasing costs nothing here. Chrome/Firefox iOS
      // take the plain branch (legacy path — quieter but stable).
      const timers = cueTimersRef.current;
      // A new tap supersedes any dance still pending from a previous one — clear
      // its timers so two cues can't overlap and a stale re-acquire can't clear
      // cueReleaseActive while this cue is still playing.
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      releaseMicStream();
      const t1 = window.setTimeout(() => {
        timers.delete(t1);
        play();
        const t2 = window.setTimeout(() => {
          timers.delete(t2);
          void acquireMicStream();
        }, word.clipS * 1000);
        timers.add(t2);
      }, tuning().cueReleaseMs);
      timers.add(t1);
    } else {
      play();
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
      <span className="vis-accuracy-label">tone accuracy</span>
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
      key={shakeSeq}
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
      {/* Always in the tree (not conditionally rendered) so this row's space
          is permanently reserved on desktop, where it renders inline inside
          the card — a min-height guess at "how tall with the toast" kept
          being wrong and the card visibly resized anyway. `visibility`
          rather than `display` so an invisible copy still occupies layout;
          `key` still forces a remount so the fade replays on every wrong
          attempt, including two in a row. */}
      <span
        key={wrongToast ?? "idle"}
        className={wrongToast !== null ? "vis-wrong-toast is-shown" : "vis-wrong-toast"}
      >
        wrong tone
      </span>
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

  /** Ghost chip standing in for a word behind the free word-count limit. */
  const lockedWordChip = (w: Word) => (
    <button
      key={w.id}
      className="choice-option word-chip is-locked"
      onClick={() => showLocked("visualiser-word-list")}
      aria-label={`${w.hanzi}, locked, Pro`}
    >
      <span className="word-chip-hanzi">{w.hanzi}</span>
      <span className="word-chip-lock">🔒</span>
    </button>
  );

  /** Tab strip — shared by mobile popover and desktop panel. */
  const tonePickerFree = (
    <p className="vis-free-desc">
      Say anything and see the shape of your voice. There is no target line and no word to copy.
    </p>
  );

  /** One sentence under the tabs, saying what the open tab is for. */
  const PRACTICE_DESC: Record<typeof popoverTab, string> = {
    free: "Practice freely, by single tone, or by tone pair.",
    tone: "Pick a tone, then tap a word to hear it and say it back.",
    pairs: "Pick a two-syllable combination. Rows are the first tone, columns the second.",
  };

  const practiceHead = (
    <div className="vis-practice-head">
      <span className="vis-setting-label">Practice</span>
      <p className="vis-setting-desc">
        {pickerFolded && popoverTab !== "free"
          ? `Tap ${popoverTab === "pairs" ? "Tone pairs" : "By tone"} to pick another.`
          : PRACTICE_DESC[popoverTab]}
      </p>
    </div>
  );

  const tonePickerTabs = (
    <div className="tone-popover-tabs">
      {/* Free is a mode of its own, open to every tier; picking its tab is
          picking it. By tone and Tone pairs are gated per tier, shown with a
          lock where the tier cannot use them. */}
      <button
        className={popoverTab === "free" ? "tone-popover-tab active" : "tone-popover-tab"}
        onClick={chooseFree}
      >
        Free
      </button>
      <button
        className={popoverTab === "tone" ? "tone-popover-tab active" : "tone-popover-tab"}
        onClick={() => {
          setPopoverTab("tone");
          setPickerFolded(false);
        }}
      >
        By tone{!limits.visualiserPerTone && " 🔒"}
        {tone !== null && (
          <ToneMarkIcon tone={tone} className="tone-mark-icon vis-tab-pick" />
        )}
      </button>
      {combos.length > 0 && (
        <button
          className={popoverTab === "pairs" ? "tone-popover-tab active" : "tone-popover-tab"}
          onClick={() => {
            setPopoverTab("pairs");
            setPickerFolded(false);
          }}
        >
          Tone pairs{!pairsUnlocked && " 🔒"}
          {combo?.map((t, i) => (
            <ToneMarkIcon key={i} tone={t as ToneOrNeutral} className="tone-mark-icon vis-tab-pick" />
          ))}
        </button>
      )}
    </div>
  );

  const LEVEL_LABEL: Record<TocflLevel, string> = { 1: "TOCFL 1", 2: "TOCFL 2", 3: "TOCFL 3" };

  const selectedListsLabel =
    selectedLevels.length === 0 ? "All levels" : selectedLevels.map((n) => LEVEL_LABEL[n]).join(", ");

  /**
   * Word lists — a setting above the tone/pair tabs, not a tab of its own, so
   * the active lists are always in view. Several can be on at once; none on
   * means every level the tier allows.
   */
  const wordListSetting = (
    <div className="vis-setting">
      <div className="vis-setting-head">
        <span className="vis-setting-label">Word lists</span>
        {limits.beginner.levels !== null && (
          <span className="vis-setting-value">{selectedListsLabel}</span>
        )}
      </div>
      <p className="vis-setting-desc">Choose which lists your practice words come from. You can pick more than one.</p>
      <div className="vis-setting-chips">
        {limits.beginner.levels === null ? (
          // Guest: locked, and leads to the same upsell as a locked level.
          <button
            type="button"
            className="vis-setting-chip is-locked"
            onClick={() => showLocked("visualiser-word-list")}
            aria-label="TOCFL levels, locked, sign up free"
          >
            TOCFL levels 🔒
          </button>
        ) : (
          ([1, 2, 3] as const).map((n) => {
            const unlocked = limits.beginner.levels!.includes(n);
            const on = selectedLevels.includes(n);
            return (
              <button
                key={n}
                type="button"
                // Not `disabled` when locked: the tap must reach the upsell.
                className={`vis-setting-chip${on ? " active" : ""}${unlocked ? "" : " is-locked"}`}
                onClick={() => {
                  if (!unlocked) {
                    showLocked("visualiser-word-list");
                    return;
                  }
                  setSelectedLevels((cur) =>
                    cur.includes(n) ? cur.filter((l) => l !== n) : [...cur, n].sort((a, b) => a - b),
                  );
                }}
                aria-pressed={unlocked ? on : undefined}
                aria-label={unlocked ? LEVEL_LABEL[n] : `${LEVEL_LABEL[n]}, locked, Pro`}
              >
                {LEVEL_LABEL[n]}
                {!unlocked && " 🔒"}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  /** Mobile popover — stacked rows with labels. */
  const tonePickerToneList = (
    <div className="tone-popover-list">
      {TONES.map((t) => (
        <button
          key={t}
          className={
            tone === t
              ? "tone-popover-row active"
              : !limits.visualiserPerTone
                ? "tone-popover-row is-locked"
                : "tone-popover-row"
          }
          onClick={() => chooseTone(t)}
        >
          <span className="tone-popover-row-icon">
            <ToneMarkIcon tone={t} className="tone-mark-icon" />
          </span>
          Tone {t} · {TONE_SHORT_LABEL[t]}
          {!limits.visualiserPerTone && <span className="pro-badge">🔒 Pro</span>}
        </button>
      ))}
    </div>
  );

  /** Desktop panel — one horizontal row of round pills. */
  const tonePickerTonePills = (
    <div className="tone-rail-pills">
      {TONES.map((t) => (
        <button
          key={t}
          className={
            tone === t
              ? "choice-option tone-pill active"
              : !limits.visualiserPerTone
                ? "choice-option tone-pill is-locked"
                : "choice-option tone-pill"
          }
          onClick={() => chooseTone(t)}
          aria-label={`Tone ${t}, ${TONE_SHORT_LABEL[t]}${!limits.visualiserPerTone ? ", locked, Pro" : ""}`}
        >
          <ToneMarkIcon tone={t} className="tone-mark-icon" />
          {!limits.visualiserPerTone && <span className="tone-pill-lock">🔒</span>}
        </button>
      ))}
    </div>
  );

  /**
   * Which recording style the clips, lines and scores use — set in Settings,
   * read through `effectiveSpeechStyle` (a guest is always Slow).
   */
  const chooseSpeechStyle = (style: SpeechStyle) => {
    if (tier === "guest") {
      showLocked("visualiser-speech-style");
      return;
    }
    if (style === speechStyle) return;
    setStyleOverride(style);
    // The selected word's clip and line belong to the old style.
    setSelectedWord(null);
    resetAttempts();
  };

  /** Speech style for this visit only — never written to Settings. */
  const speechStyleSetting = (
    <div className="vis-setting">
      <div className="vis-setting-head">
        <span className="vis-setting-label">Speech</span>
      </div>
      <p className="vis-setting-desc">
        Slow is clear and exaggerated. Regular is everyday speed. This only changes the visualiser.
      </p>
      <div className="vis-setting-chips" role="radiogroup" aria-label="Speech style">
        {(["textbook", "natural"] as const).map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={speechStyle === style}
            className={`vis-setting-chip${speechStyle === style ? " active" : ""}${
              tier === "guest" && style === "natural" ? " is-locked" : ""
            }`}
            onClick={() => chooseSpeechStyle(style)}
          >
            {SPEECH_STYLE_LABEL[style]}
            {tier === "guest" && style === "natural" && " 🔒"}
          </button>
        ))}
      </div>
    </div>
  );

  /**
   * Same icons as Modes → Tone pairs, laid out as a fixed 4×5 table: the row
   * is the first syllable's tone (1–4), the column the second's (1–4, then
   * neutral). Every combo keeps the same place whatever the inventory holds,
   * so a pair is found by position; a combo with no word is an empty cell.
   */
  const comboByKey = new Map(combos.map((c) => [toneComboKey(c), c]));
  const tonePickerPairs = (
    <div className="vis-pair-grid">
      {TONES.flatMap((first) =>
        ([1, 2, 3, 4, 0] as const).map((second) => {
          const key = `${first}-${second}`;
          const c = comboByKey.get(key);
          if (!c) return <span key={key} className="vis-pair-empty" aria-hidden="true" />;
          const active = combo !== null && toneComboKey(combo) === key;
          return (
            <button
              key={key}
              type="button"
              className={`choice-option vis-pair-tile${active ? " active" : ""}${pairsUnlocked ? "" : " is-locked"}`}
              onClick={() => chooseCombo(c)}
              aria-label={`Tone ${first} then ${second === 0 ? "neutral" : `tone ${second}`}${pairsUnlocked ? "" : ", locked"}`}
            >
              {c.map((t, n) => (
                <ToneMarkIcon key={n} tone={t as ToneOrNeutral} className="tone-mark-icon" />
              ))}
              {!pairsUnlocked && <span className="tone-pill-lock">🔒</span>}
            </button>
          );
        }),
      )}
    </div>
  );

  const pickerSettings = (
    <div className="vis-settings">
      {wordListSetting}
      {speechStyleSetting}
    </div>
  );

  const mobileTonePickerPanel = (
    <>
      {pickerSettings}
      {practiceHead}
      {tonePickerTabs}
      {popoverTab === "free"
        ? tonePickerFree
        : popoverTab === "pairs" && combos.length > 0
          ? tonePickerPairs
          : tonePickerToneList}
    </>
  );

  const desktopTonePickerPanel = (
    <>
      {pickerSettings}
      {practiceHead}
      {tonePickerTabs}
      {popoverTab === "free"
        ? tonePickerFree
        : pickerFolded
          ? null
          : popoverTab === "pairs" && combos.length > 0
            ? tonePickerPairs
            : tonePickerTonePills}
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
        <div className={filtering ? "vis-side-panel" : "vis-side-panel is-free"}>
          <div className="vis-filter-group">
            <button
              className="vis-filter-btn"
              onClick={() => setTonePopoverOpen((v) => !v)}
              aria-label="Filter words"
              aria-expanded={tonePopoverOpen}
            >
              {combo !== null ? (
                combo.map((t, i) => (
                  <ToneMarkIcon key={i} tone={t as ToneOrNeutral} className="tone-mark-icon" />
                ))
              ) : tone === null ? (
                <TonesGridIcon className="vis-filter-icon" />
              ) : (
                <ToneMarkIcon tone={tone} className="tone-mark-icon" />
              )}
              <ChevronIcon open={tonePopoverOpen} className="vis-filter-chevron" />
            </button>
          </div>

          <div className="word-rail-wrap">
            {filtering ? (
              <div className="word-rail">
                {wordsForTone.map(wordChip)}
                {lockedWordsForTone.map(lockedWordChip)}
              </div>
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

          {filtering && (
            <div className="word-strip">
              {wordsForTone.map(wordChip)}
              {lockedWordsForTone.map(lockedWordChip)}
            </div>
          )}
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
