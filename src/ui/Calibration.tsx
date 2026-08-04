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
  computeRangeSemitones,
} from "../pitch/calibration.ts";
import { rmsOf } from "../pitch/math.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchTrackerConfig } from "../pitch/types.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";

const QUIET_MS = 1000;
const SPEAK_MS = 5000;

type Step = "quiet" | "speak" | "preview";

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  onDone: (settings: CalibrationSettings) => void;
  onCancel: () => void;
}

/** PRD §5.4: quiet second → "say ma three times" → live preview + range slider. */
export function Calibration({ canvasWidth, canvasHeight, onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>("quiet");
  /** Bumped to retry the speak step without leaving it. */
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [f0Center, setF0Center] = useState<number | null>(null);
  const [range, setRange] = useState(RANGE_SEMITONES);
  /** Range the preview thinks fits this voice, or null until enough is heard. */
  const [fit, setFit] = useState<number | null>(null);
  /** Every voiced semitone seen during preview. A ref: this fills at frame rate. */
  const observedRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Backgrounding mid-capture would let the quiet/speak timers run against a
  // mic nobody is talking into, poisoning the measurement. Suspend the audio
  // and abandon the step; resuming restarts it from the beginning.
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
        setStep("speak");
      }, QUIET_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
        setFrameSink(null);
      };
    }

    if (step === "speak") {
      const f0s: number[] = [];
      let tracker: PitchTracker | null = null;
      setFrameSink((frame, sampleRate) => {
        tracker ??= new PitchTracker(
          noiseFloor === null
            ? { sampleRate }
            : { sampleRate, noiseFloor },
        );
        const p = tracker.push(frame);
        if (p.voiced && p.f0 !== null) f0s.push(p.f0);
      });
      const started = performance.now();
      const ticker = setInterval(
        () => setProgress(Math.min(1, (performance.now() - started) / SPEAK_MS)),
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
        setStep("preview");
      }, SPEAK_MS);
      return () => {
        clearTimeout(timer);
        clearInterval(ticker);
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
    // Watch what the speaker actually does so the board can be sized to them.
    // Semitones are relative to f0Center, so moving the slider doesn't
    // invalidate anything collected before it moved.
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
  }, [step, attempt, paused, noiseFloor, f0Center]);

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

  return (
    <div className="screen calibrate-screen">
      <h2>Calibration</h2>

      {step === "quiet" && (
        <>
          <p className="big">Stay quiet for a second…</p>
          <Meter value={progress} />
          <p className="note">Measuring how quiet your room is.</p>
        </>
      )}

      {step === "speak" && (
        <>
          <p className="big">
            Say <strong>ma</strong> three times
          </p>
          <p className="note">Normal speaking voice, no singing.</p>
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

      {step === "preview" && (
        <>
          <p className="note">
            Does this feel right? Say <strong>mā má mǎ mà</strong> and watch the
            dot.
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
              Fit to my voice (±{fit})
            </button>
          )}
          <button className="primary" onClick={save}>
            Feels right
          </button>
          <button
            onClick={() => {
              setAttempt((a) => a + 1);
              setStep("speak");
            }}
          >
            Redo the voice step
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
