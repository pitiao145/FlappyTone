import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { initAnalytics, track, trackCalibration } from "../analytics/client";
import { capturePostHogEvent, initPostHog } from "../analytics/posthog.ts";
import { loadInventory } from "../audio/inventory";
import { MicError } from "../audio/mic";
import { ensureMic, getMicSession, MicCancelled, stopMic } from "../audio/session";
import { incrementDailyRuns, loadDailyRuns } from "../game/dailyLimit.ts";
import {
  averageRangeHalves,
  COOLDOWN_TRACKING_WINDOW,
  INITIAL_TRACKING_WINDOW,
  recalibrationSuggestion,
  recordTrackedRun,
} from "../game/recalibration.ts";
import type { RunSnapshot } from "../game/run";
import { recordRun } from "../game/runHistory.ts";
import { recordPlay } from "../game/streak.ts";
import {
  loadRecalTracking,
  loadSettings,
  loadShareData,
  saveRecalTracking,
  saveSettings,
  type CalibrationSettings,
} from "../game/settings";
import type { RangeHalves } from "../pitch/calibration.ts";
import type { RunStats } from "../game/scoring";
import { Calibration } from "../ui/Calibration";
import { Game, type GameHandle } from "../ui/Game";
import { GameOver } from "../ui/GameOver";
import { EarlyBirdModal, type EarlyBirdSurface } from "../ui/EarlyBirdModal.tsx";
import { HowTo } from "../ui/HowTo";
import { Loading } from "../ui/Loading";
import { ModeSelect } from "../ui/ModeSelect.tsx";
import { PlayHome, type PlayIntent } from "../ui/PlayHome";
import type { Tone } from "../game/gates.ts";
import { Profile } from "../ui/Profile.tsx";
import { Progress } from "../ui/Progress.tsx";
import { Settings } from "../ui/Settings";
import { TutorialDone } from "../ui/TutorialDone.tsx";
import { Visualiser } from "../ui/Visualiser";
import { micErrorCopy } from "../ui/micErrors";
import { GameNav, type NavTab } from "./GameNav.tsx";
import "../App.css";

type Screen =
  | "play"
  | "modes"
  | "howto"
  | "calibrate"
  | "finetune"
  | "tutorial"
  | "seeding"
  | "tutorialdone"
  | "game"
  | "drill"
  | "learn"
  | "gameover"
  | "settings"
  | "visualiser"
  | "progress"
  | "profile"
  | "lab";

/** What Play/Tutorial (from the Play tab or Settings) route through. */
type StartIntent = PlayIntent | "visualiser";

/** Which nav item should read as active for a given screen. */
function navTabFor(screen: Screen): NavTab {
  switch (screen) {
    case "visualiser":
      return "visualiser";
    case "progress":
      return "progress";
    case "profile":
      return "profile";
    case "howto":
    case "settings":
      return "settings";
    default:
      return "play";
  }
}

/**
 * The dev Lab is a separate instance of the game for tuning, and it must not
 * reach a player. Loading it lazily behind `import.meta.env.DEV` means Rollup
 * drops the whole subtree — Lab, tuning UI, Capture — from a
 * production build rather than merely hiding the button.
 */
const Lab = import.meta.env.DEV
  ? lazy(() => import("../dev/Lab.tsx").then((m) => ({ default: m.Lab })))
  : null;

/**
 * What the landing page asked for on its way here, if anything.
 *
 * Only ever a *hint* for the initial tab, never an instruction to start:
 * `ensureMic()` needs a user gesture (iOS Safari grants `getUserMedia` inside
 * the click and nowhere else), and a gesture on the previous page does not
 * survive the navigation. `visualiser` is the only intent worth acting on
 * here, since it's the only one that doesn't require the mic to already be
 * open — it opens onto the Visualiser tab, and the player's first tap there
 * is the gesture.
 */
function initialIntent(): "visualiser" | null {
  try {
    const intent = new URLSearchParams(window.location.search).get("intent");
    if (intent === "visualiser") return "visualiser";
  } catch {
    /* no window (tests) */
  }
  return null;
}

