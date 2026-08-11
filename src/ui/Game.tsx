import { useCallback, useEffect, useRef, useState } from "react";
import { flush, track } from "../analytics/client.ts";
import { gateEvent, type RunEndReason } from "../analytics/session.ts";
import {
  cueDurationMsFor,
  isCueAudible,
  loadClip,
  playToneCue,
} from "../audio/reference.ts";
import { inventoryNow, loadInventory } from "../audio/inventory.ts";
import { getMicSession, setFrameSink, stopMic } from "../audio/session.ts";
import { GATE_LOG_ENABLED, saveGateLog } from "../dev/gateLog.ts";
import { publishState, setActiveTracker } from "../game/activeTracker.ts";
import { TONE_INFO } from "../game/gates.ts";
import { Run, type RunMode, type RunSnapshot } from "../game/run.ts";
import type { GateOutcome, UnheardHint } from "../game/scoring.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadNoticeSeen,
  loadPace,
  loadShowTranslation,
  saveNoticeSeen,
  type CalibrationSettings,
} from "../game/settings.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawWorld, refreshMotionPreference } from "../render/world.ts";
import { GearIcon, HeartIcon, PauseIcon, PlayIcon } from "./icons.tsx";
import { PauseOptions } from "./PauseOptions.tsx";

/** HUD refresh rate. React never renders per frame — the rAF loop owns the canvas. */
const HUD_HZ = 4;
/** "Your turn" flashes while the active gate is in its first stretch. */
const YOUR_TURN_MAX_T = 0.5;
/** How long the "couldn't hear that" toast stays up. */
const TOAST_MS = 1200;

/** What the HUD reacts to when a gate resolves. */
interface OutcomeFlash {
  outcome: GateOutcome;
  points: number;
  hint: UnheardHint | null;
  /** Resolve time, used as a React key so repeats re-trigger the animation. */
  atMs: number;
}

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

interface Props {
  mode: RunMode;
  settings: CalibrationSettings;
  canvasWidth: number;
  canvasHeight: number;
  onOver: (snapshot: RunSnapshot) => void;
  onQuit: () => void;
  /** Leave the run for the landing page. Offered only from the pause menu. */
  onLanding: () => void;
}

