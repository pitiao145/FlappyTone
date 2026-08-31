import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { track } from "../analytics/client.ts";
import { gateEvent, type RunEndReason } from "../analytics/session.ts";
import {
  cueDurationMsFor,
  isCueAudible,
  loadClip,
  playToneCue,
} from "../audio/reference.ts";
import { inventoryNow, loadInventory } from "../audio/inventory.ts";
import { getMicSession, setFrameSink, stopMic } from "../audio/session.ts";
import { acquireWakeLock, releaseWakeLock } from "../audio/wakeLock.ts";
import { GATE_LOG_ENABLED, saveGateLog } from "../dev/gateLog.ts";
import { publishState, setActiveTracker } from "../game/activeTracker.ts";
import { TONE_INFO, type Tone } from "../game/gates.ts";
import { CALIBRATION_TONES, Run, type RunMode, type RunSnapshot } from "../game/run.ts";
import type { Word } from "../game/words.ts";
import type { GateOutcome, UnheardHint } from "../game/scoring.ts";
import type { ClassifiedTone } from "../game/toneClassifier.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadNoticeSeen,
  loadShowTranslation,
  saveNoticeSeen,
  type CalibrationSettings,
} from "../game/settings.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawWorld, refreshMotionPreference } from "../render/world.ts";
import { JumpingPip } from "./bird/index.ts";
import { HeartIcon, PauseIcon } from "./icons.tsx";
import { PauseMenu } from "./PauseMenu.tsx";

/** HUD refresh rate. React never renders per frame — the rAF loop owns the canvas. */
const HUD_HZ = 4;
/** "Your turn" flashes while the active gate is in its first stretch. */
const YOUR_TURN_MAX_T = 0.5;
/** How long the "couldn't hear that" toast stays up. */
const TOAST_MS = 1200;
/**
 * The walkthrough's "listen" card holds the world this much longer after
 * "Continue" is tapped, before the demo actually plays — a beat so the demo
 * doesn't fire in the exact instant of the tap.
 */
const WALKTHROUGH_DEMO_DELAY_MS = 500;

/** What the HUD reacts to when a gate resolves. */
interface OutcomeFlash {
  outcome: GateOutcome;
  points: number;
  hint: UnheardHint | null;
  /** The gate's own target tone — needed to phrase "not a T{tone}" on a confident mismatch. */
  tone: Tone;
  /** Set when this collision was forced by a drastic classifier mismatch, not a wall. */
  mismatchedAs: ClassifiedTone | null;
  /** The classifier's confidence in `mismatchedAs` — picks the mismatch toast's wording. */
  mismatchedConfidence: number | null;
  /** The classifier's read of this gate, correct or not — praises a confident correct one. */
  classifiedTone: ClassifiedTone | null;
  /** The classifier's confidence in `classifiedTone`. */
  classifiedConfidence: number | null;
  /** Resolve time, used as a React key so repeats re-trigger the animation. */
  atMs: number;
}

/**
 * The confidence bar both classifier-driven toasts key off: below it, the
 * mismatch toast hedges ("that sounded more like a T3") and a correct read
 * says nothing; at or above it, the mismatch toast states the read plainly
 * ("that was a T3, not a T2") and a correct read gets praised ("nice T1!").
 * Matches the confidence bar the player asked for when this shipped
 * (25 Aug 2026): "if a player does a tone 100% accurately... let's say 90+%
 * confidence." Same cutoff `toneClassifierBoostMinConfidence` defaults to,
 * so "confident enough to say something" means the same thing everywhere;
 * kept as its own literal rather than importing the tuning default so
 * retuning the score boost in the Lab doesn't silently reword these toasts
 * too.
 */
const HIGH_CLASSIFIER_CONFIDENCE = 0.9;

/**
 * The hint shown when a gate goes unheard.
 *
 * PRD §6: this is the path where the app says it is unsure rather than scoring
 * the player wrong, and it must never read as a punishment. Saying *what* was
 * unclear turns the one moment of doubt into the one moment that teaches.
 */
const HINT_TEXT: Record<UnheardHint, string> = {
  louder: "say it a bit louder",
  longer: "hold it a little longer",
  generic: "didn't catch that",
};

/** Only the last few gates fit on screen; the full log lives on the end screen. */
const GATE_LOG_ON_SCREEN = 4;

/**
 * The tutorial's guided walkthrough, shown around gate 1 of every tutorial
 * run. `null` means no walkthrough card is showing — either it's not the
 * tutorial, or the player has stepped through it. See the run-owning
 * effect's `tick()` for how each step is detected.
 */
type WalkthroughStep = "intro" | "listen" | "menu" | null;

