import { useEffect, useRef, useState } from "react";
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
  RANGE_SEMITONES_MAX,
  RANGE_SEMITONES_MIN,
  computeF0Center,
  computeNoiseFloor,
  computeRangeFromExtremes,
  computeRangeSemitones,
} from "../pitch/calibration.ts";
import { rmsOf } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchTrackerConfig } from "../pitch/types.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";

const QUIET_MS = 1000;
/** Long enough for a couple of sentences — more voiced frames than three syllables. */
const TALK_MS = 6000;
/** One deliberate reach in each direction. Short: reaching is tiring. */
const SWEEP_MS = 3000;

type Step = "quiet" | "talk" | "high" | "low" | "preview";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  onDone: (settings: CalibrationSettings) => void;
  onCancel: () => void;
}

/**
 * Calibration: quiet → talk normally → reach high → reach low → live preview.
 *
 * This replaced PRD §5.4's "say **ma** three times", which asked a beginner to
 * perform a syllable from the language they are here to learn, and inferred
 * their range from whatever excursion three flat syllables happened to
 * contain. Normal speech gives a better f0 centre — more voiced frames, and
 * the register they actually talk in — and asking them to reach, once in each
 * direction, *measures* the range instead of guessing it.
 */
export function Calibration({ canvasWidth, canvasHeight, onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>("quiet");
  /** Bumped to retry a capture step without leaving it. */
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [f0Center, setF0Center] = useState<number | null>(null);
  const [range, setRange] = useState(RANGE_SEMITONES);
  /** Semitones captured during each sweep, relative to the measured centre. */
  const highRef = useRef<number[]>([]);
  const lowRef = useRef<number[]>([]);
  /** Range the preview thinks fits this voice, or null until enough is heard. */
  const [fit, setFit] = useState<number | null>(null);
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
    // Bumping the attempt re-runs the current step's effect from scratch.
    setAttempt((a) => a + 1);
  };

  // Step machine. Each step installs its own frame sink and tears it down.
  useEffect(() => {
    if (paused) return;

    if (step === "quiet") {
      const rms: number[] = [];
      setFrameSink((frame) => rms.push(rmsOf(frame)));
      const started = performance.now();
      const ticker = setInterval(
        () => setProgress(Math.min(1, (performance.now() - started) / QUIET_MS)),
        50,
      );
      const timer = setTimeout(() => {
        setNoiseFloor(computeNoiseFloor(rms));
        setProgress(0);
        setStep("talk");
      }, QUIET_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
        setFrameSink(null);
      };
    }

    if (step === "talk") {
      const f0s: number[] = [];
      let tracker: PitchTracker | null = null;
      setFrameSink((frame, sampleRate) => {
        tracker ??= new PitchTracker(
          noiseFloor === null ? { sampleRate } : { sampleRate, noiseFloor },
        );
        const p = tracker.push(frame);
        if (p.voiced && p.f0 !== null) f0s.push(p.f0);
      });
      const started = performance.now();
      const ticker = setInterval(
        () => setProgress(Math.min(1, (performance.now() - started) / TALK_MS)),
        50,
      );
      const timer = setTimeout(() => {
        setProgress(0);
        const centre = computeF0Center(f0s);
        if (centre === null) {
          // Never blame the player — the app failed to hear, not the speaker.
          setFrameSink(null);
          setHint("Couldn't hear that — let's try again.");
          return;
        }
        setHint(null);
        setF0Center(centre);
        highRef.current = [];
        lowRef.current = [];
        setStep("high");
      }, TALK_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
        setFrameSink(null);
      };
    }

    if (step === "high" || step === "low") {
      // Semitones are relative to the centre measured a moment ago, so the two
      // sweeps and the preview are all on one scale.
      const cfg: Partial<PitchTrackerConfig> = {};
      if (f0Center !== null) cfg.f0Center = f0Center;
      if (noiseFloor !== null) cfg.noiseFloor = noiseFloor;
      configureTracker(cfg);
      const into = step === "high" ? highRef : lowRef;
      into.current = [];
      setFrameSink((frame, sampleRate) => {
        handleFrame(frame, sampleRate);
        const latest = getLatestState();
        if (latest.voiced && latest.semitones !== null) {
          into.current.push(latest.semitones);
        }
      });
      // The live dot runs during the sweeps: seeing yourself reach is what
      // makes "as high as is comfortable" legible without more words.
      const stopLoop = canvasRef.current
        ? startLoop(canvasRef.current, canvasWidth, canvasHeight)
        : null;
      const started = performance.now();
      const ticker = setInterval(
        () => setProgress(Math.min(1, (performance.now() - started) / SWEEP_MS)),
        50,
      );
      const timer = setTimeout(() => {
        setProgress(0);
        if (step === "high") {
          setStep("low");
          return;
        }
        setRange(
          computeRangeFromExtremes(highRef.current, lowRef.current) ??
            RANGE_SEMITONES,
        );
        setStep("preview");
      }, SWEEP_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
        stopLoop?.();
        setFrameSink(null);
      };
    }

    // preview: the Step-0 free-play dot, driven by the tracker we just calibrated.
    const cfg: Partial<PitchTrackerConfig> = { rangeSemitones: range };
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
      () => setFit(computeRangeSemitones(observedRef.current)),
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
  }, [step, attempt, paused, noiseFloor, f0Center, canvasWidth, canvasHeight]);

  const save = () => {
    if (f0Center === null || noiseFloor === null) return;
    const settings: CalibrationSettings = {
      f0Center,
      noiseFloor,
      rangeSemitones: range,
    };
    saveSettings(settings);
    onDone(settings);
  };

  const sweeping = step === "high" || step === "low";

  return (
    <div className="screen calibrate-screen">
      <h2>Calibration</h2>

      {step === "quiet" && (
        <>
          <p className="big">Give me a second of quiet…</p>
          <Meter value={progress} />
          <p className="note">Measuring how quiet your room is.</p>
        </>
      )}

      {step === "talk" && (
        <>
          <p className="big">Just talk, normally</p>
          <p className="note">
            Say what you had for breakfast, or count to ten — anything in your
            everyday voice. No singing.
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

      {sweeping && (
        <>
          <p className="big">
            {step === "high"
              ? "Now go high — say “ahh” as high as is comfortable"
              : "And now low — as low as is comfortable"}
          </p>
          <p className="note">
            Don't strain. Watch the dot: this is finding the top and bottom of
            your board.
          </p>
          <Meter value={progress} />
          <div className="stage">
            <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <p className="note">
            Does this feel right? Try a few sounds — high, low, and a slide
            between them.
          </p>
          <div className="stage">
            <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
          </div>
          <label className="slider">
            <span className="param-name">sensitivity — ±{range} semitones</span>
            <input
              type="range"
              min={RANGE_SEMITONES_MIN}
              max={RANGE_SEMITONES_MAX}
              step={0.5}
              value={range}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRange(v);
                getTracker()?.setRangeSemitones(v);
              }}
            />
            <span className="param-help">
              If you can't reach lines 1 or 5, lower this. If the dot slams into
              the edges, raise it.
            </span>
          </label>
          {fit !== null && fit !== range && (
            <button
              onClick={() => {
                setRange(fit);
                getTracker()?.setRangeSemitones(fit);
              }}
            >
              Fit to what I just did (±{fit})
            </button>
          )}
          <button className="primary" onClick={save}>
            Feels right
          </button>
          <button
            onClick={() => {
              setAttempt((a) => a + 1);
              setStep("talk");
            }}
          >
            Start over
          </button>
        </>
      )}

      <button className="link" onClick={onCancel}>
        Back
      </button>

      {paused && (
        <div className="overlay" onClick={resume}>
          <p>paused — tap to continue</p>
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
