/**
 * Aggregates pulled sessions into the numbers worth acting on.
 *
 * Pure: sessions in, a report string out. No filesystem, no network — the CLI
 * in `report-runs.ts` does the reading. That keeps the arithmetic testable,
 * which matters more here than usual: these numbers are the input to tuning
 * decisions, and a miscounted "unheard" rate would send the corridor the wrong
 * way.
 *
 * Two counting rules that are easy to get wrong and are deliberate here:
 *
 * 1. **Unheard gates are excluded from accuracy means.** An unheard gate is
 *    neutral by PRD §6 — no points, no heart. Averaging its zero in would drag
 *    every tone's accuracy toward the floor and make a microphone problem look
 *    like a pronunciation problem. `applyGate` makes the same exclusion.
 * 2. **The funnel counts sessions, not runs.** A tester who plays six runs is
 *    one person who got in, not six.
 */

import type { SessionRecord, TimedEvent } from "../analytics/session.ts";

export interface Report {
  sessions: number;
  players: number;
  returning: number;
  micOk: number;
  micFailed: Record<string, number>;
  calibrated: number;
  abandonedAt: Record<string, number>;
  /** Sessions that reached at least one gate — the end of the funnel. */
  played: number;
  runs: number;
  gates: number;
  perTone: Record<number, ToneRow>;
  quitHistogram: Record<string, number>;
  byRegister: RegisterRow[];
  devices: Record<string, number>;
}

export interface ToneRow {
  gates: number;
  perfect: number;
  good: number;
  ok: number;
  collision: number;
  unheard: number;
  accSum: number;
  accCount: number;
  uttSum: number;
}

export interface RegisterRow {
  label: string;
  players: number;
  gates: number;
  acc: number;
  unheardPct: number;
}

const TONES = [1, 2, 3, 4];

function emptyToneRow(): ToneRow {
  return {
    gates: 0,
    perfect: 0,
    good: 0,
    ok: 0,
    collision: 0,
    unheard: 0,
    accSum: 0,
    accCount: 0,
    uttSum: 0,
  };
}

export function buildReport(sessions: SessionRecord[]): Report {
  const perTone: Record<number, ToneRow> = {};
  for (const t of TONES) perTone[t] = emptyToneRow();

  const playerSeen = new Map<string, number>();
  const micFailed: Record<string, number> = {};
  const abandonedAt: Record<string, number> = {};
  const quitHistogram: Record<string, number> = {};
  const devices: Record<string, number> = {};
  /** Per player: accuracy and unheard tallies, for the register breakdown. */
  const byPlayer = new Map<
    string,
    { f0: number | null; accSum: number; accCount: number; unheard: number; gates: number }
  >();

  let micOk = 0;
  let calibrated = 0;
  let played = 0;
  let runs = 0;
  let gates = 0;

  for (const s of sessions) {
    playerSeen.set(s.playerId, (playerSeen.get(s.playerId) ?? 0) + 1);
    devices[s.device] = (devices[s.device] ?? 0) + 1;

    const player = byPlayer.get(s.playerId) ?? {
      f0: null,
      accSum: 0,
      accCount: 0,
      unheard: 0,
      gates: 0,
    };
    if (s.calibration) player.f0 = s.calibration.f0Center;

    let sawMicOk = false;
    let sawCalibDone = false;
    let sawGate = false;

    for (const ev of s.events as TimedEvent[]) {
      switch (ev.type) {
        case "mic":
          if (ev.ok) sawMicOk = true;
          else micFailed[ev.reason] = (micFailed[ev.reason] ?? 0) + 1;
          break;
        case "calib_done":
          sawCalibDone = true;
          break;
        case "calib_abandoned":
          abandonedAt[ev.step] = (abandonedAt[ev.step] ?? 0) + 1;
          break;
        case "run_start":
          runs += 1;
          break;
        case "gate": {
          const row = perTone[ev.tone];
          if (!row) break;
          gates += 1;
          sawGate = true;
          player.gates += 1;
          row.gates += 1;
          row[ev.outcome] += 1;
          row.uttSum += ev.uttMs;
          // Rule 1: an unheard gate was never scored. Averaging its zero would
          // turn a mic problem into an apparent pronunciation problem.
          if (ev.outcome === "unheard") {
            player.unheard += 1;
          } else {
            row.accSum += ev.acc;
            row.accCount += 1;
            player.accSum += ev.acc;
            player.accCount += 1;
          }
          break;
        }
        case "run_end":
          if (ev.reason === "quit") {
            const bucket = quitBucket(ev.gates);
            quitHistogram[bucket] = (quitHistogram[bucket] ?? 0) + 1;
          }
          break;
      }
    }

    if (sawMicOk) micOk += 1;
    if (sawCalibDone || s.calibration) calibrated += 1;
    if (sawGate) played += 1;
    byPlayer.set(s.playerId, player);
  }

  let returning = 0;
  for (const count of playerSeen.values()) if (count > 1) returning += 1;

  return {
    sessions: sessions.length,
    players: playerSeen.size,
    returning,
    micOk,
    micFailed,
    calibrated,
    abandonedAt,
    played,
    runs,
    gates,
    perTone,
    quitHistogram,
    byRegister: registerRows(byPlayer),
    devices,
  };
}

