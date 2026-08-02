// CLI: npm run tune
// Parameter sweep: runs imperfect synthetic tones (jitter, noise, dropouts —
// a stand-in for a wobbly human voice) through PitchTracker across a grid of
// alpha / clarityThreshold values and scores each combo on:
//   - rmse: mean |smoothedChao - idealChao| over voiced frames (contour fit)
//   - voiced%: how often the tone was heard at all (misses hurt trust)
// Prints the grid and the best combo. Deterministic (seeded).
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { CONTOURS, IDEAL, synthTone, type SynthOptions } from "./tone-synth.ts";

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;

// Three "speaker" difficulty profiles
const PROFILES: Record<string, Partial<SynthOptions>> = {
  clean: { jitterSemitones: 0.3, noiseAmplitude: 0.005, dropoutRate: 0 },
  wobbly: { jitterSemitones: 0.8, noiseAmplitude: 0.02, dropoutRate: 0.05 },
  creaky: { jitterSemitones: 0.5, noiseAmplitude: 0.01, dropoutRate: 0.25 },
};

const ALPHAS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const CLARITIES = [0.75, 0.8, 0.85, 0.9];

interface Score {
  rmse: number;
  voicedPct: number;
  /** Mean excess frame-to-frame movement vs the ideal contour (visual shake) */
  wiggle: number;
}

function evaluate(alpha: number, clarity: number): Score {
  let errSum = 0;
  let errN = 0;
  let voicedFrames = 0;
  let toneFrames = 0;
  let wiggleSum = 0;
  let wiggleN = 0;

  for (const profile of Object.values(PROFILES)) {
    for (const [name, polyline] of Object.entries(CONTOURS)) {
      const opts = { ...IDEAL, ...profile, seed: name.length * 31 + 7 };
      const { samples, idealChao } = synthTone(polyline, opts);
      const tracker = new PitchTracker({
        sampleRate: opts.sampleRate,
        alpha,
        clarityThreshold: clarity,
      });
      let prev: { chao: number; ideal: number } | null = null;
      for (let s = 0; s + FRAME_SIZE <= samples.length; s += HOP_SIZE) {
        const state = tracker.push(samples.subarray(s, s + FRAME_SIZE));
        // Compare at the centre of the analysis window
        const ideal = idealChao[s + FRAME_SIZE / 2];
        if (Number.isNaN(ideal)) continue;
        toneFrames++;
        if (state.voiced) {
          voicedFrames++;
          errSum += (state.smoothedChao - ideal) ** 2;
          errN++;
          if (prev) {
            const actualDelta = Math.abs(state.smoothedChao - prev.chao);
            const idealDelta = Math.abs(ideal - prev.ideal);
            wiggleSum += Math.max(0, actualDelta - idealDelta);
            wiggleN++;
          }
          prev = { chao: state.smoothedChao, ideal };
        } else {
          prev = null;
        }
      }
    }
  }
  return {
    rmse: errN ? Math.sqrt(errSum / errN) : Infinity,
    voicedPct: toneFrames ? (100 * voicedFrames) / toneFrames : 0,
    wiggle: wiggleN ? wiggleSum / wiggleN : Infinity,
  };
}

console.log("cells: rmse/wiggle@voiced%");
console.log("alpha \\ clarity " + CLARITIES.map((c) => c.toFixed(2).padStart(16)).join(""));
let best: { alpha: number; clarity: number; score: Score } | null = null;
for (const alpha of ALPHAS) {
  const row: string[] = [];
  for (const clarity of CLARITIES) {
    const score = evaluate(alpha, clarity);
    row.push(
      `${score.rmse.toFixed(2)}/${score.wiggle.toFixed(3)}@${score.voicedPct.toFixed(0)}%`.padStart(16),
    );
    // Combined cost: contour fit + heavy weight on visual shake, among combos
    // that hear >=70% of the tone
    const cost = score.rmse + 4 * score.wiggle;
    if (
      score.voicedPct >= 70 &&
      (!best || cost < best.score.rmse + 4 * best.score.wiggle)
    ) {
      best = { alpha, clarity, score };
    }
  }
  console.log(alpha.toFixed(2).padStart(5) + "          " + row.join(""));
}

if (best) {
  console.log(
    `\nbest: alpha=${best.alpha} clarityThreshold=${best.clarity}` +
      ` (rmse ${best.score.rmse.toFixed(3)} chao, voiced ${best.score.voicedPct.toFixed(0)}%)`,
  );
}
