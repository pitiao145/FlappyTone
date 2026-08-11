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
import { saveSettings, type CalibrationSettings } from "../game/settings.ts";
import {
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_SEMITONES_MIN,
  computeF0Center,
  computeNoiseFloor,
  computeRangeHalves,
  computeRangeHalvesFromExtremes,
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

/**
 * Dev-only: what the two sweeps actually contained. The reason this exists is
 * that "the dot stays at chao 3 on the low sweep" has two very different
 * causes — a downward reach that was measured and then squashed by a symmetric
 * board, or one that was never heard at all (creak fails voicing, fMin is
 * 70Hz, and unvoiced frames drift the dot to REST_CHAO). The percentiles tell
 * them apart; the clamp line says whether RANGE_SEMITONES_MIN is doing the
 * squashing instead.
 */
function logSweeps(
  high: number[],
  low: number[],
  halves: RangeHalves | null,
): void {
  const pct = (xs: number[], p: number) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  };
  const fmt = (xs: number[]) =>
    `n=${xs.length} p10=${pct(xs, 10).toFixed(1)} p50=${pct(xs, 50).toFixed(1)} p90=${pct(xs, 90).toFixed(1)} st`;
  console.log(`[calibration] high sweep: ${fmt(high)}`);
  console.log(`[calibration] low  sweep: ${fmt(low)}`);
  console.log(
    `[calibration] halves: up=${halves?.up} down=${halves?.down} ` +
      `(raw down=${(-pct(low, 10)).toFixed(1)}, floor=${RANGE_DOWN_SEMITONES_MIN})`,
  );
}

/** Voiced speech needed to site the centre of someone's range. */
const TALK_VOICED_MS = 2500;
/** One deliberate reach. Short, because reaching is tiring. */
const SWEEP_VOICED_MS = 900;
/**
 * Gap between two voiced frames that still counts as continuous phonation.
 * Anything longer is a pause, and pauses are not part of the measurement.
 */
const VOICED_GAP_MS = 60;
/** Silence this long, with nothing heard yet, earns a nudge — never a failure. */
const NUDGE_AFTER_MS = 7000;

/** How long a "Got it." sits on screen before the next instruction. */
const CONFIRM_MS = 900;
/** Below this many voiced frames a sweep tells us nothing — ask for another go. */
const MIN_SWEEP_SAMPLES = 10;

/*
 * The low sweep is heard through a looser voicing gate than anything else.
 *
 * The bottom of a reach goes creaky, creak is aperiodic, and aperiodic reads as
 * unvoiced — the same mechanism PRD §6 documents for Tone 3, arriving here
 * instead. Only voiced frames feed `lowRef`, so the deepest part of the reach
 * was measured out of existence: the up half came back whole and the down half
 * came back short, which is half of why the board was lopsided.
 *
 * It also shaped the player. An unvoiced frame does not advance the voiced
 * clock, so the meter stalls exactly when they go deep enough to creak, and the
 * obvious response is to back off the low note until the step ends.
 *
 * Only the capture is loosened, never play: `configureTracker` replaces its
 * overrides wholesale (src/game/loop.ts), so leaving this step restores the
 * shipped gate. Do not merge this branch into the shared sweep config.
 */
const SWEEP_LOW_CLARITY = 0.5;
const SWEEP_LOW_RESCUE_RMS = 5;