/**
 * Bucket labels in ascending order. Kept as a list because sorting the labels
 * themselves is lexicographic, which puts "21+" before "1-5" and makes the
 * histogram read backwards.
 */
export const QUIT_BUCKETS = [" 1-5", " 6-10", "11-20", "  21+"] as const;

function quitBucket(gates: number): string {
  if (gates <= 5) return QUIT_BUCKETS[0];
  if (gates <= 10) return QUIT_BUCKETS[1];
  if (gates <= 20) return QUIT_BUCKETS[2];
  return QUIT_BUCKETS[3];
}

/**
 * Splits players by vocal register.
 *
 * The question this answers: if Tone 3 fails only for low voices, the chao
 * mapping is wrong for them, not their pronunciation. PRD §13 makes this
 * explicit — a native speaker who cannot hit 80% means the tolerances are
 * wrong, not the player. Register is the first place to look.
 *
 * ~165Hz is roughly where typical male and female speaking ranges divide; the
 * bands are a coarse split to make a pattern visible, not a claim about voices.
 */
function registerRows(
  byPlayer: Map<
    string,
    { f0: number | null; accSum: number; accCount: number; unheard: number; gates: number }
  >,
): RegisterRow[] {
  const bands: { label: string; min: number; max: number }[] = [
    { label: "low  (<140Hz)", min: 0, max: 140 },
    { label: "mid  (140-190)", min: 140, max: 190 },
    { label: "high (>190Hz)", min: 190, max: Infinity },
  ];
  return bands.map((band) => {
    let players = 0;
    let gates = 0;
    let accSum = 0;
    let accCount = 0;
    let unheard = 0;
    for (const p of byPlayer.values()) {
      if (p.f0 === null || p.f0 < band.min || p.f0 >= band.max) continue;
      if (p.gates === 0) continue;
      players += 1;
      gates += p.gates;
      accSum += p.accSum;
      accCount += p.accCount;
      unheard += p.unheard;
    }
    return {
      label: band.label,
      players,
      gates,
      acc: accCount === 0 ? 0 : accSum / accCount,
      unheardPct: gates === 0 ? 0 : (unheard / gates) * 100,
    };
  });
}

function pct(n: number, of: number): string {
  return of === 0 ? "  -  " : `${((n / of) * 100).toFixed(0)}%`.padStart(5);
}

