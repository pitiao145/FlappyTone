/**
 * The Visualiser's per-frame audio sink, outside React so it can be tested:
 * frame in → pitch tracker → one `onPitch` call. Pure apart from the
 * callbacks it is handed (no Web Audio here; `src/audio/` feeds it).
 *
 * The room measurement (`noise`) is passed in, not made here: it belongs to
 * the mic session (`sessionNoiseFor`), so building a new sink after a canvas
 * size change does not measure the room again (brief 47). A tracker made
 * after the measurement landed starts from the measured floor.
 */
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { CalibrationSettings } from "./settings.ts";
import { startingNoiseFloor, type SessionNoise } from "./sessionNoise.ts";
import { speakerFMin, tuning } from "./tuning.ts";

export interface VisualiserSinkDeps {
  settings: CalibrationSettings;
  noise: SessionNoise;
  /** True while the example plays: frames are dropped (the game's own voice). */
  muted: () => boolean;
  onPitch: (chao: number, voiced: boolean, rms: number) => void;
}

export function makeVisualiserSink(
  deps: VisualiserSinkDeps,
): (frame: Float32Array, sampleRate: number) => void {
  const { settings, noise, muted, onPitch } = deps;
  let tracker: PitchTracker | null = null;
  return (frame, sampleRate) => {
    if (muted()) return;
    if (!tracker) {
      tracker = new PitchTracker({
        sampleRate,
        f0Center: settings.f0Center,
        fMin: speakerFMin(settings.f0Center),
        // This session's measured floor if it already landed; else the saved
        // calibration floor, capped, until the measurement lands.
        noiseFloor: noise.floor ?? startingNoiseFloor(settings.noiseFloor, settings.voiceRms),
        minVoicedRunMs: tuning().minVoicedRunMs,
        rangeSemitones: settings.rangeSemitones,
        rangeDownSemitones: settings.rangeDownSemitones,
      });
    }
    const measured = noise.feed(frame, sampleRate);
    if (measured !== null) tracker.setNoiseFloor(measured);
    const p = tracker.push(frame);
    onPitch(p.smoothedChao, p.voiced, p.rms);
  };
}