interface Props {
  mode: RunMode;
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
  onOver: (snapshot: RunSnapshot) => void;
  /** Called on a manual quit (pause menu) or the tab going away mid-run.
   * `snap` is the run's state at the moment of quitting, or null if no run
   * had started yet — the caller decides whether/how to record a partial
   * attempt; `onOver` is never called for this path. */
  onQuit: (snap: RunSnapshot | null) => void;
  /** The word `mode: "single"` flies. Ignored otherwise. */
  singleWord?: Word;
  /** The fixed tone `mode: "drill"` flies every gate from. Ignored otherwise. */
  drillTone?: Tone;
  /**
   * Set when this tutorial run is the calibration flight (GameApp routes to
   * it straight from the calibration screen). Flies only the grid-anchoring
   * tones (`CALIBRATION_TONES`) instead of the full teaching set — see the
   * run-owning effect's `tutorialTones`. Also skips the guided walkthrough
   * (see `WalkthroughStep`) and begins immediately: it's a range-measuring
   * flight, not a teaching moment the player chose, and its gesture already
   * happened on the calibration screen's "Let's go". GameApp offers a
   * separate way into a real, walkthrough-guided tutorial afterward.
   * Ignored outside tutorial mode.
   */
  autoStart?: boolean;
  /** This session's run count, this one included. Shown in the pause menu; ignored in the tutorial. */
  runNumber?: number;
  /**
   * True while GameApp is showing another nav tab over a still-alive run —
   * see `GameHandle`. A plain `display: none` on the existing root element
   * rather than an extra wrapper div, since App.css's desktop layout targets
   * `.frame > .game-screen` directly (`:has(.game-stage) > .game-screen`);
   * wrapping it would silently break that flex sizing.
   */
  hidden?: boolean;
}

/**
 * Imperative escape hatch for GameApp: when the player switches to another
 * nav tab (Visualiser, Progress, Profile, Settings) mid-run, GameApp keeps
 * this component mounted — just hidden — instead of unmounting it, so the
 * `Run` instance survives. `pause()` lets it do the same freeze a tab going
 * to the background already does (stop the rAF loop, suspend the
 * AudioContext) before it hides the canvas, rather than leaving a hidden run
 * ticking away and eating gates/hearts nobody can see.
 */
export interface GameHandle {
  pause: () => void;
}

