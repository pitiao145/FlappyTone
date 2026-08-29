import { useEffect, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { getMicSession, setFrameSink } from "../audio/session.ts";
import {
  configureTracker,
  getLatestState,
  getTracker,
  handleFrame,
  startLoop,
} from "../game/loop.ts";
import {
  resetRecalTracking,
  saveSettings,
  type CalibrationSettings,
} from "../game/settings.ts";
import {
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_UP_SEMITONES_MIN,
  computeF0Center,
  computeNoiseFloor,
  computeRangeHalves,
  type RangeHalves,
} from "../pitch/calibration.ts";
import { rmsOf } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchTrackerConfig } from "../pitch/types.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";

const QUIET_MS = 1000;

/*
 * The talk and sweep steps wait for the player instead of running a clock.
 *
 * They used to be a 6s and two 3s countdowns, which start the moment the screen
 * appears — so the timer is already draining while the instruction is still
 * being read, and someone who takes a breath first gets measured on whatever
 * they managed in the remainder. These targets are amounts of *voiced* audio:
 * the meter fills only while you are actually making a sound, and the step ends
 * when there is enough of it. Silence costs nothing but time.
 */

/**
 * Move the up half to `up`, carrying the down half at the ratio the sweeps
 * measured, so one slider retunes a two-sided board without flattening it.
 * Ratio, not offset: the halves are a shape, and scaling preserves it.
 */
function scaleHalves(current: RangeHalves, up: number): RangeHalves {
  const ratio = current.up > 0 ? current.down / current.up : 1;
  const down = Math.round(up * ratio * 2) / 2;
  return {
    up,
    down: Math.min(
      RANGE_SEMITONES_MAX,
      Math.max(RANGE_DOWN_SEMITONES_MIN, down),
    ),
  };
}

function sameHalves(a: RangeHalves, b: RangeHalves): boolean {
  return a.up === b.up && a.down === b.down;
}

/** A two- or three-digit number to read aloud. Never the same one twice running. */
function randomReadout(last: string | null): string {
  let next: string;
  do {
    next = String(Math.floor(10 + Math.random() * 890));
  } while (next === last);
  return next;
}

/**
 * Voiced speech needed to site the centre of someone's range.
 *
 * Was 2500, raised to 8000 (17 Aug 2026) chasing a biased f0Center sample —
 * but that fix was really `TALK_RMS_MULT` (below), which stopped discarding
 * normal-volume speech in the first place. Once the gate stopped throwing
 * samples away, 8s of *required* voiced speech just made the step feel
 * endless without adding real accuracy — reported directly ("f0 calibration
 * still takes way too long"). Landing at 4000 keeps more than double the
 * original sample size while giving the looser gate room to work.
 */
const TALK_VOICED_MS = 4000;
// Looser than the default 3: the primary gate is tuned to reject background
// noise during gameplay, but that same strictness throws away most of a
// normal-volume "just talk" sample and keeps only the loudest, often
// higher-pitched moments — biasing f0Center upward. f0Center only needs a
// fair sample here, not noise rejection under a scrolling game.
const TALK_RMS_MULT = 1.5;
/**
 * Gap between two voiced frames that still counts as continuous phonation.
 * Anything longer is a pause, and pauses are not part of the measurement.
 */
const VOICED_GAP_MS = 60;
/** Silence this long, with nothing heard yet, earns a nudge — never a failure. */
const NUDGE_AFTER_MS = 7000;

/** How long a "Got it." sits on screen before the next instruction. */
const CONFIRM_MS = 900;
/**
 * How long one flashed number sits before the next, during "talk".
 *
 * Replaced "count to ten / say your breakfast" as the prompt: those ask the
 * player to compose something, which is exactly the kind of freeze a blank
 * "say something" prompt causes. A number on screen needs no thought — just
 * read it — and reading numbers still produces normal, varied-pitch speech,
 * which is all this step needs.
 */
const NUMBER_FLASH_MS = 1700;