/**
 * Canvas resolution — computed live from the real viewport, not a fixed
 * constant, on both mobile and desktop. `window.innerHeight` (not CSS
 * `100svh`) is what makes this correct: it already excludes browser chrome
 * and updates on `resize` as that chrome shows/hides, whereas the CSS-only
 * formula this replaced used a static, worst-case reserve and came out
 * narrower than the device on ordinary mobile browser tabs (Safari/Chrome's
 * toolbars ate more of `100svh` than the reserve assumed), leaving side
 * gutters that only disappeared once installed as a chromeless PWA.
 *
 * Both mobile and desktop just take the whole viewport minus the nav —
 * width and height are independent, no aspect ratio is preserved or
 * enforced either way. Mobile's nav is a bottom bar (MOBILE_NAV_RESERVE
 * comes off height); desktop's is a sidebar (STAGE_MARGIN_DESKTOP is a
 * bottom breathing margin, width is capped at CANVAS_W_DESKTOP instead).
 *
 * Both rendering and Run's world math (`this.width` in run.ts) key off
 * these, so this is what actually makes the canvas fill the screen, not
 * just the CSS box it sits in — see `difficultyFor` in run.ts, which scales
 * `scrollSpeed` by `width / CANVAS_W_REF` so a differently-sized canvas
 * doesn't change cue timing (gates would otherwise reach the bird later
 * relative to their reference audio, since only the world scrolls faster in
 * step with the canvas).
 */
const CANVAS_W_REF = 420;
const CANVAS_W_DESKTOP = 900;
/** Keep in sync with --nav-mobile-h in tokens.css. */
const MOBILE_NAV_RESERVE = 72;
/** Keep in sync with --stage-margin-desktop in tokens.css. */
const STAGE_MARGIN_DESKTOP = 28;
/** Keep in sync with .game-screen's desktop padding-top in App.css. */
const GAME_TOP_PADDING_DESKTOP = 24;

function computeCanvasSize(mainEl?: HTMLElement | null) {
  if (typeof window === "undefined") {
    return {
      w: CANVAS_W_REF,
      h: Math.round((CANVAS_W_REF * 16) / 9),
      desktop: false,
    };
  }
  if (window.matchMedia("(min-width: 720px)").matches) {
    return {
      w: CANVAS_W_DESKTOP,
      h: Math.round(window.innerHeight - STAGE_MARGIN_DESKTOP),
      desktop: true,
    };
  }
  // Prefer the laid-out `.app-main` — on mobile it's the flex region above
  // the in-flow nav (--nav-mobile-pct), so measuring it matches the stage.
  // Fallback still subtracts MOBILE_NAV_RESERVE before first layout.
  if (mainEl && mainEl.clientWidth > 0 && mainEl.clientHeight > 0) {
    return {
      w: mainEl.clientWidth,
      h: mainEl.clientHeight,
      desktop: false,
    };
  }
  return {
    w: window.innerWidth,
    h: Math.round(window.innerHeight - MOBILE_NAV_RESERVE),
    desktop: false,
  };
}

/**
 * Tracks the viewport (breakpoint, width, height) computeCanvasSize needs.
 * On mobile, observes `.app-main` so the stage matches the fixed shell
 * rather than overshooting into a page scroll.
 */
function useCanvasSize(mainRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState(computeCanvasSize);
  useEffect(() => {
    const onChange = () => setSize(computeCanvasSize(mainRef.current));
    onChange();
    const el = mainRef.current;
    const ro = el ? new ResizeObserver(onChange) : null;
    if (el && ro) ro.observe(el);
    const mq = window.matchMedia("(min-width: 720px)");
    mq.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("resize", onChange);
    return () => {
      ro?.disconnect();
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("resize", onChange);
    };
  }, [mainRef]);
  return size;
}

/**
 * The game — the whole of what `/app` serves.
 *
 * There is no landing page in here. The marketing site is a separate entry
 * (`/`, `src/LandingApp.tsx`), which is why this file no longer decides
 * between the two on load: reaching this URL at all *is* the decision.
 */