export const Game = forwardRef<GameHandle, Props>(function Game({
  mode,
  settings,
  canvasWidth,
  canvasHeight,
  onOver,
  onQuit,
  singleWord,
  drillTone,
  runNumber,
  autoStart = false,
  hidden,
}: Props, ref) {
  // "game", "drill" and "learn" all fly full hearts/score/combo, unlike
  // "tutorial" and "single" — the HUD elements gated on this once read
  // `mode === "game"` alone, back when "game" was the only scored mode.
  const scored = mode === "game" || mode === "drill" || mode === "learn";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * Latest `canvasHeight`, read by the run-owning effect's tick loop without
   * being one of its dependencies — see the effect's own comment below for
   * why. Mobile browsers routinely fire a resize (their chrome bar showing
   * or hiding) purely from switching tabs and back, with no real layout
   * change the player asked for; height is otherwise harmless to rebuild on
   * since `Run` itself never reads it (see game/run.ts: positions are chao/
   * width-based, never height-based). Kept current on every render.
   */
  const canvasHeightRef = useRef(canvasHeight);
  canvasHeightRef.current = canvasHeight;
  const [hud, setHud] = useState<RunSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * Whether the paused menu shows the game options.
   *
   * The options were only ever reachable by pausing, and the 7 Aug sessions
   * show nobody found them — every run reported the default speed, width and
   * cue. "Pause" does not promise settings, so the gear says it instead, and
   * a plain pause still offers a way in.
   */
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Read once on mount and then owned by React, so the pause menu's toggle
  // reaches the HUD without a re-run. Unlike speed and width, this changes no
  // geometry, so applying it mid-gate is safe.
  const [showTranslation, setShowTranslation] = useState(loadShowTranslation);
  /**
   * The tutorial's guided walkthrough — see `WalkthroughStep`. Starts at
   * "intro" for every *deliberately started* tutorial run (also reset to
   * "intro" inside the run-owning effect on every fresh `Run`, so a
   * pause-menu Restart replays it too) and steps forward as the player
   * dismisses each card. The first card's button doubles as the user
   * gesture that starts the run — the iOS-safe place to resume the
   * AudioContext, same reason the old single intro card worked.
   *
   * Not shown when `autoStart` is set — that's the short range-measuring
   * flight GameApp routes straight into right after calibration, not a
   * teaching moment the player chose. It stays exactly what it was before
   * the walkthrough existed: a handful of gates flown immediately, no
   * cards. GameApp now offers a separate button, after that flight, into a
   * real (walkthrough-guided) tutorial for players who want one.
   */
  const [walkthroughStep, setWalkthroughStep] = useState<WalkthroughStep>(
    mode === "tutorial" && !autoStart ? "intro" : null,
  );
  /**
   * True while a mid-run walkthrough card ("listen", "menu" — not "intro",
   * the only pre-start step, which simply hasn't started the loop yet)
   * holds the world still. Checked at the top of every
   * `tickAudio`/`tickFrame` call site in the run-owning effect; never set
   * outside `mode === "tutorial"`.
   */
  const frozenRef = useRef(false);
  /**
   * `Run.tickFrame`/`tickAudio` take an absolute timestamp, and `Run` stamps
   * things like a cue's fire time (`cue.atMs`) with whatever it's handed —
   * so simply not calling them while frozen isn't enough on its own. The
   * very next call after unfreezing would still pass real wall-clock time,
   * and `nowMs - cue.atMs` would then include the entire real-time gap the
   * walkthrough card was up for, not just simulated ticks — which is what
   * made the "listen" card's own demo-hold window (`inCuePause`) read as
   * already elapsed the moment the world resumed, so the demo and the
   * corridor's arrival both happened at once instead of the demo holding
   * the world first. `frozenAccumMsRef` is the running total of real ms
   * spent frozen so far; every timestamp handed to `Run` is `real -
   * frozenAccumMsRef.current`, so `Run`'s own clock skips the frozen gap
   * entirely and stays continuous from its perspective.
   */
  const frozenAccumMsRef = useRef(0);
  /** Real timestamp (`performance.now()`-based) the current freeze began at. */
  const freezeStartedAtRef = useRef(0);
  /**
   * The one-time "still in testing" notice, which holds a real run the same way
   * the tutorial card does. Decided once at mount and kept in a ref as well as
   * state, because the run effect reads it without wanting it as a dependency —
   * dismissing the card must start the run, not rebuild it.
   *
   * Not shown before the tutorial: that is a first-timer's first screen, and a
   * disclosure about data is easier to read once they know what the game is.
   * Not shown for "single" either — that's a Lab tuning flight, not a player
   * run, and the card would just be in the way of a tight tune loop.
   */
  const [notice, setNotice] = useState(
    () => scored && !loadNoticeSeen(),
  );
  const noticeRef = useRef(notice);
  /** Gate log entries already reported, so each gate is sent exactly once. */
  const reportedGatesRef = useRef(0);
  /** Set by the effect so the pause overlay's Resume can restart the loop. */
  const resumeRef = useRef<() => void>(() => {});
  /**
   * Set by the effect so the HUD's pause and settings buttons can stop it.
   * The argument is what the resulting menu opens on — the gear pauses and
   * shows the options, the pause button pauses and does not.
   */
  const pauseRef = useRef<(withOptions?: boolean) => void>(() => {});
  /** The run in flight, so the pause menu can toggle the demo live. */
  const runRef = useRef<Run | null>(null);
  /** Set by the effect so the tutorial card's button can begin the run. */
  const startRef = useRef<() => void>(() => {});

  useImperativeHandle(ref, () => ({
    pause: () => pauseRef.current(false),
  }), []);
  /**
   * The last resolved gate, pushed once when it resolves rather than polled.
   *
   * The HUD samples at HUD_HZ (4), which is fine for score and hearts but
   * would land a reaction up to 250ms after the thing it is reacting to. This
   * fires from the rAF loop instead — once per gate, so it is still an event,
   * not a per-frame render.
   */
  const [flash, setFlash] = useState<OutcomeFlash | null>(null);
  /**
   * Bumped by the pause menu's Restart, and listed in the run effect's own
   * dependency array below so a bump tears the current `Run` down and builds
   * a fresh one in place — same canvas element, no navigation, no reopening
   * the mic (which restart doesn't need: pausing only suspends the
   * AudioContext, see `pause()`/`restart()`).
   */
  const [runGen, setRunGen] = useState(0);
  /** This session's run count, shown in the pause menu. Bumped alongside `runGen`. */
  const [runIndex, setRunIndex] = useState(runNumber ?? 1);
  const onOverRef = useRef(onOver);
  useEffect(() => {
    onOverRef.current = onOver;
  });

  // Retire the reaction on a timer rather than by comparing clocks during
  // render — render must stay pure, and the CSS animations own the timing
  // anyway. A new gate replaces `flash`, which restarts this.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [flash]);

  /**
   * Reports gates that have resolved since the last call.
   *
   * Driven off the gate log's length rather than an event, because the log is
   * the only place a finished gate is recorded and it only ever grows. Called
   * from the HUD tick and again at every exit, so a run that ends between ticks
   * still reports its last gate.
   */
  const reportGates = useCallback((snap: RunSnapshot): void => {
    for (let i = reportedGatesRef.current; i < snap.gateLog.length; i++) {
      track(gateEvent(snap.gateLog[i], i));
    }
    reportedGatesRef.current = snap.gateLog.length;
  }, []);

  /**
   * Closes out a run. `track` sends `run_end` instantly rather than joining
   * PostHog's short batch window (see `posthog.ts`), since this is the single
   * most valuable event to not lose to the navigation that follows.
   */
  const reportRunEnd = useCallback(
    (snap: RunSnapshot, reason: RunEndReason): void => {
      reportGates(snap);
      track({
        type: "run_end",
        reason,
        gates: snap.gateLog.length,
        score: snap.stats.score,
        bestMult: snap.stats.bestMultiplier,
        missedEarly: snap.missedUtterances,
      });
    },
    [reportGates],
  );

  /**
   * The pause menu's two exits. Neither goes through `onOver`, so without this
   * a quit left no trace at all — and quitting is precisely the signal that
   * says the game got too hard or too boring.
   */
  const exitRun = useCallback(
    (go: (snap: RunSnapshot | null) => void) => () => {
      const snap = runRef.current?.snapshot() ?? null;
      if (snap) reportRunEnd(snap, "quit");
      go(snap);
    },
    [reportRunEnd],
  );

  /**
   * Restarts the run in place — no navigation, so no reopening the mic
   * (pausing only suspends the `AudioContext`, and `runGen` in the effect's
   * dependency list below tears the old `Run` down and builds a fresh one on
   * the same canvas element).
   */
  const restart = useCallback(() => {
    const snap = runRef.current?.snapshot();
    if (snap) reportRunEnd(snap, "restart");
    const audio = getMicSession()?.ctx;
    if (audio && audio.state === "suspended") void audio.resume();
    setPaused(false);
    setOptionsOpen(false);
    setHud(null);
    setFlash(null);
    setRunIndex((n) => n + 1);
    setRunGen((g) => g + 1);
  }, [reportRunEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Game remounts per run, so this picks up the latest saved corridor
    // width — and the latest motion preference, which the renderer caches.
    refreshMotionPreference();

    const corridor = loadCorridorWidth();
    // The tutorial is call-and-response by design — a player's general
    // preference for skipping demos in real runs shouldn't silently break
    // the one mode whose entire point is demonstrating the mechanic (it
    // would also skip the walkthrough's demo-timed steps below).
    const cueStyle = mode === "tutorial" ? "pause" : loadCueStyle();
    // Every fresh Run (mount, or a pause-menu Restart bumping runGen)
    // replays the walkthrough from the top.
    frozenRef.current = false;
    frozenAccumMsRef.current = 0;
    freezeStartedAtRef.current = 0;
    if (mode === "tutorial" && !autoStart) setWalkthroughStep("intro");
    const run = new Run({
      mode,
      width: canvasWidth,
      corridor,
      cueStyle,
      // Queried at cue time — clips finish loading after the Run exists.
      cueDurationMsFor,
      // Whatever the manifest fetch has produced by now. Empty is a valid run:
      // it flies the tuning defaults with synthetic cues.
      words: inventoryNow() ?? [],
      singleWord,
      drillTone,
      // The calibration flight (autoStart) flies only the grid-anchoring tones;
      // a normal tutorial teaches all four.
      tutorialTones: autoStart ? CALIBRATION_TONES : undefined,
    });
    runRef.current = run;
    reportedGatesRef.current = 0;
    // The settings are stamped on the run rather than the session: a player who
    // widens the corridor mid-session would otherwise have their easier run
    // read against the harder one's settings.
    track({ type: "run_start", mode, corridor, cue: cueStyle });
    // If the manifest had not landed when the Run was built, catch it up.
    if (!inventoryNow()) void loadInventory().then((w) => run.setWords(w));
    let tracker: PitchTracker | null = null;
    let rafId = 0;
    let running = true;
    let finished = false;
    let lastT = performance.now();
    // The run decides when a cue fires (snapshot.cue); the host only plays
    // the audio, edge-triggered on the cued gate's stable xStart.
    let lastPlayedXStart = -Infinity;
    /** Resolve time of the gate the HUD has already reacted to. */
    let lastFlashedAtMs = -Infinity;
    // Walkthrough edge-detection (tutorial only) — mirrors lastPlayedXStart's
    // pattern: plain per-effect locals, read/updated once per frame from the
    // freshly-computed snapshot, so a transition is caught before the world
    // visibly moves past it (the polled `hud` state is too coarse for this).
    let prevHadCue = false;
    let prevGateLogLen = 0;

    // The mic is already open — Title opened it inside the click gesture.
    // Named (not passed inline) so `resumeRef` can re-install this exact
    // callback: GameApp keeps this component mounted-but-hidden while the
    // player visits another nav tab, and the Visualiser claims the shared
    // frame sink for itself while it's up front (see `src/audio/session.ts`
    // — there is only one sink slot for the whole app). Resuming here has to
    // reclaim it, the same way Visualiser's own `toggleMute` does.
    const onFrame = (frame: Float32Array, sampleRate: number) => {
      // Deaf while the game itself is talking — the cue would drive the dot.
      if (isCueAudible()) return;
      if (!tracker) {
        tracker = new PitchTracker({
          sampleRate,
          f0Center: settings.f0Center,
          noiseFloor: settings.noiseFloor,
          rangeSemitones: settings.rangeSemitones,
          rangeDownSemitones: settings.rangeDownSemitones,
        });
        // Published so the dev Lab's sliders reach the tracker that is
        // actually flying the dot, rather than a tracker nobody is listening to.
        setActiveTracker(tracker);
      }
      const pitch = tracker.push(frame);
      publishState(pitch);
      // A walkthrough card (steps B/C/D) holds the world still — no pitch
      // frame should reach Run while one is up. The frozen-time offset (see
      // frozenAccumMsRef's comment) keeps Run's own clock continuous.
      if (!frozenRef.current) {
        run.tickAudio(pitch, performance.now() - frozenAccumMsRef.current);
      }
    };
    setFrameSink(onFrame);

    const tick = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      // The same virtual clock for Run and for drawing it: Run's reported
      // timestamps (trail points, cue.atMs, lastOutcome.atMs, ...) are all
      // stamped from whatever we pass tickFrame/tickAudio, so the renderer
      // has to age them against that same clock — not raw performance.now()
      // — or every age/sweep computation misreads the frozen gap as elapsed
      // time (see drawWorld's `now` param and frozenAccumMsRef's comment).
      const vnow = now - frozenAccumMsRef.current;
      // A walkthrough card (steps B/C/D) holds the world still — worldX,
      // gate sync, collision and the cue timer all stand genuinely still,
      // since Run's own `nowMs` only ever advances inside this call.
      if (!frozenRef.current) run.tickFrame(dt, vnow);
      const snap = run.snapshot();
      // Re-applies the backing-store scale every frame — cheap (scaleForDpr
      // only resizes when the density-scaled dimensions actually changed)
      // and picks up canvasHeightRef's latest value without this effect
      // needing canvasHeight as a dependency.
      const ctx2d = scaleForDpr(canvas, canvasWidth, canvasHeightRef.current);
      if (!ctx2d) return;
      drawWorld(ctx2d, canvasWidth, canvasHeightRef.current, snap, vnow);

      // Walkthrough step triggers — gate 1 only (gateLog.length gates B, and
      // D fires exactly once when it flips 0→1). Must run before the
      // cue-play block below: freezing here on the same frame `snap.cue`
      // first appears is what stops the demo from playing before "listen"
      // is dismissed.
      //
      // There used to be a third trigger here ("your-turn", firing when
      // cuePaused ended) that froze the world again right as the corridor
      // began its approach. It made the reaction window feel too short: the
      // approach distance (cueApproachMs, unchanged the whole time worldX is
      // frozen — by this freeze or Run's own inCuePause hold) is the same
      // runway every gate in the game gives a player to react, but a normal
      // player is already reacting to the demo throughout the hold and the
      // approach, not reading a card and tapping Continue first. Freezing a
      // second time here spent part of that fixed runway on the card instead
      // of on flying. Removing it lets the demo→hold→approach sequence run
      // uninterrupted once "listen" is dismissed — the existing, unrelated
      // `phase-banner your-turn` (below, driven by `banner`) still cues the
      // player non-blockingly, exactly as it does for every other gate.
      if (mode === "tutorial" && !autoStart) {
        if (
          !frozenRef.current &&
          snap.gateLog.length === 0 &&
          !prevHadCue &&
          snap.cue !== null
        ) {
          frozenRef.current = true;
          freezeStartedAtRef.current = now;
          setWalkthroughStep("listen");
        } else if (
          !frozenRef.current &&
          prevGateLogLen === 0 &&
          snap.gateLog.length === 1
        ) {
          frozenRef.current = true;
          freezeStartedAtRef.current = now;
          setWalkthroughStep("menu");
        }
        prevHadCue = snap.cue !== null;
        prevGateLogLen = snap.gateLog.length;
      }

      // One setState per resolved gate, not per frame — the rAF loop stays
      // the owner of the canvas, React just hears about outcomes.
      const resolved = snap.lastOutcome;
      if (resolved && resolved.atMs !== lastFlashedAtMs) {
        lastFlashedAtMs = resolved.atMs;
        // Sync the numbers on the same beat. Otherwise the heart that just
        // broke is still counted by the polled HUD for up to 250ms, and the
        // score lands visibly after the gate that earned it.
        setHud(snap);
        setFlash({
          outcome: resolved.outcome,
          points: resolved.points,
          hint: resolved.hint,
          tone: resolved.tone,
          mismatchedAs: resolved.mismatchedAs,
          mismatchedConfidence: resolved.mismatchedConfidence,
          classifiedTone: resolved.classifiedTone,
          classifiedConfidence: resolved.classifiedConfidence,
          atMs: resolved.atMs,
        });
      }

      if (snap.cue && snap.cue.xStart > lastPlayedXStart && !frozenRef.current) {
        lastPlayedXStart = snap.cue.xStart;
        const audio = getMicSession()?.ctx;
        // Same context the mic runs on, so it is already gesture-resumed.
        if (audio && audio.state === "running") {
          const playedClip = playToneCue(
            audio,
            snap.cue.tone,
            settings.f0Center,
            settings.rangeSemitones,
            snap.cue.word,
            settings.rangeDownSemitones,
            mode === "learn",
          );
          // Learn mode always takes the synth branch on purpose — only
          // Classic/Drill falling back to it is a real clip-load failure
          // worth tracking.
          if (!playedClip && mode !== "learn") {
            track({ type: "cue_fallback", tone: snap.cue.tone });
          }
        }
      }

      if (snap.over && !finished) {
        finished = true;
        running = false;
        saveGateLog(snap.gateLog, snap.missedUtterances);
        // The tutorial has no hearts — reaching the end of it is finishing.
        reportRunEnd(snap, mode === "tutorial" ? "finished" : "out_of_hearts");
        clearInterval(hudTimer);
        setFrameSink(null);
        stopMic();
        releaseWakeLock();
        onOverRef.current(snap);
        return;
      }
      if (running) rafId = requestAnimationFrame(tick);
    };

    let hudTimer = 0;
    const startHud = () => {
      hudTimer = setInterval(() => {
        const snap = run.snapshot();
        setHud(snap);
        // Fetch the audio for every gate still ahead of the bird. loadClip is
        // idempotent per id, so this is a no-op once a word is in flight; the
        // queue runs two gates ahead, which is seconds of warning.
        {
          const audio = getMicSession()?.ctx;
          if (audio) {
            for (const g of snap.gates) if (g.word) void loadClip(audio, g.word);
          }
        }
        // Mirrored every tick, not just at game over, so quitting mid-run or
        // closing the tab still leaves the numbers behind.
        saveGateLog(snap.gateLog, snap.missedUtterances);
        reportGates(snap);
      }, 1000 / HUD_HZ);
    };

    const start = () => {
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
      startHud();
      // Voice is the only input, so there's no touch to keep the OS from
      // dimming the screen — the browser silently drops this lock whenever
      // the tab goes hidden, hence re-requesting it here rather than once.
      void acquireWakeLock();
    };
    // One pause, two triggers: the player's button and the tab going away.
    // They must do the same thing — a run that keeps scrolling behind a menu,
    // or an AudioContext left running while the phone is in a pocket, are the
    // two bugs this shape exists to prevent.
    const pause = (withOptions = false) => {
      // Still set the menu's shape when already stopped: tapping the gear
      // while the tab-hidden pause is showing should open the options, not
      // silently do nothing.
      setOptionsOpen(withOptions);
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(hudTimer);
      void getMicSession()?.ctx.suspend();
      releaseWakeLock();
      setPaused(true);
    };
    pauseRef.current = pause;

    resumeRef.current = () => {
      const audio = getMicSession()?.ctx;
      // resume() is called from the overlay's click handler — iOS needs that.
      if (audio && audio.state === "suspended") void audio.resume();
      // Reclaims the frame sink in case another screen (Visualiser) took it
      // over while this run sat paused-and-hidden in the background — see
      // `onFrame`'s comment above. A no-op if nothing else claimed it.
      setFrameSink(onFrame);
      setPaused(false);
      if (!finished) start();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The tutorial holds until the player taps Start; a game run begins now.
    startRef.current = () => {
      const audio = getMicSession()?.ctx;
      if (audio && audio.state === "suspended") void audio.resume();
      start();
    };
    // A deliberately started tutorial holds behind its walkthrough's "intro"
    // card — see WalkthroughStep. A first real run holds behind the testing
    // notice. The calibration flight (autoStart) starts immediately, same
    // as before the walkthrough existed: it's a range-measuring flight, not
    // a teaching moment, and its gesture already happened on the
    // calibration screen's "Let's go".
    if ((mode !== "tutorial" || autoStart) && !noticeRef.current) start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(hudTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseWakeLock();
      setFrameSink(null);
      setActiveTracker(null);
      runRef.current = null;
    };
    // reportGates/reportRunEnd are stable (useCallback with no changing deps),
    // so listing them cannot rebuild the run mid-play. runGen is the one
    // dependency here that changes without anything else changing — see
    // `restart()` above. canvasHeight is deliberately absent — see
    // canvasHeightRef above; canvasWidth stays, since gate/corridor
    // positions genuinely are computed from it (game/run.ts).
  }, [
    mode,
    autoStart,
    settings,
    canvasWidth,
    singleWord,
    runGen,
    reportGates,
    reportRunEnd,
  ]);

  // Show the *active* gate's tone while flying it — showing the next gate's
  // tone mid-gate would teach the wrong contour (this matters most in the
  // tutorial, where the cue text is the lesson).
  const displayTone = hud?.activeGate?.tone ?? hud?.upcoming?.tone ?? null;
  // The word being flown, when there is one. Its own pinyin and hanzi — the
  // tone's stand-in `ma` is only what a gate without a clip can say.
  const displayWord = hud?.activeGate?.word ?? hud?.upcoming?.word ?? null;
  const info = displayTone === null ? null : TONE_INFO[displayTone];

  // Listen → Your turn: "listen" spans only the frozen demo + hold
  // (`cuePaused`), not the whole cue phase. Once the world unfreezes the
  // player is meant to be answering already — during `cueApproachMs` of
  // travel toward the gate — so "your turn" starts there, not at gate entry.
  // It then carries through the active gate's first stretch before clearing.
  const banner =
    hud?.phase === "listen"
      ? hud.cuePaused
        ? ("listen" as const)
        : ("your-turn" as const)
      : hud?.phase === "active" &&
          (hud.activeGate?.t ?? 1) < YOUR_TURN_MAX_T
        ? ("your-turn" as const)
        : null;

  const showPoints = flash !== null && flash.points > 0;
  const showHint = flash?.outcome === "unheard";
  const showMismatch =
    flash?.outcome === "collision" &&
    flash.mismatchedAs !== null &&
    flash.mismatchedAs !== "none";
  // A confident, correct read gets praised — but only on an outcome that
  // isn't already unheard/collision (LastOutcome already nulls
  // classifiedTone on collision) and isn't itself the mismatch case above.
  const showPraise =
    flash !== null &&
    !showMismatch &&
    flash.outcome !== "unheard" &&
    flash.classifiedTone === flash.tone &&
    (flash.classifiedConfidence ?? 0) >= HIGH_CLASSIFIER_CONFIDENCE;
  const breaking = flash?.outcome === "collision";
  const hearts = Math.max(0, hud?.hearts ?? 3);
  // Matches newRunStats()'s default in src/game/scoring.ts — a run starts
  // with 3 hearts, so 3 slots are always shown, lost ones as outlines.
  const MAX_HEARTS = 3;

  return (
    <div className="screen game-screen" style={hidden ? { display: "none" } : undefined}>
      <div
        className="stage game-stage"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />

        <div className="hud">
          <div className="hud-top">
            <span className="score">
              {hud?.score ?? 0}
              {showPoints && (
                <span key={flash!.atMs} className="points-pop">
                  +{flash!.points}
                </span>
              )}
            </span>
            {scored && (
              <span className="hearts">
                {Array.from({ length: MAX_HEARTS }, (_, i) => (
                  <span key={i} className="heart">
                    <HeartIcon filled={i < hearts} />
                  </span>
                ))}
                {/* The heart just lost, shown mid-break then gone. Without it
                    a collision simply removed a glyph, which read as nothing. */}
                {breaking && (
                  <span key={flash!.atMs} className="heart breaking">
                    <HeartIcon filled />
                  </span>
                )}
              </span>
            )}
            {scored && (hud?.comboMult ?? 1) > 1 && (
              <span className="combo">×{hud?.comboMult}</span>
            )}
            {/* In the row rather than absolutely positioned over it: floated
                top-right it sat on top of the hearts, which are also
                right-aligned. */}
            {walkthroughStep === null && !notice && !paused && (
              <div className="hud-controls">
                <button
                  className="hud-button"
                  onClick={() => pauseRef.current(false)}
                  title="Pause"
                  aria-label="Pause"
                >
                  <PauseIcon />
                </button>
              </div>
            )}
          </div>

          {/* Learn mode is tone-shape recognition only — the word behind a
              gate is incidental (it only supplies the corridor's contour),
              so showing its hanzi/pinyin would cue pronunciation the mode is
              explicitly not asking for. Only the gate itself is shown. */}
          {mode !== "learn" && info && displayTone !== null && (
            <div className="hud-syllable">
              {showTranslation && displayWord?.english && (
                <span className="english">{displayWord.english}</span>
              )}
              <span className="syllable">{displayWord?.pinyin ?? info.pinyin}</span>
              <span className="hanzi">{displayWord?.hanzi ?? info.hanzi}</span>
              <span className="tone-num">({displayTone})</span>
            </div>
          )}

          {/* Tutorial-only cue text ("say it flat and high") — the
              lesson copy that teaches each tone shape. Outside the tutorial
              the player is meant to answer the demo clip, not read a script,
              so this stays out of game/practice mode. */}
          {mode === "tutorial" && info && displayTone !== null && (
            <div className="hud-status">
              {info.cue}
            </div>
          )}

          {/* Single group pinned to the bottom of the flex `.hud` column via
              one margin-top: auto on the wrapper. Each child used to carry
              its own auto margin, which meant two present at once (the
              banner and the dev gate-log) split the leftover space between
              them instead of stacking together at the bottom. */}
          <div className="hud-bottom">
            {banner === "listen" && (
              <div className="phase-banner listen">🔊 listen…</div>
            )}
            {banner === "your-turn" && (
              <div className="phase-banner your-turn">
                your turn!
                {/* Decorative only: a CSS-only pulse, not a real mic-level
                    meter. It never reads RMS/frame data — see CLAUDE.md's
                    src/pitch and src/audio boundary. */}
                <span className="listening-bars" aria-hidden="true">
                  <span className="listening-bar" />
                  <span className="listening-bar" />
                  <span className="listening-bar" />
                  <span className="listening-bar" />
                </span>
              </div>
            )}

            {showHint && (
              <div key={flash!.atMs} className="toast unheard-toast">
                {HINT_TEXT[flash!.hint ?? "generic"]}
              </div>
            )}
            {showMismatch && (
              <div key={flash!.atMs} className="toast mismatch-toast">
                {(flash!.mismatchedConfidence ?? 0) >= HIGH_CLASSIFIER_CONFIDENCE
                  ? `that was a T${flash!.mismatchedAs}, not a T${flash!.tone}`
                  : `that sounded more like a T${flash!.mismatchedAs}`}
              </div>
            )}
            {showPraise && (
              <div key={flash!.atMs} className="toast praise-toast">
                nice T{flash!.classifiedTone}!
              </div>
            )}
            {hud?.noisy && <div className="hint">it's noisy in here</div>}

            {GATE_LOG_ENABLED && hud && (
              <div className="gate-log">
                <div>
                  unheard{" "}
                  {hud.gateLog.filter((g) => g.outcome === "unheard").length}/
                  {hud.gateLog.length} · missed early {hud.missedUtterances}
                </div>
                {hud.gateLog
                  .slice(-GATE_LOG_ON_SCREEN)
                  .reverse()
                  .map((g) => (
                    <div key={g.atMs}>
                      T{g.tone} {g.outcome} · {g.voiced}/{g.samples} (
                      {Math.round(g.voicedFraction * 100)}%) ·{" "}
                      {Math.round(g.utteranceMs)}ms
                      {g.seeded > 0 ? ` · +${g.seeded} early` : ""}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Shown once, ever. A notice rather than a consent gate: sharing is
            already on, and the button only makes the card stop coming back.
            Its click is also a user gesture, which is the iOS-safe place to
            resume the AudioContext — the same reason the tutorial card works. */}
        {notice && (
          <div className="overlay tutorial-card">
            <h3>Still in testing</h3>
            <p>
              I'm sending anonymous data about how the game goes, which gates
              you hit or miss, and how your voice maps to the screen, so I can
              tune it.
            </p>
            <p className="note">
              No audio is ever recorded or sent. You can turn this off in
              Settings at any time.
            </p>
            <button
              className="primary"
              onClick={() => {
                saveNoticeSeen();
                noticeRef.current = false;
                setNotice(false);
                startRef.current();
              }}
            >
              Got it
            </button>
          </div>
        )}

        {/* The tutorial's guided walkthrough — four cards around gate 1,
            each pausing the world (not the pause menu) until dismissed.
            See WalkthroughStep and the run-owning effect's tick(). */}
        {walkthroughStep === "intro" && (
          <div className="overlay tutorial-card">
            <JumpingPip size={96} className="walkthrough-pip" />
            <h3>Meet Pip</h3>
            <p>Hey, I'm Flappy! I'll help you get the hang of the Mandarin tones.</p>
            <p className="note">
              This run isn't scored, it's just for you to get a feel for it.
            </p>
            <button
              className="primary"
              onClick={() => {
                // Starts the run loop directly — this is the only pre-start
                // card. "listen" is not chained after it: it's shown later,
                // mid-run, the moment gate 1's demo cue actually fires (see
                // tick()'s Trigger B). Chaining it here duplicated the card
                // (once here, once for real) and left the real one's Continue
                // with nothing to do.
                setWalkthroughStep(null);
                startRef.current();
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* Covers both "listen" and "your turn" in one card, dismissed once
            — see the trigger comment above for why there's no second freeze
            partway through the demo/approach anymore: it was spending part
            of the gate's fixed reaction runway on reading a card instead of
            flying. The existing (unmodified) `phase-banner your-turn` cues
            the player once the approach actually starts, same as any gate. */}
        {walkthroughStep === "listen" && (
          <div className="overlay tutorial-card">
            <JumpingPip size={96} className="walkthrough-pip" />
            <h3>First, listen</h3>
            <p>
              Listen to the demo, then copy the tone. Your voice controls the bird's flight. Try not to touch the walls!
            </p>
            <button
              className="primary"
              onClick={() => {
                // The run is already ticking (that's how this card got
                // triggered) — unfreeze, on a short delay so the demo
                // doesn't fire in the same instant as the tap, which read as
                // instant/jarring rather than a deliberate beat. The elapsed
                // real time (card display + this delay) is accumulated right
                // when ticking actually resumes, not at click time — see
                // frozenAccumMsRef's comment.
                setWalkthroughStep(null);
                window.setTimeout(() => {
                  frozenAccumMsRef.current += performance.now() - freezeStartedAtRef.current;
                  frozenRef.current = false;
                }, WALKTHROUGH_DEMO_DELAY_MS);
              }}
            >
              Continue
            </button>
          </div>
        )}

        {walkthroughStep === "menu" && (
          <div className="overlay tutorial-card">
            <JumpingPip size={96} className="walkthrough-pip" />
            <h3>Nice!</h3>
            <p>
              You can always pause to check the menu or adjust settings.
              Take a look here. Good luck!
            </p>
            <button
              className="primary"
              onClick={() => {
                frozenAccumMsRef.current += performance.now() - freezeStartedAtRef.current;
                frozenRef.current = false;
                setWalkthroughStep(null);
                pauseRef.current(false);
              }}
            >
              Show me
            </button>
          </div>
        )}

        {/* The pause menu, merged with what used to be a second "Game
            options" screen behind a reveal button — see PauseMenu.tsx.
            Deliberately not dismissable by tapping the backdrop: there are
            controls under here now, and a mis-tap that drops you back into a
            moving corridor is worse than one more tap.

            `!hidden` matters: GameApp's onNavigate calls pause() (setting
            `paused` true) and switches `screen` away in the same handler,
            but nothing guarantees those two updates paint in the same
            frame — without this the overlay could flash visible for a
            frame while the tab switch is still landing. */}
        {paused && !hidden && (
          <div className="overlay pause-menu">
            <PauseMenu
              mode={mode}
              score={hud?.score ?? 0}
              runNumber={scored ? runIndex : null}
              stats={scored ? (hud?.stats ?? null) : null}
              settingsOpen={optionsOpen}
              onToggleSettings={() => setOptionsOpen((open) => !open)}
              onResume={() => resumeRef.current()}
              onRestart={restart}
              onQuit={exitRun(onQuit)}
              onCueStyle={(style) => runRef.current?.setCueStyle(style)}
              onShowTranslation={setShowTranslation}
            />
          </div>
        )}
      </div>
    </div>
  );
});
