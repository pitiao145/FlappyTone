import { useEffect, useRef, useState } from "react";
import { isCueAudible, playToneCue } from "../audio/reference.ts";
import { getMicSession, setFrameSink } from "../audio/session.ts";
import { publishState, setActiveTracker } from "../game/activeTracker.ts";
import { ContourRecorder } from "../game/contours.ts";
import { TONE_INFO, type Tone } from "../game/gates.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawVisualiser } from "../render/visualiser.ts";

/** How much time the panel spans. Long enough for a citation syllable and a breath. */
const SPAN_MS = 1600;

const TONES: Tone[] = [1, 2, 3, 4];

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
  const [paused, setPaused] = useState(false);
  /** Read by the rAF loop, which must not re-run when the tone changes. */
  const toneRef = useRef<Tone | null>(null);
  toneRef.current = tone;
  const recorderRef = useRef<ContourRecorder | null>(null);
  const resumeRef = useRef<() => void>(() => {});

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
      const head = live?.points.at(-1);
      // Between utterances the dot returns to the rest line, as it does in
      // play — but nothing drifts *while* you are speaking.
      const target = head && voiced ? head.chao : 3;
      displayChao +=
        (target - displayChao) * (1 - Math.exp(-dt / tuning().easeTauMs));

      drawVisualiser(ctx, canvasWidth, canvasHeight, {
        tone: toneRef.current,
        live,
        finished: recorder.finished(),
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

  const playExample = () => {
    if (tone === null) return;
    const audio = getMicSession()?.ctx;
    // Same context the mic runs on, so it is already gesture-resumed.
    if (audio && audio.state === "running") {
      playToneCue(
        audio,
        tone,
        settings.f0Center,
        settings.rangeSemitones,
        null,
        settings.rangeDownSemitones,
      );
    }
  };

  return (
    <div className="screen visualiser-screen">
      <div className="stage">
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />

        {paused && (
          <div className="overlay" onClick={() => resumeRef.current()}>
            <p>paused, tap to continue</p>
          </div>
        )}
      </div>

      <div className="choice">
        <button
          className={tone === null ? "choice-option active" : "choice-option"}
          onClick={() => setTone(null)}
        >
          free
        </button>
        {TONES.map((t) => (
          <button
            key={t}
            className={tone === t ? "choice-option active" : "choice-option"}
            onClick={() => setTone(t)}
          >
            {TONE_INFO[t].pinyin}
          </button>
        ))}
      </div>

      <p className="note">
        {tone === null
          ? "Say anything. The line is your pitch, left to right."
          : `${TONE_INFO[tone].pinyin} ${TONE_INFO[tone].hanzi}, ${TONE_INFO[tone].cue}. Match the dashed shape.`}
      </p>

      <div className="setting-actions">
        {tone !== null && <button onClick={playExample}>Play the example</button>}
        <button onClick={() => recorderRef.current?.clear()}>Clear</button>
        <button className="primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