type Step = "quiet" | "talk" | "done" | "preview";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  onDone: (settings: CalibrationSettings) => void;
  /**
   * Fires the instant a fresh calibration is auto-saved (arrival at "done"),
   * separate from `onDone` because `onDone` also navigates away — firing it
   * early would skip the "you're all set" confirmation the player never
   * asked to skip. This exists purely to keep the app's in-memory settings in
   * sync with what just hit localStorage, so a screen seeded from in-memory
   * state (Settings → Fine-tune) can't show stale numbers just because the
   * player navigated away before tapping "Start playing".
   */
  onSaved?: (settings: CalibrationSettings) => void;
  onCancel: () => void;
  /**
   * Where to start. "preview" is Settings' Fine-tune: it skips the capture and
   * goes straight to the live dot and the sensitivity slider, seeded from
   * `existing`. Omit for the first-run flow.
   */
  startAt?: Step;
  /** The saved calibration, required when `startAt` is "preview". */
  existing?: CalibrationSettings | null;
}

/**
 * Accumulates how much *voiced* audio has been heard, in wall-clock ms.
 *
 * Frame timestamps rather than a frame count, because the analysis hop is the
 * audio layer's business and this module should not have to know it. A gap
 * longer than VOICED_GAP_MS is a pause between utterances and is not counted,
 * so "talk for a couple of seconds" cannot be satisfied by two seconds of
 * saying nothing with a cough at each end.
 */
function makeVoicedClock() {
  let total = 0;
  let last: number | null = null;
  return {
    tick(now: number): void {
      if (last !== null) total += Math.min(now - last, VOICED_GAP_MS);
      last = now;
    },
    get ms(): number {
      return total;
    },
  };
}

/**
 * Calibration: quiet → talk normally → reach low → reach high → you're all set.
 *
 * This replaced PRD §5.4's "say **ma** three times", which asked a beginner to
 * perform a syllable from the language they are here to learn, and inferred
 * their range from whatever excursion three flat syllables happened to
 * contain. Normal speech gives a better f0 centre — more voiced frames, and
 * the register they actually talk in — and asking them to reach, once in each
 * direction, *measures* the range instead of guessing it.
 *
 * Two rules govern the copy, and they are why this reads shorter than it used
 * to. **Each step is one instruction plus one example to imitate** — "as low as
 * you comfortably can" is an instruction to interpret, "like a sleepy ohhhh" is
 * a thing to copy. **Nothing runs on a clock** except the one second of silence
 * — every other step waits for the player and ends when it has heard enough,
 * so reading the instruction costs nothing. And **nothing is explained**: no Hz, no semitones, no
 * account of what is being measured. A first-time player has no basis to judge
 * a sensitivity slider, so they are no longer shown one; the live preview and
 * its numbers moved to Settings → Fine-tune (`startAt="preview"`), for the
 * people who go looking.
 */