export default function GameApp() {
  const mainRef = useRef<HTMLDivElement>(null);
  const { w: CANVAS_W, h: CANVAS_H, desktop } = useCanvasSize(mainRef);
  // A run's own top breathing room on desktop (App.css's .game-screen
  // padding-top) — trimmed off the stage's own height budget rather than
  // added on top of it, so the frame still ends at the same bottom margin.
  // PlayHome uses this too, matched to Game's height rather than the raw
  // CANVAS_H, even though it has no padding-top of its own to budget for.
  // Calibration keeps the full CANVAS_H.
  const GAME_CANVAS_H = desktop ? CANVAS_H - GAME_TOP_PADDING_DESKTOP : CANVAS_H;

  const [settings, setSettings] = useState<CalibrationSettings | null>(() =>
    loadSettings(),
  );
  // Only worth honouring if already calibrated — the Visualiser screen needs
  // settings to render, and jumping to it uncalibrated would draw a blank.
  const [screen, setScreen] = useState<Screen>(() =>
    initialIntent() === "visualiser" && settings ? "visualiser" : "play",
  );
  /**
   * Whether the mic session backing the Visualiser screen is actually open.
   * Landing here via `onNavigate("visualiser")` (a real click) only ever
   * flips `screen` to "visualiser" *after* `ensureMic()` resolves, so this
   * starts true for that path. Landing here via `?intent=visualiser` from
   * the landing page (see `initialIntent`) sets `screen` straight to
   * "visualiser" with no click behind it at all — `ensureMic()` was never
   * called, so without this flag `<Visualiser>` mounted believing the mic
   * was already open (its own comment says so) and just sat deaf until the
   * player happened to hit the mute button twice. This starts false in that
   * case so a tap gate renders instead, and that tap is the real gesture.
   */
  const [visualiserMicReady, setVisualiserMicReady] = useState(
    () => !(initialIntent() === "visualiser" && settings) || getMicSession() !== null,
  );
  const [stats, setStats] = useState<RunStats | null>(null);
  /**
   * What GameOver should offer, if anything — decided here, once the
   * tracking window for this run fills. Not the raw measurement: see
   * `recalibration.ts` for why judging a single run's measured range was
   * replaced with judging the average of a multi-run window.
   */
  const [recalSuggestion, setRecalSuggestion] = useState<RangeHalves | null>(
    null,
  );
  /** True when the shown offer is the first one (post-calibration, after 1 game). */
  const [recalFirst, setRecalFirst] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(false);
  // Which success copy the tutorialdone screen shows: the standalone tutorial
  // ends on "Good job", the calibration-flow tutorial on "Your grid is ready".
  const [doneVariant, setDoneVariant] = useState<"tutorial" | "calibration">("tutorial");
  const [error, setError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [earlyBird, setEarlyBird] = useState<{
    surface: EarlyBirdSurface;
    feature: string;
  } | null>(null);
  /**
   * Opens the EarlyBird modal. Purely a state-setter — every call site tracks
   * its own specifically-named PostHog event before calling this, so each CTA
   * across Progress/Profile/the daily-limit gate is distinguishable in
   * PostHog by event name alone, not just by the `surface`/`feature` this
   * still carries (that pair only survives to tag the modal's own
   * `earlybird_pay_click`, once the player gets that far).
   */
  const openEarlyBird = useCallback((surface: EarlyBirdSurface, feature: string) => {
    setEarlyBird({ surface, feature });
  }, []);
  /**
   * True once the day's 5 free "game" runs (see `incrementDailyRuns` in
   * `onRunOver` below) are used up. Tutorial and the visualiser are never
   * gated — only a fresh or retried "game" run checks this, right before it
   * would otherwise start.
   */
  const dailyLimitReached = useCallback(() => {
    const daily = loadDailyRuns();
    return daily.count >= daily.limit;
  }, []);
  /** Where to go once calibration finishes, when Play/Tutorial routed through it. */
  const pendingRef = useRef<StartIntent | null>(null);
  /**
   * True while the tutorial that immediately follows a calibration is running:
   * its measured range seeds the grid (calibration itself only sites the centre
   * and leaves a provisional ±5 board — the sweeps are gone). A tutorial replayed
   * from Settings has this false and never touches the saved range.
   */
  const calibratingRef = useRef(false);
  /**
   * Render-readable twin of `calibratingRef`, so the calibration tutorial can be
   * told to auto-start (skip its intro card) without reading a ref during render.
   * Kept in lockstep with the ref at every set site.
   */
  const [autoStartTutorial, setAutoStartTutorial] = useState(false);
  /** The mode of the run that just ended — drives Retry. */
  const lastModeRef = useRef<"game" | "tutorial" | "drill" | "learn">("game");
  /** The tone a "drill" run is pinned to. Set by ModeSelect, read by <Game>. */
  const drillToneRef = useRef<Tone | null>(null);
  const gameRef = useRef<GameHandle>(null);
  /**
   * True from the moment a "game"/"tutorial" run actually starts until it
   * genuinely ends (finished, out of hearts, or quit from the pause menu) —
   * not the same thing as `screen === "game"`. `<Game>` now renders (hidden
   * via CSS, not unmounted) for as long as this is true, so switching to
   * another nav tab mid-run keeps its `Run` instance alive instead of
   * destroying it: the run-owning effect in Game.tsx only tears down on
   * unmount, and a nav tab used to force exactly that by making `screen`
   * stop matching "game"/"tutorial". `onNavigate` pauses (never stops) the
   * mic and calls `gameRef.current?.pause()` before navigating away while
   * this is true, so the hidden run freezes rather than playing on unseen.
   */
  const [gameAlive, setGameAlive] = useState(false);
  /**
   * This session's "game" run count — shown in the pause menu ("run N").
   * Bumped on every fresh visit to a game run (Play, Retry); an in-game
   * Restart bumps its own local copy instead, since it never reaches here.
   */
  const gameRunNumberRef = useRef(0);

  /**
   * Bumped on every deliberate navigation. An in-flight `ensureMic` compares
   * it after awaiting, so a Retry that resolves *after* the player pressed
   * Home can never drop them into a run they left.
   */
  const navRef = useRef(0);

  const goHome = useCallback(() => {
    navRef.current += 1;
    stopMic();
    setRetryBusy(false);
    setGameAlive(false);
    setScreen("play");
  }, []);

  /**
   * The pause menu's "quit" exit from a "game" run. Recorded (with a
   * "quit" outcome) so it shows up in run history — unlike a
   * finished/out_of_hearts run, it deliberately does NOT call
   * `incrementDailyRuns()`: quitting shouldn't cost the player one of
   * their 5 daily free runs. Tutorial quits are neither recorded nor
   * counted, same as `onRunOver`. Drill runs are recorded the same way
   * ("game" or "drill" — real, scored practice); Learn quits are neither
   * recorded nor counted, same as tutorial.
   */
  const onRunQuit = useCallback((snap: RunSnapshot | null) => {
    if (snap && (lastModeRef.current === "game" || lastModeRef.current === "drill")) {
      recordRun(snap, "quit");
    }
    goHome();
  }, [goHome]);

  /**
   * The caller has already opened the mic inside its click handler.
   * `opts.drillTone` is only meaningful (and required) for `intent ===
   * "drill"` — set by ModeSelect before this fires.
   */
  const startPlay = useCallback(
    (intent: StartIntent, opts?: { drillTone?: Tone }) => {
      // The caller (PlayHome/ModeSelect) already opened the mic for this
      // gesture before calling us — bail out and release it rather than
      // starting a run the player isn't allowed to have. Drill is real,
      // scored practice like Classic, so it's gated the same way; Learn
      // isn't (see the plan: it doesn't cost a daily run).
      if ((intent === "game" || intent === "drill") && dailyLimitReached()) {
        stopMic();
        capturePostHogEvent("daily_limit_earlybird_shown", { trigger: "start" });
        openEarlyBird("daily-limit", "daily-limit");
        return;
      }
      setTutorialDone(false);
      setError(null);
      // A user-initiated start (incl. a Settings tutorial replay) never seeds
      // the grid; only the tutorial routed to from onCalibrated does.
      calibratingRef.current = false;
      setAutoStartTutorial(false);
      if (intent === "lab") {
        // Dev tooling — the Lab supplies its own fallback calibration.
        setScreen("lab");
        return;
      }
      if (intent !== "visualiser") lastModeRef.current = intent;
      drillToneRef.current = opts?.drillTone ?? null;
      if (intent === "game" || intent === "drill" || intent === "learn") {
        gameRunNumberRef.current += 1;
      }
      // Playing without calibration would map the player's voice through a
      // stranger's f0 centre. Calibrate first, then continue to the run.
      if (!settings) {
        pendingRef.current = intent;
        setScreen("calibrate");
        return;
      }
      if (intent === "game" || intent === "tutorial" || intent === "drill" || intent === "learn") {
        setGameAlive(true);
      }
      setScreen(intent);
    },
    [settings, dailyLimitReached, openEarlyBird],
  );

  /**
   * The calibration-flight TutorialDone screen's "Let's try it out" button.
   * That flight (`autoStart`) is only a range-measuring flight — a few gates
   * flown immediately, no walkthrough — not the guided teaching tutorial, so
   * this is the direct path into a real one afterward, instead of landing on
   * Play and making the player tap Tutorial themselves. `startPlay` expects
   * the mic already open (see its own comment); Game.tsx's tick() already
   * called `stopMic()` when the calibration flight ended, so this reopens it
   * itself, inside this tap's gesture — same pattern as PlayHome's `go()`.
   */
  const startTutorialFromCalibration = useCallback(async () => {
    try {
      await ensureMic();
      startPlay("tutorial");
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
      goHome();
    }
  }, [startPlay, goHome]);

  const onCalibrated = useCallback((s: CalibrationSettings) => {
    setSettings(s);
    track({ type: "calib_done" });
    // Calibration now only sites the centre and leaves a provisional ±5 board;
    // the grid's real range is measured by the tutorial that follows (up ← the
    // T1 gates, down ← the T3 gates). Route into it. `onRunOver`'s tutorial
    // branch seeds the grid from those tones, then lands on the Play screen —
    // where the player's next tap is a fresh gesture to open the mic for a real
    // run (hard rule 4: never reopen the mic without one). The pending intent
    // is dropped for that reason; the player re-taps Play.
    pendingRef.current = null;
    calibratingRef.current = true;
    setAutoStartTutorial(true);
    lastModeRef.current = "tutorial";
    setGameAlive(true);
    setScreen("tutorial");
  }, []);

  const onRunOver = useCallback((snap: RunSnapshot) => {
    // Game.tsx has already stopped the mic.
    setGameAlive(false);
    if (lastModeRef.current === "tutorial") {
      setTutorialDone(true);
      if (calibratingRef.current) {
        calibratingRef.current = false;
        setAutoStartTutorial(false);
        // Seed the grid from the tones just flown: up from the T1 gates, down
        // from the T3 gates (run.ts `measuredRange`). A null range (the player
        // stayed silent through the run) keeps the provisional ±5 board — the
        // in-game backstop corrects it over real runs.
        const seeded =
          snap.measuredRange && settings
            ? {
                ...settings,
                rangeSemitones: snap.measuredRange.up,
                rangeDownSemitones: snap.measuredRange.down,
              }
            : settings;
        if (seeded) {
          saveSettings(seeded);
          setSettings(seeded);
          trackCalibration(seeded);
        }
        // A brief loading beat so the last gate doesn't snap straight to the
        // Play screen (which read as broken). The seeding is instant; the pause
        // is for legibility. An effect advances "seeding" → "tutorialdone".
        setDoneVariant("calibration");
        setScreen("seeding");
        return;
      }
      setDoneVariant("tutorial");
      setScreen("tutorialdone");
      return;
    }
    setStats(snap.stats);
    // Drill is real, scored practice — counts the same as Classic. Learn is
    // deliberately excluded from all three (history, daily limit, streak):
    // it's unscored-pressure recognition practice, not a run the Progress
    // tab's per-tone accuracy or the free-tier counter should read as real
    // pronunciation performance.
    if (lastModeRef.current === "game" || lastModeRef.current === "drill") {
      recordRun(snap, snap.stats.hearts <= 0 ? "out_of_hearts" : "finished");
      // Only a completed run (finished or out of hearts) counts against the
      // free tier — a quit shouldn't cost the player one of their 5 daily
      // runs. See `onRunQuit` below, which deliberately does not call this.
      incrementDailyRuns();
      // Same trigger advances the local daily streak (quits don't count).
      recordPlay();
    }

    // Windowed recalibration check — see recalibration.ts. Only a completed,
    // non-tutorial run reaches here, so tutorial runs never pollute the
    // window (the early return above already routed those away).
    const tracking = recordTrackedRun(loadRecalTracking(), snap.measuredRange);
    if (tracking.samples.length >= tracking.windowSize) {
      // The first offer is the one closed off the initial window (1 game after
      // calibration); every later window is a cooldown. Drives friendlier copy.
      const isFirst = tracking.windowSize === INITIAL_TRACKING_WINDOW;
      const avg = averageRangeHalves(tracking.samples);
      const suggestion =
        avg && settings ? recalibrationSuggestion(settings, avg) : null;
      setRecalSuggestion(suggestion);
      setRecalFirst(isFirst);
      if (suggestion) track({ type: "recal_offered" });
      saveRecalTracking({ windowSize: COOLDOWN_TRACKING_WINDOW, samples: [] });
    } else {
      setRecalSuggestion(null);
      saveRecalTracking(tracking);
    }

    setScreen("gameover");
  }, [settings]);

  const retry = useCallback(async () => {
    if (
      (lastModeRef.current === "game" || lastModeRef.current === "drill") &&
      dailyLimitReached()
    ) {
      capturePostHogEvent("daily_limit_earlybird_shown", { trigger: "retry" });
      openEarlyBird("daily-limit", "daily-limit");
      return;
    }
    setError(null);
    setRetryBusy(true);
    const gen = ++navRef.current;
    try {
      // Retry is a click, so this reopens the mic inside a user gesture.
      await ensureMic();
      if (gen !== navRef.current) return; // player left while we were waiting
      if (
        lastModeRef.current === "game" ||
        lastModeRef.current === "drill" ||
        lastModeRef.current === "learn"
      ) {
        gameRunNumberRef.current += 1;
      }
      // drillToneRef is untouched — a Drill retry flies the same tone.
      setGameAlive(true);
      setScreen(lastModeRef.current);
    } catch (err) {
      if (gen !== navRef.current) return;
      setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      setScreen("play");
    } finally {
      setRetryBusy(false);
    }
  }, [dailyLimitReached, openEarlyBird]);

  /**
   * Starts the analytics client and drains anything an earlier visit failed to
   * send. Runs once — `initAnalytics` ignores repeat calls, so React's
   * strict-mode double-mount cannot register two visibility listeners.
   *
   * `landed` is recorded here rather than on a click because the interesting
   * case is the tester who arrives and does nothing: without it, they are
   * indistinguishable from someone who never opened the game. Note that since
   * the split it means "opened /app", not "visited the site" — a visit to the
   * marketing page is a `$pageview` on the other entry.
   */
  // The post-calibration loading beat: hold the "personalising your grid"
  // screen briefly, then land on the tutorial success screen. Cleared if the
  // screen changes first.
  useEffect(() => {
    if (screen !== "seeding") return;
    const t = setTimeout(() => setScreen("tutorialdone"), 2800);
    return () => clearTimeout(t);
  }, [screen]);

  useEffect(() => {
    initAnalytics();
    // Traffic analytics, deliberately separate from the gameplay pipeline
    // above — see src/analytics/posthog.ts. Pageviews only, same consent flag.
    initPostHog(loadShareData());
    track({ type: "landed" });
    // Re-report the saved calibration each visit, so a session that skips
    // calibration (because it already ran) still carries the voice numbers its
    // gate results have to be read against.
    const saved = loadSettings();
    if (saved) trackCalibration(saved);
    // The clip inventory, started here so it has landed by the time a run is
    // constructed — the Run needs its words synchronously, at the moment the
    // first gates spawn. A failure resolves to an empty inventory and the game
    // falls back to the tuning defaults; nothing here can block a run.
    void loadInventory();
  }, []);

  /**
   * Nav-tab clicks.
   *
   * Mid-run (`gameAlive`), every tab — including Play itself — has to leave
   * the hidden `<Game>` in a state it can come back to: `gameRef.current
   * .pause()` freezes its loop and suspends (never stops) the mic, so the
   * `Run` and its score/hearts/gates survive underneath whatever screen the
   * player looks at next. Tapping Play again goes straight back to the
   * paused run (`lastModeRef.current`, "game" or "tutorial") instead of
   * `PlayHome` — there's a run to resume, not a new one to start.
   *
   * Visualiser is the one tab that needs a live mic feed of its own — this
   * click is its gesture (iOS Safari grants `getUserMedia`/`resume()` only
   * inside one), whether or not the player has calibrated yet: uncalibrated
   * routes through the calibration gate first, calibrated goes straight
   * there. `ensureMic()` is a no-op if a session is already open (including
   * one just suspended by pausing a live game), so this is safe to call
   * every time; the explicit `resume()` after it is what actually wakes a
   * suspended context back up; Visualiser has no such call of its own since
   * it never expected to inherit an already-suspended session.
   *
   * Every other tab has no business holding the mic open when there is no
   * run to protect — it releases one if a session exists, rather than
   * leaving it (and its OS-level indicator) running in the background while
   * browsing Settings/Profile/Progress. Screens that need it later for their
   * own reasons (Play's buttons, Settings' recalibrate/tutorial links) open
   * a fresh one themselves, inside their own click handler.
   */
  /**
   * Opens (or reuses) the mic session and lands on the Visualiser screen —
   * shared by the nav bar's own click and the intent-arrival tap gate below,
   * so there is exactly one place that knows how to get there.
   */
  const openVisualiser = useCallback(() => {
    setError(null);
    if (gameAlive) gameRef.current?.pause();
    if (!settings) pendingRef.current = "visualiser";
    void ensureMic()
      .then(async () => {
        const audio = getMicSession()?.ctx;
        if (audio && audio.state === "suspended") await audio.resume();
        setVisualiserMicReady(true);
        setScreen(settings ? "visualiser" : "calibrate");
      })
      .catch((err) => {
        pendingRef.current = null;
        if (!(err instanceof MicCancelled)) {
          // The error banner only has a slot on the Play tab, so land
          // there to show it rather than failing silently wherever the
          // player asked for Visualiser from.
          setScreen("play");
          setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
        }
      });
  }, [settings, gameAlive]);

  const onNavigate = useCallback(
    (tab: NavTab) => {
      if (tab === "visualiser") {
        openVisualiser();
        return;
      }
      if (gameAlive) {
        gameRef.current?.pause();
        setScreen(tab === "play" ? lastModeRef.current : tab);
        return;
      }
      stopMic();
      setScreen(tab);
    },
    [gameAlive, openVisualiser],
  );

  return (
    <div className="app app-game">
      <GameNav active={navTabFor(screen)} onNavigate={onNavigate} />
      <div className="app-main" ref={mainRef}>
        <div className="frame">
          {screen === "play" && (
            <PlayHome
              calibrated={settings !== null}
              tutorialDone={tutorialDone}
              error={error}
              onStart={startPlay}
              onModes={() => setScreen("modes")}
              canvasWidth={CANVAS_W}
              canvasHeight={GAME_CANVAS_H}
            />
          )}

          {screen === "modes" && (
            <ModeSelect
              error={error}
              onStart={startPlay}
              onBack={() => setScreen("play")}
              canvasWidth={CANVAS_W}
              canvasHeight={GAME_CANVAS_H}
            />
          )}

        {screen === "seeding" && (
          <Loading label="We're personalising your grid for you…" />
        )}

        {screen === "tutorialdone" && (
          <TutorialDone
            variant={doneVariant}
            onDone={
              doneVariant === "calibration"
                ? () => void startTutorialFromCalibration()
                : goHome
            }
            canvasWidth={CANVAS_W}
            canvasHeight={GAME_CANVAS_H}
          />
        )}

        {screen === "howto" && <HowTo onBack={() => setScreen("settings")} />}

        {screen === "progress" && (
          <Progress onEarlyBird={(feature) => openEarlyBird("progress", feature)} />
        )}

        {screen === "profile" && (
          <Profile onEarlyBird={(feature) => openEarlyBird("profile", feature)} />
        )}

        {screen === "settings" && (
          <Settings
            settings={settings}
            onBack={() => setScreen("play")}
            onRecalibrate={() => {
              pendingRef.current = null;
              setScreen("calibrate");
            }}
            onFineTune={() => setScreen("finetune")}
            onForget={() => setSettings(null)}
            onTutorial={() => startPlay("tutorial")}
            onHowTo={() => setScreen("howto")}
          />
        )}

        {screen === "visualiser" && settings && visualiserMicReady && (
          // Same dimensions PlayHome gets (CANVAS_W x GAME_CANVAS_H) so the
          // .frame this renders into is pixel-identical to Play's — no
          // separate constants, no separate CSS formula. See the
          // `.visualiser-screen.game-stage` rule in App.css.
          <Visualiser settings={settings} canvasWidth={CANVAS_W} canvasHeight={GAME_CANVAS_H} />
        )}

        {screen === "visualiser" && settings && !visualiserMicReady && (
          // Only reached via `?intent=visualiser` from the landing page,
          // which arrives here with no click behind it (hard rule 4) —
          // `<Visualiser>` itself assumes the mic is already open, so it
          // can't be mounted yet. This tap is the real gesture; it hands off
          // to the same `openVisualiser()` the nav bar uses.
          <div
            className="screen stage game-stage"
            style={{ width: CANVAS_W, height: GAME_CANVAS_H }}
          >
            <div className="overlay" onClick={openVisualiser}>
              <p>Tap to start</p>
            </div>
          </div>
        )}

        {screen === "lab" && Lab && (
          <Suspense fallback={<p className="note">loading lab…</p>}>
            <Lab onBack={goHome} />
          </Suspense>
        )}

        {screen === "calibrate" && (
          <Calibration
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            onDone={onCalibrated}
            onSaved={setSettings}
            onCancel={goHome}
          />
        )}

        {/* Settings → Fine-tune: the live preview and the sensitivity slider,
            seeded from what is already saved. Not part of the first run. */}
        {screen === "finetune" && settings && (
          <Calibration
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            startAt="preview"
            existing={settings}
            onDone={(s) => {
              setSettings(s);
              setScreen("settings");
            }}
            onSaved={setSettings}
            onCancel={() => setScreen("settings")}
          />
        )}

        {/* Deliberately not inside the screen === "x" chain above: this has
            to stay mounted, just hidden, whenever a run is alive so that
            switching to another nav tab (or the mobile-resize dance a tab
            switch also triggers) never tears the Run down — see gameAlive's
            own comment and onNavigate. `hidden` (a plain `display: none` on
            Game's own root, not a wrapper — see its prop comment) rather
            than removing it, and it owns no key: the only way `gameAlive`
            goes false-then-true again is a genuinely new run (see
            startPlay/retry/onCalibrated), which already unmounts and
            remounts this by leaving and re-entering the tree. */}
        {gameAlive && settings && (
          <Game
            ref={gameRef}
            hidden={
              !(
                screen === "game" ||
                screen === "tutorial" ||
                screen === "drill" ||
                screen === "learn"
              )
            }
            mode={lastModeRef.current}
            drillTone={drillToneRef.current ?? undefined}
            autoStart={autoStartTutorial}
            settings={settings}
            canvasWidth={CANVAS_W}
            canvasHeight={GAME_CANVAS_H}
            onOver={onRunOver}
            onQuit={onRunQuit}
            runNumber={gameRunNumberRef.current}
          />
        )}

        {screen === "gameover" && stats && (
          <GameOver
            stats={stats}
            busy={retryBusy}
            onRetry={() => void retry()}
            onHome={goHome}
            onFineTune={() => setScreen("finetune")}
            onVisualiser={() => onNavigate("visualiser")}
            settings={settings}
            suggestion={recalSuggestion}
            suggestionIsFirst={recalFirst}
            onRecalibrate={setSettings}
          />
        )}
        </div>
      </div>
      {earlyBird && (
        <EarlyBirdModal
          surface={earlyBird.surface}
          feature={earlyBird.feature}
          onClose={() => setEarlyBird(null)}
        />
      )}
    </div>
  );
}
