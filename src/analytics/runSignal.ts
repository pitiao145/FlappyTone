/**
 * The two signal-quality numbers on `run_end` (brief 51, logging option A).
 *
 * - `noiseDb`: how loud the room was during the run, the session noise floor
 *   in dB full scale (0 = the loudest the mic can give, more negative = quieter).
 * - `heardPct`: the share of frames inside gates where the game heard a voice,
 *   0–100.
 *
 * Neither is a voice profile: no pitch, no Hz, no learned scale (brief 35,
 * privacy policy). Both are rounded to whole numbers. Hard rule 10: this never
 * throws; a bad input drops the number, it never breaks the run's report.
 */

/** The part of a gate log entry this reads (`GateLogEntry` in `src/game/run.ts`). */
export interface GateFrameCounts {
  samples: number;
  voiced: number;
}

export interface RunSignal {
  noiseDb?: number;
  heardPct?: number;
}

/** Linear RMS → whole dB full scale, or undefined for a value with no dB. */
export function noiseDbOf(rms: number | null | undefined): number | undefined {
  if (typeof rms !== "number" || !Number.isFinite(rms) || rms <= 0) return undefined;
  const db = Math.round(20 * Math.log10(rms));
  return Number.isFinite(db) ? db : undefined;
}

/** Voiced share of all in-gate frames, whole percent, or undefined when no gate had frames. */
export function heardPctOf(gates: readonly GateFrameCounts[] | null | undefined): number | undefined {
  if (!Array.isArray(gates)) return undefined;
  let samples = 0;
  let voiced = 0;
  for (const g of gates) {
    if (!g || !Number.isFinite(g.samples) || !Number.isFinite(g.voiced)) continue;
    samples += Math.max(0, g.samples);
    voiced += Math.max(0, Math.min(g.voiced, g.samples));
  }
  if (samples === 0) return undefined;
  return Math.round((100 * voiced) / samples);
}

/** Both numbers, each present only when known. Never throws. */
export function runSignal(
  gates: readonly GateFrameCounts[] | null | undefined,
  noiseFloorRms: number | null | undefined,
): RunSignal {
  try {
    const out: RunSignal = {};
    const noiseDb = noiseDbOf(noiseFloorRms);
    if (noiseDb !== undefined) out.noiseDb = noiseDb;
    const heardPct = heardPctOf(gates);
    if (heardPct !== undefined) out.heardPct = heardPct;
    return out;
  } catch {
    return {};
  }
}