export function Calibration({
  canvasWidth,
  canvasHeight,
  onDone,
  onSaved,
  onCancel,
  startAt = "quiet",
  existing = null,
}: Props) {
  const [step, setStep] = useState<Step>(startAt);
  /** Bumped to retry a capture step without leaving it. */
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  /** The number currently flashed for the "talk" step to read aloud. */
  const [readout, setReadout] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState<number | null>(
    existing?.noiseFloor ?? null,
  );
  const [f0Center, setF0Center] = useState<number | null>(
    existing?.f0Center ?? null,
  );
  /**
   * The two halves of the board. Separate, because a speaking voice sits near
   * the bottom of its own range — see `semitonesToChao`.
   */
  const [range, setRange] = useState<RangeHalves>({
    up: existing?.rangeSemitones ?? RANGE_SEMITONES,
    down: existing?.rangeDownSemitones ?? existing?.rangeSemitones ?? RANGE_SEMITONES,
  });
  /**
   * A one-word acknowledgement, and the step it leads to.
   *
   * The player is never told what is being measured — Hz and semitones mean
   * nothing to someone here to learn a tone, and explaining them turns a
   * 15-second setup into a lecture. They get confirmation that the last thing
   * worked, and nothing else.
   *
   * It is *state*, with its own effect below, rather than a timer owned by the
   * step effect. The step effect depends on noiseFloor and f0Center, so the
   * very act of recording a measurement re-ran it — and its cleanup cancelled
   * the pending timer, leaving the flow stuck on "Thanks." for good.
   */
  const [confirm, setConfirm] = useState<{ word: string; next: Step } | null>(
    null,
  );
  /** Range the preview thinks fits this voice, or null until enough is heard. */
  const [fit, setFit] = useState<RangeHalves | null>(null);
  /** Every voiced semitone seen during preview. A ref: this fills at frame rate. */
  const observedRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Backgrounding mid-capture would let the timers run against a mic nobody is
  // talking into, poisoning the measurement. Suspend the audio and abandon the
  // step; resuming restarts it from the beginning.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      setFrameSink(null);
      void getMicSession()?.ctx.suspend();
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const resume = () => {
    const audio = getMicSession()?.ctx;
    // resume() must happen in this click handler — iOS Safari requires it.
    if (audio && audio.state === "suspended") void audio.resume();
    setPaused(false);
    setProgress(0);
    setHint(null);
    // Backgrounding mid-acknowledgement abandons the step it was going to
    // advance to; resuming re-runs the step, so the word must not linger.
    setConfirm(null);
    // Bumping the attempt re-runs the current step's effect from scratch.
    setAttempt((a) => a + 1);
  };

  /** Acknowledge, then move on. The effect below owns the timing. */
  const advance = (word: string, next: Step): void =>
    setConfirm({ word, next });

  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => {
      setStep(confirm.next);
      setConfirm(null);
    }, CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirm]);

  /**
   * Which step the player is on, reported as they arrive.
   *
   * This is the drop-off funnel: calibration is four things asked of someone
   * who has not played yet, and the step they stop at says which request was
   * the one too many. Reported on arrival rather than completion so the last
   * event is the step they were looking at when they left.
   */
  useEffect(() => {
    track({ type: "calib_step", step });
  }, [step]);

  // Step machine. Each step installs its own frame sink and tears it down.
  useEffect(() => {
    // Nothing is captured during the acknowledgement — without this the
    // measurement that produced it would immediately restart underneath.
    if (paused || confirm) return;

    if (step === "quiet") {
      const rms: number[] = [];
      setFrameSink((frame) => rms.push(rmsOf(frame)));
      const started = performance.now();
      const ticker = setInterval(
        () =>
          setProgress(Math.min(1, (performance.now() - started) / QUIET_MS)),
        50,
      );
      const timer = setTimeout(() => {
        setNoiseFloor(computeNoiseFloor(rms));
        setProgress(0);
        advance("Thanks.", "talk");
      }, QUIET_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
        setFrameSink(null);
      };
    }

    if (step === "talk") {
      const f0s: number[] = [];
      const heard = makeVoicedClock();
      let tracker: PitchTracker | null = null;
      setFrameSink((frame, sampleRate) => {
        tracker ??= new PitchTracker(
          noiseFloor === null
            ? { sampleRate, rmsMult: TALK_RMS_MULT }
            : { sampleRate, noiseFloor, rmsMult: TALK_RMS_MULT },
        );
        const p = tracker.push(frame);
        if (p.voiced && p.f0 !== null) {
          f0s.push(p.f0);
          heard.tick(performance.now());
        }
      });
      const started = performance.now();
      setReadout(randomReadout(null));
      let lastReadout: string | null = null;
      // 20Hz: the meter reacts to the voice, and the step ends when the meter
      // is full. No clock is running against the player.
      const ticker = setInterval(() => {
        setProgress(Math.min(1, heard.ms / TALK_VOICED_MS));
        if (heard.ms === 0 && performance.now() - started > NUDGE_AFTER_MS) {
          setHint("Take your time, I'm still listening.");
        }
        if (heard.ms < TALK_VOICED_MS) return;
        clearInterval(ticker);
        clearInterval(flasher);
        setProgress(0);
        const centre = computeF0Center(f0s);
        if (centre === null) {
          // Never blame the player — the app failed to hear, not the speaker.
          setFrameSink(null);
          setHint("Couldn't hear that, let's try again.");
          return;
        }
        setHint(null);
        setF0Center(centre);
        // The high/low reach sweeps are gone: the grid's up/down halves are no
        // longer measured here but from the calibration tutorial's real T1/T3
        // gates (see run.ts `measuredRange`, seeded in GameApp). This step now
        // only sites the centre, then hands off with the provisional ±5 board.
        advance("Got it.", "done");
      }, 50);
      // Its own slower clock: the number is there to give the voice something
      // to read, not to time the step. Tying it to the 20Hz ticker would
      // flash a fresh one on the same beat progress redraws.
      const flasher = setInterval(() => {
        setReadout((cur) => {
          lastReadout = randomReadout(cur ?? lastReadout);
          return lastReadout;
        });
      }, NUMBER_FLASH_MS);
      return () => {
        clearInterval(ticker);
        clearInterval(flasher);
        setFrameSink(null);
      };
    }

    // "done" captures nothing: the numbers are already in state and saved by
    // the effect below. Nothing to install, nothing to tear down.
    if (step === "done") return;

    // preview: the Step-0 free-play dot, driven by the tracker we just calibrated.
    const cfg: Partial<PitchTrackerConfig> = {
      rangeSemitones: range.up,
      rangeDownSemitones: range.down,
    };
    if (f0Center !== null) cfg.f0Center = f0Center;
    if (noiseFloor !== null) cfg.noiseFloor = noiseFloor;
    configureTracker(cfg);
    // Cleared here, not via setState: the interval below re-derives `fit` from
    // this within 250ms, and an empty capture yields null anyway.
    observedRef.current = [];
    setFrameSink((frame, sampleRate) => {
      handleFrame(frame, sampleRate);
      const latest = getLatestState();
      if (latest.voiced && latest.semitones !== null) {
        observedRef.current.push(latest.semitones);
      }
    });
    // The fine-tune canvas is NOT the full-bleed game canvas: it flexes to
    // whatever height the note + slider + buttons leave (see App.css's
    // `.calibrate-preview-stage`). So the loop must draw at the box's real,
    // laid-out size — measured live like the Visualiser does — not at the
    // fixed CANVAS_W/H props, or the dot's grid would be drawn for a size the
    // canvas isn't. A one-time measure would miss chrome show/hide and
    // rotation; a ResizeObserver tracks both.
    const canvas = canvasRef.current;
    let stopLoop: (() => void) | null = null;
    const relayout = () => {
      if (!canvas) return;
      const w = Math.round(canvas.clientWidth);
      const h = Math.round(canvas.clientHeight);
      if (w === 0 || h === 0) return;
      stopLoop?.();
      stopLoop = startLoop(canvas, w, h);
    };
    const ro = canvas ? new ResizeObserver(relayout) : null;
    if (ro && canvas) ro.observe(canvas);
    else relayout();
    // 4Hz, not per frame — the suggestion is UI, and the loop stays outside React.
    const suggesting = setInterval(
      () => setFit(computeRangeHalves(observedRef.current)),
      250,
    );
    return () => {
      clearInterval(suggesting);
      ro?.disconnect();
      stopLoop?.();
      setFrameSink(null);
    };
    // `range` is deliberately excluded: the slider retunes the live tracker in
    // place (setRangeSemitones) rather than restarting the preview loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    attempt,
    paused,
    confirm,
    noiseFloor,
    f0Center,
    canvasWidth,
    canvasHeight,
  ]);

  const settingsNow = (): CalibrationSettings | null =>
    f0Center === null || noiseFloor === null
      ? null
      : {
          f0Center,
          noiseFloor,
          rangeSemitones: range.up,
          rangeDownSemitones: range.down,
        };

  const save = () => {
    const s = settingsNow();
    if (!s) return;
    // The first-run flow hands straight to the calibration tutorial, which
    // auto-starts (no card). This click is the iOS-safe gesture, so resume the
    // AudioContext here rather than relying on a later, gesture-less start.
    const audio = getMicSession()?.ctx;
    if (audio && audio.state === "suspended") void audio.resume();
    saveSettings(s);
    // A real visit here — first-run flow or Settings -> Fine-tune — is what
    // starts a fresh, short tracking window; see recalibration.ts.
    resetRecalTracking();
    onDone(s);
  };

  // Persist on *arrival* at the last card rather than on its button: someone
  // who closes the tab there has still done the work, and making them redo it
  // because they never pressed a button would be the app's fault, not theirs.
  // `onSaved` fires here too — without it, a player who navigates away before
  // tapping "Start playing" leaves the app's in-memory settings pointing at
  // the *previous* calibration while localStorage already has the new one,
  // and anything seeded from in-memory state (Fine-tune) shows stale numbers
  // until a full reload.
  useEffect(() => {
    if (step !== "done") return;
    const s = settingsNow();
    if (s) {
      saveSettings(s);
      resetRecalTracking();
      onSaved?.(s);
    }
    // settingsNow closes over the three values in the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, f0Center, noiseFloor, range]);

  /**
   * The slider stays one control over a board with two halves: it moves the
   * up half, and the down half follows at the ratio the sweeps measured. A
   * second slider would ask the player to reason about a board shape they were
   * never told they had, and the ratio is the part the measurement is for.
   */
  const applyRange = (next: RangeHalves) => {
    setRange(next);
    getTracker()?.setRangeSemitones(next.up, next.down);
  };

  return (
    <div
      className={`screen calibrate-screen${step === "preview" ? " is-preview" : ""}`}
    >
      <h2>Calibration</h2>

      {confirm && <p className="big confirm">{confirm.word}</p>}

      {step === "quiet" && !confirm && (
        <>
          <p className="big">One second of quiet, please.</p>
          <Meter value={progress} />
        </>
      )}

      {step === "talk" && !confirm && (
        <>
          <p className="note">Just talk normally — read these out loud.</p>
          <p className="big readout">{readout}</p>
          {hint ? (
            <>
              <p className="prompt">{hint}</p>
              <button
                className="primary"
                onClick={() => {
                  setHint(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <Meter value={progress} />
          )}
        </>
      )}

      {step === "done" && (
        <>
          <p className="big">Got your voice.</p>
          <p className="note">
            Next, a few practice gates — say each tone in your natural voice.
            That's how the game learns your range, so don't force it; it's fine
            to miss a few.
          </p>
          <button className="primary" onClick={save}>
            Let's go
          </button>
        </>
      )}

      {step === "preview" && (
        <>
          <p className="note">
            Does this feel right? Try a few sounds: high, low, and a slide
            between them.
          </p>
          <div className="stage calibrate-preview-stage">
            <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
          </div>
          <label className="slider">
            <span className="param-name">
              sensitivity: +{range.up} / −{range.down} semitones
            </span>
            <input
              type="range"
              min={RANGE_UP_SEMITONES_MIN}
              max={RANGE_SEMITONES_MAX}
              step={0.5}
              value={range.up}
              onChange={(e) => applyRange(scaleHalves(range, Number(e.target.value)))}
            />
            <span className="param-help">
              If you can't reach lines 1 or 5, lower this. If the dot slams into
              the edges, raise it.
            </span>
          </label>
          {fit !== null && !sameHalves(fit, range) && (
            <button onClick={() => applyRange(fit)}>
              Fit to what I just did (+{fit.up} / −{fit.down})
            </button>
          )}
          <button className="primary" onClick={save}>
            Feels right
          </button>
          {startAt !== "preview" && (
            <button
              onClick={() => {
                setAttempt((a) => a + 1);
                setStep("talk");
              }}
            >
              Start over
            </button>
          )}
        </>
      )}

      <button
        className="link"
        onClick={() => {
          // Only a *departure* before the end is an abandonment. Backing out of
          // the preview means calibration already succeeded and was saved.
          if (step !== "done" && step !== "preview") {
            track({ type: "calib_abandoned", step });
          }
          onCancel();
        }}
      >
        Back
      </button>

      {paused && (
        <div className="overlay" onClick={resume}>
          <p>paused, tap to continue</p>
        </div>
      )}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${value * 100}%` }} />
    </div>
  );
}
