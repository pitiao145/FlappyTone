/**
 * The demo-video scenario: what a marketing clip shows, as data.
 *
 * Dev-only (CLAUDE.md #7). The page (`page.ts`) drives a real `Run` with
 * scripted pitch instead of a microphone, so the corridors, scoring, combo,
 * hearts and the bird's reactions are the game's own — only the voice is
 * invented. This file is pure: no DOM, no Run, testable in Node.
 */

export type Format = "9:16" | "1:1" | "16:9";

/**
 * How the scripted voice flies one gate.
 *
 * - perfect: on the centreline.
 * - good:    a steady offset, about a third of the corridor.
 * - ok:      a loose, wavering flight that stays inside.
 * - wobble:  a visible wave around the centreline, inside the walls.
 * - wall:    on track, then breaks out through a wall — a lost heart.
 * - silent:  no voice — the gate reads "couldn't hear that".
 * - early / late: the right shape, shifted in time.
 */
export type Flight = "perfect" | "good" | "ok" | "wobble" | "wall" | "silent" | "early" | "late";

export const FLIGHTS: Flight[] = ["perfect", "good", "ok", "wobble", "wall", "silent", "early", "late"];

export interface ScenarioGate {
  /** A word id (`ma3b`) or its hanzi (`馬`), from the bundled catalog. */
  word: string;
  flight?: Flight;
  /** Play Jane's clip at this gate's demo cue. Defaults to the scenario's `audio`. */
  audio?: boolean;
  /** Freeze for the listen cue before this gate. Default true; false keeps flying while the clip plays. */
  listen?: boolean;
  /** Gap before this gate, as `Scenario.gap`. Defaults to the scenario's. */
  gap?: number;
}

export interface Card {
  title: string;
  subtitle?: string;
  seconds?: number;
}

/**
 * A results screen shown after the run, before the outro. Each is the game's
 * own component fed the run's real stats — nothing is invented.
 * - gameover: the game-over screen (score, tone-accuracy tiles, coach card).
 * - pause:    the pause menu over the frozen world, with the run's breakdown.
 * - share:    the share card image the game exports.
 */
export interface EndScreen {
  screen: "gameover" | "pause" | "share";
  seconds?: number;
  /** share only: the name on the card ("" keeps "I SCORED"). */
  name?: string;
}

export const END_SCREENS = ["gameover", "pause", "share"] as const;

export interface Scenario {
  format?: Format;
  fps?: number;
  /** The listen-then-fly demo before each gate. Default true, as in the game. */
  demo?: boolean;
  /** Draw score, combo, hearts and the word label. Default true. */
  hud?: boolean;
  /** Corridor width, as the setting. Default "normal". */
  corridor?: "narrow" | "normal" | "wide";
  /** Gap between gates as a share of the game's own rest gap. Default 0.5; 1 = as played. */
  gap?: number;
  /** Optional caption shown along the bottom for the whole clip. */
  caption?: string;
  intro?: Card;
  gates: ScenarioGate[];
  /** Results screens after the run, in order. */
  end?: EndScreen[];
  outro?: Card;
  /** Seconds of flight kept after the last gate resolves. Default 0.8. */
  tailSeconds?: number;
  /** Jane's clips at each demo cue (default true); a gate's own `audio` wins. */
  audio?: boolean;
  /** Music volume under the clips, 0–1. Default 0.35 when clips play, else 1. */
  musicVolume?: number;
  /** Path to an audio file to lay under the video (looped/trimmed to length). */
  music?: string;
}

/** Output pixel size and the logical canvas size the game is laid out in. */
export function frameSize(format: Format): { outW: number; outH: number; w: number; h: number } {
  switch (format) {
    case "1:1":
      return { outW: 1080, outH: 1080, w: 540, h: 540 };
    case "16:9":
      return { outW: 1920, outH: 1080, w: 960, h: 540 };
    default:
      // 420 is the game's own max width (PRD §4), so spacing matches the app.
      return { outW: 1080, outH: 1920, w: 420, h: 747 };
  }
}

/** Throws with a readable message on a bad scenario. */
export function validateScenario(s: unknown): Scenario {
  const sc = s as Scenario;
  if (!sc || typeof sc !== "object") throw new Error("scenario must be an object");
  if (!Array.isArray(sc.gates) || sc.gates.length === 0) throw new Error("scenario.gates must be a non-empty array");
  for (const [i, g] of sc.gates.entries()) {
    if (typeof g.word !== "string") throw new Error(`gates[${i}].word must be a string`);
    if (g.flight && !FLIGHTS.includes(g.flight)) {
      throw new Error(`gates[${i}].flight "${g.flight}" — use one of ${FLIGHTS.join(", ")}`);
    }
  }
  for (const [i, e] of (sc.end ?? []).entries()) {
    if (!END_SCREENS.includes(e.screen)) throw new Error(`end[${i}].screen "${e.screen}" — use one of ${END_SCREENS.join(", ")}`);
  }
  if (sc.format && !["9:16", "1:1", "16:9"].includes(sc.format)) throw new Error(`format "${sc.format}" — use 9:16, 1:1 or 16:9`);
  return sc;
}

/**
 * The scripted voice at progress `t` through a gate (t may run slightly
 * outside 0..1 — a real speaker starts a hair early and trails off).
 *
 * `centre(t)` is the corridor centreline in chao, `tol` the corridor's
 * half-width in chao. Returns null when the voice is silent.
 */
export function flightChao(
  flight: Flight,
  t: number,
  centre: (t: number) => number,
  tol: number,
): number | null {
  const c = (u: number) => centre(Math.min(1, Math.max(0, u)));
  switch (flight) {
    case "silent":
      return null;
    case "perfect":
      return c(t);
    case "good":
      return c(t) + 0.35 * tol;
    case "ok":
      return c(t) + 0.6 * tol * Math.sin(t * Math.PI * 3) - 0.25 * tol;
    case "wobble":
      return c(t) + 0.55 * tol * Math.sin(t * Math.PI * 5);
    case "early":
      return c(t + 0.12);
    case "late":
      return c(t - 0.12);
    case "wall": {
      // On the line, then a fast break out past the wall, held long enough
      // to count (collisionSustainMs). Breaks toward whichever side has room.
      if (t < 0.3) return c(t);
      const dir = c(t) > 3 ? -1 : 1;
      const k = Math.min(1, (t - 0.3) / 0.12);
      return c(t) + dir * k * 2.4 * tol;
    }
  }
}