type Step = "quiet" | "talk" | "low" | "high" | "done" | "preview";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  onDone: (settings: CalibrationSettings) => void;
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
  onCancel,
  startAt = "quiet",
  existing = null,
}: Props) {
  const [step, setStep] = useState<Step>(startAt);
  /** Bumped to retry a capture step without leaving it. */
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
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
  /** Semitones captured during each sweep, relative to the measured centre. */
  const highRef = useRef<number[]>([]);
  const lowRef = useRef<number[]>([]);
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
          noiseFloor === null ? { sampleRate } : { sampleRate, noiseFloor },
        );
        const p = tracker.push(frame);
        if (p.voiced && p.f0 !== null) {
          f0s.push(p.f0);
          heard.tick(performance.now());
        }
      });
      const started = performance.now();
      // 20Hz: the meter reacts to the voice, and the step ends when the meter
      // is full. No clock is running against the player.
      const ticker = setInterval(() => {
        setProgress(Math.min(1, heard.ms / TALK_VOICED_MS));
        if (heard.ms === 0 && performance.now() - started > NUDGE_AFTER_MS) {
          setHint("Take your time, I'm still listening.");
        }
        if (heard.ms < TALK_VOICED_MS) return;
        clearInterval(ticker);
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
        highRef.current = [];
        lowRef.current = [];
        advance("Got it.", "low");
      }, 50);
      return () => {
        clearInterval(ticker);
        setFrameSink(null);
      };
    }

    if (step === "low" || step === "high") {
      // Semitones are relative to the centre measured a moment ago, so the two
      // sweeps and the preview are all on one scale.
      const cfg: Partial<PitchTrackerConfig> = {};
      if (f0Center !== null) cfg.f0Center = f0Center;
      if (noiseFloor !== null) cfg.noiseFloor = noiseFloor;
      // See SWEEP_LOW_CLARITY: creak at the bottom of the reach is the part of
      // the measurement that was being thrown away.
      if (step === "low") {
        cfg.clarityThreshold = SWEEP_LOW_CLARITY;
        cfg.rescueRmsMult = SWEEP_LOW_RESCUE_RMS;
      }
      configureTracker(cfg);
      const into = step === "high" ? highRef : lowRef;
      into.current = [];
      const heard = makeVoicedClock();
      setFrameSink((frame, sampleRate) => {
        handleFrame(frame, sampleRate);
        const latest = getLatestState();
        if (latest.voiced && latest.semitones !== null) {
          into.current.push(latest.semitones);
          heard.tick(performance.now());
        }
      });
      // The live dot runs during the sweeps: seeing yourself reach is what
      // makes "as high as is comfortable" legible without more words.
      const stopLoop = canvasRef.current
        ? startLoop(canvasRef.current, canvasWidth, canvasHeight, {
            holdOnUnvoiced: true,
          })
        : null;
      const started = performance.now();
      const ticker = setInterval(() => {
        setProgress(Math.min(1, heard.ms / SWEEP_VOICED_MS));
        if (heard.ms === 0 && performance.now() - started > NUDGE_AFTER_MS) {
          setHint("Whenever you're ready, I'm still listening.");
        }
        if (heard.ms < SWEEP_VOICED_MS) return;
        clearInterval(ticker);
        setProgress(0);
        // A sweep we could not hear is asked for again rather than folded into
        // the measurement — a range sized around silence fits nobody, and the
        // player would meet it as a board that does not respond. Reaching the
        // voiced target makes this near-impossible now; it stays as the floor
        // the range maths actually needs.
        if (into.current.length < MIN_SWEEP_SAMPLES) {
          setFrameSink(null);
          setHint("Didn't quite catch that, one more go?");
          return;
        }
        setHint(null);
        if (step === "low") {
          advance("Nice.", "high");
          return;
        }
        const halves = computeRangeHalvesFromExtremes(
          highRef.current,
          lowRef.current,
        );
        if (import.meta.env.DEV) logSweeps(highRef.current, lowRef.current, halves);
        setRange(halves ?? { up: RANGE_SEMITONES, down: RANGE_SEMITONES });
        advance("Perfect.", "done");
      }, 50);
      return () => {
        clearInterval(ticker);
        stopLoop?.();
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
    const stopLoop = canvasRef.current
      ? startLoop(canvasRef.current, canvasWidth, canvasHeight)
      : null;
    // 4Hz, not per frame — the suggestion is UI, and the loop stays outside React.
    const suggesting = setInterval(
      () => setFit(computeRangeHalves(observedRef.current)),
      250,
    );
    return () => {
      clearInterval(suggesting);
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
    saveSettings(s);
    onDone(s);
  };

  // Persist on *arrival* at the last card rather than on its button: someone
  // who closes the tab there has still done the work, and making them redo it
  // because they never pressed a button would be the app's fault, not theirs.
  useEffect(() => {
    if (step !== "done") return;
    const s = settingsNow();
    if (s) saveSettings(s);
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

  const sweeping = step === "low" || step === "high";

  return (
    <div className="screen calibrate-screen">
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
          <p className="big">Now just talk, in your normal voice.</p>
          {/* Concrete options, because "say something" is where people freeze. */}
          <ul className="facts prompts">
            <li>Count to ten</li>
            <li>What you had for breakfast</li>
            <li>How you got here today</li>
          </ul>
          <p className="note">
            Start whenever you like, the bar fills while I can hear you.
          </p>
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

      {sweeping && !confirm && (
        <>
          <p className="big">
            {step === "low"
              ? "Now go as low as you comfortably can."
              : "And now as high as you comfortably can."}
          </p>
          {/* An example to imitate beats an instruction to interpret. */}
          <p className="note">
            {step === "low"
              ? "Like a sleepy “ohhhh”. Hold it. Don't strain."
              : "Like a surprised “ooh?”. Hold it. Don't strain."}
          </p>
          <p className="note">
            Take your time, the bar fills while you're making the sound.
          </p>
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

      {/* Outside the block above so the acknowledgement between the two sweeps
          does not unmount the canvas the live dot is drawing into. */}
      {sweeping && (
        <div className="stage">
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
        </div>
      )}

      {step === "done" && (
        <>
          <p className="big">You're all set.</p>
          <p className="note">
            That's your voice mapped. You can change it any time in Settings.
          </p>
          <button className="primary" onClick={save}>
            Start playing
          </button>
        </>
      )}

      {step === "preview" && (
        <>
          <p className="note">
            Does this feel right? Try a few sounds: high, low, and a slide
            between them.
          </p>
          <div className="stage">
            <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
          </div>
          <label className="slider">
            <span className="param-name">
              sensitivity: +{range.up} / −{range.down} semitones
            </span>
            <input
              type="range"
              min={RANGE_SEMITONES_MIN}
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