/** Fixed-width columns, the `report.ts` house style. */
export function formatReport(r: Report): string {
  const out: string[] = [];

  out.push("");
  out.push(`sessions=${r.sessions}  players=${r.players}  returning=${r.returning}  runs=${r.runs}  gates=${r.gates}`);

  out.push("");
  out.push("funnel");
  out.push(`  landed      ${String(r.sessions).padStart(5)}`);
  out.push(`  mic ok      ${String(r.micOk).padStart(5)}  ${pct(r.micOk, r.sessions)}`);
  out.push(`  calibrated  ${String(r.calibrated).padStart(5)}  ${pct(r.calibrated, r.sessions)}`);
  out.push(`  played      ${String(r.played).padStart(5)}  ${pct(r.played, r.sessions)}`);

  if (Object.keys(r.micFailed).length > 0) {
    out.push("");
    out.push("mic failures");
    for (const [reason, n] of sorted(r.micFailed)) {
      out.push(`  ${reason.padEnd(20)}${String(n).padStart(4)}`);
    }
  }

  if (Object.keys(r.abandonedAt).length > 0) {
    out.push("");
    out.push("calibration abandoned at");
    for (const [step, n] of sorted(r.abandonedAt)) {
      out.push(`  ${step.padEnd(20)}${String(n).padStart(4)}`);
    }
  }

  out.push("");
  out.push("  tone  gates  perfect   good     ok   wall  unheard    acc   uttMs");
  for (const t of TONES) {
    const row = r.perTone[t];
    const acc = row.accCount === 0 ? "  -  " : row.accSum / row.accCount;
    const utt = row.gates === 0 ? 0 : row.uttSum / row.gates;
    out.push(
      `  T${t}   ${String(row.gates).padStart(6)}  ${pct(row.perfect, row.gates)}  ${pct(row.good, row.gates)}  ` +
        `${pct(row.ok, row.gates)}  ${pct(row.collision, row.gates)}  ${pct(row.unheard, row.gates)}  ` +
        `${typeof acc === "string" ? acc.padStart(5) : acc.toFixed(2).padStart(5)}  ${Math.round(utt).toString().padStart(6)}`,
    );
  }

  out.push("");
  out.push("by vocal register  (a tone failing in one band only is a mapping bug, not the player)");
  out.push("  band              players  gates    acc  unheard");
  for (const b of r.byRegister) {
    out.push(
      `  ${b.label.padEnd(16)}${String(b.players).padStart(8)}${String(b.gates).padStart(7)}` +
        `${b.acc === 0 ? "    -" : b.acc.toFixed(2).padStart(7)}${`${b.unheardPct.toFixed(0)}%`.padStart(9)}`,
    );
  }

  const quits = QUIT_BUCKETS.filter((b) => r.quitHistogram[b]).map(
    (b) => [b, r.quitHistogram[b]] as [string, number],
  );
  if (quits.length > 0) {
    out.push("");
    out.push("quit after N gates");
    const max = Math.max(...quits.map(([, n]) => n));
    for (const [bucket, n] of quits) {
      const bar = "#".repeat(Math.max(1, Math.round((n / max) * 24)));
      out.push(`  ${bucket}  ${bar} ${n}`);
    }
  }

  out.push("");
  out.push("devices");
  for (const [device, n] of sorted(r.devices)) {
    out.push(`  ${device.padEnd(20)}${String(n).padStart(4)}`);
  }

  for (const line of flags(r)) out.push(line);

  return out.join("\n");
}

function sorted(rec: Record<string, number>): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1]);
}

/**
 * The part worth reading first. Thresholds are judgement calls, not findings —
 * they exist to make a pattern impossible to scroll past, not to decide
 * anything.
 */
function flags(r: Report): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (out.length === 0) out.push("", "worth a look");
    out.push(`  ! ${s}`);
  };

  for (const t of TONES) {
    const row = r.perTone[t];
    if (row.gates < 20) continue;
    const unheardPct = (row.unheard / row.gates) * 100;
    if (unheardPct > 20) {
      add(
        `T${t} unheard ${unheardPct.toFixed(0)}% of ${row.gates} gates — creak, noise floor, or MIN_UTTERANCE_MS too high`,
      );
    }
    const wallPct = (row.collision / row.gates) * 100;
    if (wallPct > 40) {
      add(`T${t} walls ${wallPct.toFixed(0)}% — corridor may be asking for a rate no one produces`);
    }
  }

  if (r.sessions >= 10 && r.calibrated / r.sessions < 0.5) {
    add(
      `only ${((r.calibrated / r.sessions) * 100).toFixed(0)}% of sessions finish calibration — the funnel leaks before the game`,
    );
  }

  const withGates = r.byRegister.filter((b) => b.gates >= 20);
  if (withGates.length >= 2) {
    const best = Math.max(...withGates.map((b) => b.acc));
    const worst = Math.min(...withGates.map((b) => b.acc));
    if (best - worst > 0.15) {
      add(
        `accuracy varies ${(best - worst).toFixed(2)} across vocal registers — suspect the chao mapping before the players`,
      );
    }
  }

  return out;
}