export function Game({
  mode,
  settings,
  canvasWidth,
  canvasHeight,
  onOver,
  onQuit,
  onLanding,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
   * The tutorial waits behind a card rather than starting on mount.
   *
   * Two reasons: the first gate arrives before a first-time player has worked
   * out what they are looking at, and the card's button is a user gesture —
   * the iOS-safe place to resume the AudioContext.
   */
  const [waiting, setWaiting] = useState(mode === "tutorial");
  /**
   * The one-time "still in testing" notice, which holds a real run the same way
   * the tutorial card does. Decided once at mount and kept in a ref as well as
   * state, because the run effect reads it without wanting it as a dependency —
   * dismissing the card must start the run, not rebuild it.
   *
   * Not shown before the tutorial: that is a first-timer's first screen, and a
   * disclosure about data is easier to read once they know what the game is.
   */
  const [notice, setNotice] = useState(
    () => mode !== "tutorial" && !loadNoticeSeen(),
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
  /**
   * The last resolved gate, pushed once when it resolves rather than polled.
   *
   * The HUD samples at HUD_HZ (4), which is fine for score and hearts but
   * would land a reaction up to 250ms after the thing it is reacting to. This
   * fires from the rAF loop instead — once per gate, so it is still an event,
   * not a per-frame render.
   */
  const [flash, setFlash] = useState<OutcomeFlash | null>(null);
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
   * Closes out a run. `flush` is deliberately not awaited — the player is on
   * their way to the game-over screen or the title, and the send is already
   * durable in localStorage whether or not it completes.
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
      void flush();
    },
    [reportGates],
  );

  /**
   * The pause menu's two exits. Neither goes through `onOver`, so without this
   * a quit left no trace at all — and quitting is precisely the signal that
   * says the game got too hard or too boring.
   */
  const exitRun = useCallback(
    (go: () => void) => () => {
      const snap = runRef.current?.snapshot();
      if (snap) reportRunEnd(snap, "quit");
      go();
    },
    [reportRunEnd],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    // Logical drawing space stays canvasWidth x canvasHeight; only the backing
    // store is density-scaled, so gameplay geometry is unchanged.
    const ctx2d = canvas ? scaleForDpr(canvas, canvasWidth, canvasHeight) : null;
    if (!canvas || !ctx2d) return;

    // Game remounts per run, so this picks up the latest saved pace — and the
    // latest motion preference, which the renderer caches.
    refreshMotionPreference();

    const pace = loadPace();
    const corridor = loadCorridorWidth();
    const cueStyle = loadCueStyle();
    const run = new Run({
      mode,
      width: canvasWidth,
      pace,
      corridor,
      cueStyle,
      // Queried at cue time — clips finish loading after the Run exists.
      cueDurationMsFor,
      // Whatever the manifest fetch has produced by now. Empty is a valid run:
      // it flies the tuning defaults with synthetic cues.
      words: inventoryNow() ?? [],
    });
    runRef.current = run;
    reportedGatesRef.current = 0;
    // The settings are stamped on the run rather than the session: a player who
    // widens the corridor mid-session would otherwise have their easier run
    // read against the harder one's settings.
    track({ type: "run_start", mode, pace, corridor, cue: cueStyle });
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

    // The mic is already open — Title opened it inside the click gesture.
    setFrameSink((frame, sampleRate) => {
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
      run.tickAudio(pitch, performance.now());
    });

    const tick = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      run.tickFrame(dt, now);
      const snap = run.snapshot();
      drawWorld(ctx2d, canvasWidth, canvasHeight, snap);

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
          atMs: resolved.atMs,
        });
      }

      if (snap.cue && snap.cue.xStart > lastPlayedXStart) {
        lastPlayedXStart = snap.cue.xStart;
        const audio = getMicSession()?.ctx;
        // Same context the mic runs on, so it is already gesture-resumed.
        if (audio && audio.state === "running") {
          playToneCue(
            audio,
            snap.cue.tone,
            settings.f0Center,
            settings.rangeSemitones,
            snap.cue.word,
            settings.rangeDownSemitones,
          );
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
      setPaused(true);
    };
    pauseRef.current = pause;

    resumeRef.current = () => {
      const audio = getMicSession()?.ctx;
      // resume() is called from the overlay's click handler — iOS needs that.
      if (audio && audio.state === "suspended") void audio.resume();
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
    // The tutorial holds behind its card; a first real run holds behind the
    // testing notice. Everything else starts now.
    if (mode !== "tutorial" && !noticeRef.current) start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(hudTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameSink(null);
      setActiveTracker(null);
      runRef.current = null;
    };
    // reportGates/reportRunEnd are stable (useCallback with no changing deps),
    // so listing them cannot rebuild the run mid-play.
  }, [mode, settings, canvasWidth, canvasHeight, reportGates, reportRunEnd]);

  // Show the *active* gate's tone while flying it — showing the next gate's
  // tone mid-gate would teach the wrong contour (this matters most in the
  // tutorial, where the cue text is the lesson).
  const displayTone = hud?.activeGate?.tone ?? hud?.upcoming?.tone ?? null;
  // The word being flown, when there is one. Its own pinyin and hanzi — the
  // tone's stand-in `ma` is only what a gate without a clip can say.
  const displayWord = hud?.activeGate?.word ?? hud?.upcoming?.word ?? null;
  const info = displayTone === null ? null : TONE_INFO[displayTone];

  // Listen → Your turn: "listen" spans the whole cue phase; "your turn" only
  // flashes over the active gate's first stretch, then clears the screen.
  const banner =
    hud?.phase === "listen"
      ? ("listen" as const)
      : hud?.phase === "active" &&
          (hud.activeGate?.t ?? 1) < YOUR_TURN_MAX_T
        ? ("your-turn" as const)
        : null;

  const showPoints = flash !== null && flash.points > 0;
  const showHint = flash?.outcome === "unheard";
  const breaking = flash?.outcome === "collision";
  const hearts = Math.max(0, hud?.hearts ?? 3);

  return (
    <div className="screen game-screen">
      <div className="stage">
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
            {mode === "game" && (
              <span className="hearts">
                {Array.from({ length: hearts }, (_, i) => (
                  <span key={i} className="heart">
                    <HeartIcon filled />
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
            {mode === "game" && (hud?.comboMult ?? 1) > 1 && (
              <span className="combo">×{hud?.comboMult}</span>
            )}
            {/* In the row rather than absolutely positioned over it: floated
                top-right it sat on top of the hearts, which are also
                right-aligned. */}
            {!waiting && !notice && !paused && (
              <div className="hud-controls">
                <button
                  className="hud-button"
                  onClick={() => pauseRef.current(true)}
                  title="Game options"
                  aria-label="Game options"
                >
                  <GearIcon />
                </button>
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

          {info && displayTone !== null && (
            <div className="hud-syllable">
              {showTranslation && displayWord?.english && (
                <span className="english">{displayWord.english}</span>
              )}
              <span className="syllable">{displayWord?.pinyin ?? info.pinyin}</span>
              <span className="hanzi">{displayWord?.hanzi ?? info.hanzi}</span>
              <span className="tone-num">({displayTone})</span>
              {mode === "tutorial" && <span className="cue">{info.cue}</span>}
            </div>
          )}

          {/* Bottom-of-stage status line: the same cue copy the tutorial
              shows inline, made available on every mode. Pinned to the
              bottom of the flex `.hud` column (margin-top: auto) so it
              never competes with the score/hearts row up top. */}
          {info && displayTone !== null && (
            <div className="hud-status">
              say {info.pinyin} — {info.cue}
            </div>
          )}

          {banner === "listen" && (
            <div className="phase-banner listen">🔊 listen…</div>
          )}
          {banner === "your-turn" && (
            <div className="phase-banner your-turn">your turn!</div>
          )}

          {showHint && (
            <div key={flash!.atMs} className="toast unheard-toast">
              {HINT_TEXT[flash!.hint ?? "generic"]}
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

        {/* Shown once, ever. A notice rather than a consent gate: sharing is
            already on, and the button only makes the card stop coming back.
            Its click is also a user gesture, which is the iOS-safe place to
            resume the AudioContext — the same reason the tutorial card works. */}
        {notice && (
          <div className="overlay tutorial-card">
            <h3>Still in testing</h3>
            <p>
              I'm sending anonymous data about how the game goes — which gates
              you hit or miss, and how your voice maps to the screen — so I can
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

        {waiting && (
          <div className="overlay tutorial-card">
            <h3>Tutorial</h3>
            <p>
              Eight gates, one tone at a time. No score, no hearts, and twice
              the room.
            </p>
            <p className="note">
              Listen to the example, then say it. The dot follows your pitch.
            </p>
            <button
              className="primary"
              onClick={() => {
                setWaiting(false);
                startRef.current();
              }}
            >
              Start
            </button>
          </div>
        )}

        {/* The pause menu. Deliberately not dismissable by tapping the
            backdrop: there are controls under here now, and a mis-tap that
            drops you back into a moving corridor is worse than one more tap. */}
        {paused && (
          <div className="overlay pause-menu">
            <p className="pause-title">Paused</p>
            <button
              className="primary resume-button"
              onClick={() => resumeRef.current()}
            >
              <PlayIcon />
              Resume
            </button>

            {optionsOpen ? (
              <PauseOptions
                onCueStyle={(style) => runRef.current?.setCueStyle(style)}
                onShowTranslation={setShowTranslation}
              />
            ) : (
              /* The way in from a plain pause, and from the tab-hidden one.
                 Named for what it changes rather than "Settings", which in
                 this app is the mic-calibration screen. */
              <button
                className="options-reveal"
                onClick={() => setOptionsOpen(true)}
              >
                <GearIcon />
                Speed, width, translation &amp; example
              </button>
            )}

            <div className="pause-exits">
              <button
                className="mic-stop"
                onClick={exitRun(onQuit)}
                title="End the run"
              >
                ■ quit
              </button>
              {/* The nav bar is hidden during a run, so this is the way back
                  to the site from inside one. It ends the run — there is
                  nothing to come back to. */}
              <button className="link" onClick={exitRun(onLanding)}>
                home page
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
