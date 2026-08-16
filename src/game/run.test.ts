import { afterEach, describe, expect, it } from "vitest";
import { BIRD_X_FRAC, Run, type RunSnapshot } from "./run.ts";
import { DEFAULT_TUNING, resetTuning, setTuning, tuning } from "./tuning.ts";
import {
  corridorChaoAt,
  shapeForTone,
  GATE_DURATION_S,
} from "./gates.ts";
import { loadWords, type Word } from "./words.ts";
import type { PitchState } from "../pitch/types.ts";

const W = 420;
const DT = 16;

/** A voiced PitchState sitting at a given chao, or an unvoiced one when chao is null. */
function pitch(chao: number | null, held = 3): PitchState {
  if (chao === null) {
    return {
      f0: null,
      clarity: 0,
      rms: 0,
      voiced: false,
      semitones: null,
      chao: null,
      smoothedChao: held,
    };
  }
  return {
    f0: 200,
    clarity: 0.95,
    rms: 0.1,
    voiced: true,
    semitones: 0,
    chao,
    smoothedChao: chao,
  };
}

interface SimResult {
  snapshots: RunSnapshot[];
}

/**
 * Drives a Run at fixed dt. `voice` returns the PitchState for the frame given
 * the snapshot at the top of that frame (so tests can track the corridor).
 */
function simulate(
  run: Run,
  frames: number,
  voice: (s: RunSnapshot, frame: number) => PitchState,
  dt = DT,
): SimResult {
  const snapshots: RunSnapshot[] = [];
  let now = 0;
  for (let i = 0; i < frames; i++) {
    const s = run.snapshot();
    run.tickAudio(voice(s, i), now);
    run.tickFrame(dt, now);
    snapshots.push(run.snapshot());
    now += dt;
  }
  return { snapshots };
}

/** Perfectly tracks the active gate's corridor; sits at chao 3 between gates. */
function trackCorridor(s: RunSnapshot): PitchState {
  return pitch(s.activeGate ? s.activeGate.corridorChao : 3);
}

/**
 * Deterministic rand cycling a fixed sequence, so gate tones are predictable.
 * (`nextTone` bounds its reroll, so a degenerate sequence is safe — it just
 * makes the tone order harder to reason about.)
 */
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// -> tones 1, 1, 3, 4 repeating: first gate is always Tone 1.
function newGameRun(): Run {
  return new Run({
    mode: "game",
    width: W,
    rand: seqRand([0, 0, 0.5, 0.75]),
  });
}

// -> tones 3, 1, 4, 2 repeating: first gate is always Tone 3.
function newT3Run(): Run {
  return new Run({
    mode: "game",
    width: W,
    rand: seqRand([0.5, 0, 0.75, 0.25]),
  });
}

function outcomesOf(snapshots: RunSnapshot[]): Array<{
  outcome: string;
  tone: number;
}> {
  const seen: Array<{ outcome: string; tone: number }> = [];
  let lastAt = -1;
  for (const s of snapshots) {
    if (s.lastOutcome && s.lastOutcome.atMs !== lastAt) {
      lastAt = s.lastOutcome.atMs;
      seen.push({ outcome: s.lastOutcome.outcome, tone: s.lastOutcome.tone });
    }
  }
  return seen;
}

describe("Run — setup", () => {
  it("starts with 3 hearts, no score, not over, and a gate on the way", () => {
    const run = newGameRun();
    const s = run.snapshot();
    expect(s.hearts).toBe(3);
    expect(s.score).toBe(0);
    expect(s.over).toBe(false);
    expect(s.gates.length).toBeGreaterThan(0);
    expect(s.upcoming).not.toBeNull();
    expect(s.upcoming!.msUntil).toBeGreaterThan(0);
  });

  it("rests at chao 3 before any voice arrives", () => {
    const run = newGameRun();
    expect(run.snapshot().birdChao).toBeCloseTo(3);
  });
});

describe("Run — scoring a gate", () => {
  it("a perfect T1 stream scores perfect and loses no heart", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, trackCorridor);
    const outcomes = outcomesOf(snapshots);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes[0]).toEqual({ outcome: "perfect", tone: 1 });
    const last = snapshots[snapshots.length - 1];
    expect(last.hearts).toBe(3);
    expect(last.score).toBeGreaterThanOrEqual(300);
  });

  it("an off-corridor voiced stream collides and loses a heart", () => {
    const run = newGameRun();
    // T1 corridor sits at chao 5; sing chao 1 the whole way.
    const { snapshots } = simulate(run, 400, () => pitch(1));
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0].outcome).toBe("collision");
    // Check hearts at the moment the first gate resolved — keep singing badly
    // for 6s and the run ends, which is a different assertion.
    const firstResolved = snapshots.find((s) => s.lastOutcome !== null)!;
    expect(firstResolved.hearts).toBe(2);
  });

  it("a blip too short to be an utterance yields 'unheard' with hearts unchanged", () => {
    // A ~95ms on-corridor burst at the top of the gate, silence otherwise:
    // under MIN_UTTERANCE_MS, so the game says it couldn't hear rather than
    // scoring. Frame-level dropouts do *not* count against the player — gaps
    // under MERGE_GAP_MS merge — so the test has to be a genuinely short sound.
    // Fixed wall-clock, not a fraction of the gate: gate durations differ per
    // tone, so a fraction would be a different number of milliseconds each time.
    const run = newGameRun();
    const burstFrames = Math.floor(95 / DT);
    let spoken = 0;
    let wasInGate = false;
    const { snapshots } = simulate(run, 400, (s) => {
      const inGate = s.activeGate !== null;
      if (inGate && !wasInGate) spoken = 0; // a new gate opened
      wasInGate = inGate;
      if (!inGate || spoken >= burstFrames) return pitch(null, s.birdChao);
      spoken++;
      return pitch(s.activeGate!.corridorChao);
    });
    const outcomes = outcomesOf(snapshots);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const o of outcomes) expect(o.outcome).toBe("unheard");
    const last = snapshots[snapshots.length - 1];
    expect(last.hearts).toBe(3);
    expect(last.score).toBe(0);
  });

  it("a voiced run beginning before the gate opens is included in that gate's samples", () => {
    // The call-and-response case: the player answers the demo the moment it
    // ends, so their syllable is already underway when the gate arrives. The
    // in-gate part alone (~95ms) is under MIN_UTTERANCE_MS — only the seeded
    // head makes this an utterance the game can judge.
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, (s) => {
      const startingEarly =
        s.activeGate === null &&
        s.upcoming !== null &&
        s.upcoming.msUntil < 200;
      const inGateStretch = s.activeGate !== null && s.activeGate.t < 0.16;
      if (!startingEarly && !inGateStretch) return pitch(null, s.birdChao);
      // Both phases aim at the corridor's starting chao — where seeded samples
      // are scored, and where a T1 corridor stays.
      return pitch(corridorChaoAt(shapeForTone(s.upcoming?.tone ?? s.activeGate!.tone), 0));
    });

    const log = snapshots[snapshots.length - 1].gateLog;
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].seeded).toBeGreaterThan(0);
    expect(log[0].utteranceMs).toBeGreaterThanOrEqual(180);
    expect(log[0].outcome).not.toBe("unheard");
  });

  it("does not seed a gate from a hum the player never stopped", () => {
    // Continuous voicing at chao 3 into a T1 gate: we cannot tell an answer
    // from an idle hum, so nothing is seeded and the gate is judged on what
    // happened inside it.
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, (s) =>
      s.activeGate ? pitch(s.activeGate.corridorChao) : pitch(3),
    );
    const log = snapshots[snapshots.length - 1].gateLog;
    expect(log[0].seeded).toBe(0);
    expect(log[0].outcome).toBe("perfect");
  });

  it("a brief excursion outside the corridor does not collide", () => {
    // Two frames (~32ms) off-corridor, well under COLLISION_SUSTAIN_MS. At one
    // frame per collision this ended the gate; a 21ms sample is measurement,
    // not flying into a wall.
    const run = newGameRun();
    let offFrames = 0;
    const { snapshots } = simulate(run, 400, (s) => {
      if (!s.activeGate) return pitch(3);
      const off = s.activeGate.t > 0.4 && offFrames < 2;
      if (off) {
        offFrames++;
        // Far outside tolerance (0.8 chao), so only duration is under test.
        return pitch(s.activeGate.corridorChao - 3);
      }
      return pitch(s.activeGate.corridorChao);
    });
    expect(offFrames).toBe(2);
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0].outcome).not.toBe("collision");
    expect(snapshots[snapshots.length - 1].hearts).toBe(3);
  });

  it("a sustained excursion still collides and costs a heart", () => {
    // 220ms off-corridor — comfortably past COLLISION_SUSTAIN_MS.
    const run = newGameRun();
    let offFrames = 0;
    const offLimit = Math.ceil(220 / DT);
    const { snapshots } = simulate(run, 400, (s) => {
      if (!s.activeGate) return pitch(3);
      const off = s.activeGate.t > 0.4 && offFrames < offLimit;
      if (off) {
        offFrames++;
        return pitch(s.activeGate.corridorChao - 3);
      }
      return pitch(s.activeGate.corridorChao);
    });
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0].outcome).toBe("collision");
    const firstResolved = snapshots.find((s) => s.lastOutcome !== null)!;
    expect(firstResolved.hearts).toBe(2);
  });

  it("an unvoiced gap clears the excursion timer rather than bridging it", () => {
    // Off-corridor, dropout, off-corridor again — neither stretch is long
    // enough alone. Signal loss must never be what accumulates into a heart.
    const run = newGameRun();
    let phase = 0;
    const { snapshots } = simulate(run, 400, (s) => {
      if (!s.activeGate) return pitch(3);
      if (s.activeGate.t <= 0.4) return pitch(s.activeGate.corridorChao);
      phase++;
      // ~48ms off, ~32ms unvoiced, ~48ms off: 96ms of excursion total, but
      // never more than 48ms unbroken.
      if (phase <= 3) return pitch(s.activeGate.corridorChao - 3);
      if (phase <= 5) return pitch(null, s.birdChao);
      if (phase <= 8) return pitch(s.activeGate.corridorChao - 3);
      return pitch(s.activeGate.corridorChao);
    });
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0].outcome).not.toBe("collision");
  });

  it("hearts reaching 0 ends the run", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, () => pitch(1));
    expect(snapshots[snapshots.length - 1].hearts).toBe(0);
    expect(snapshots[snapshots.length - 1].over).toBe(true);
  });
});

describe("Run — Tone 3 handling", () => {
  it("holds position (no drift) through 200ms unvoiced inside a T3 gate and does not collide", () => {
    const run = newT3Run();
    let silenceStart: number | null = null;
    let chaoAtSilence = 0;
    const chaosDuringSilence: number[] = [];

    simulate(run, 400, (s, i) => {
      const inGate = s.activeGate !== null;
      if (inGate && s.activeGate!.t > 0.3 && silenceStart === null) {
        silenceStart = i;
        chaoAtSilence = s.birdChao;
      }
      const silent =
        silenceStart !== null && i - silenceStart < Math.round(200 / DT);
      if (silent) {
        chaosDuringSilence.push(s.birdChao);
        return pitch(null, s.birdChao);
      }
      return trackCorridor(s);
    });

    expect(silenceStart).not.toBeNull();
    // Held, not drifted: 200ms of drift toward chao 3 would move the dot by
    // ~1.07 chao (5.33 chao/s). It must stay put instead.
    const driftIn200ms = (5.33 * 200) / 1000;
    for (const c of chaosDuringSilence) {
      expect(Math.abs(c - chaoAtSilence)).toBeLessThan(driftIn200ms / 4);
    }
    expect(run.snapshot().hearts).toBe(3);
  });

  it("entry silence inside the grace period never costs a heart", () => {
    // 240ms of silence on entering the gate, then a perfectly on-corridor
    // voice. The held dot diverges from the moving corridor during grace —
    // that is our interpolation, not a wrong note, and must not collide.
    const run = newT3Run();
    let entryFrame: number | null = null;
    const { snapshots } = simulate(run, 400, (s, i) => {
      if (s.activeGate && entryFrame === null) entryFrame = i;
      const silent =
        entryFrame !== null && i - entryFrame < Math.round(240 / DT);
      return silent ? pitch(null, s.birdChao) : trackCorridor(s);
    });

    expect(entryFrame).not.toBeNull();
    const firstResolved = snapshots.find((s) => s.lastOutcome !== null)!;
    expect(firstResolved.lastOutcome!.outcome).not.toBe("collision");
    expect(firstResolved.hearts).toBe(3);
  });

  it("a T3 gate is never failed for signal loss alone", () => {
    const run = newT3Run();
    const { snapshots } = simulate(run, 400, (s) =>
      s.activeGate ? pitch(null, s.birdChao) : pitch(3),
    );
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0]).toEqual({ outcome: "unheard", tone: 3 });
    expect(snapshots[snapshots.length - 1].hearts).toBe(3);
  });
});

describe("Run — difficulty ramp", () => {
  it("scroll speed stays fixed as gates clear; tolerance still tightens", () => {
    const run = newGameRun();
    // Long enough to clear five gates at the shipped rest interval.
    const { snapshots } = simulate(run, 2400, trackCorridor);
    const speeds = snapshots.map((s) => s.difficulty.scrollSpeed);
    // scrollSpeed is fixed game-wide now — see gates.ts's rampDifficulty.
    expect(speeds.every((s) => s === DEFAULT_TUNING.baseScrollSpeed)).toBe(true);
    const tolerances = snapshots.map((s) => s.difficulty.toleranceH);
    expect(Math.min(...tolerances)).toBeLessThan(DEFAULT_TUNING.baseToleranceH);
  });

  it("does not ramp on gates the player failed", () => {
    // Colliding on every gate: the run ends on 3 hearts, but even before that
    // the game must not have sped up on someone who is struggling.
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, () => pitch(1));
    const speeds = snapshots.map((s) => s.difficulty.scrollSpeed);
    expect(Math.max(...speeds)).toBe(DEFAULT_TUNING.baseScrollSpeed);
  });

  it("does not ramp on gates it couldn't hear", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, (s) => pitch(null, s.birdChao));
    expect(outcomesOf(snapshots).length).toBeGreaterThanOrEqual(5);
    expect(
      Math.max(...snapshots.map((s) => s.difficulty.scrollSpeed)),
    ).toBe(DEFAULT_TUNING.baseScrollSpeed);
  });
});

describe("Run — frame timing", () => {
  it("clamps a huge dt so a backgrounded tab cannot skip a gate unscored", () => {
    const clamped = newGameRun();
    const stepped = newGameRun();

    // One 5-second frame vs. the same span in normal 100ms frames.
    clamped.tickFrame(5000, 5000);
    for (let i = 1; i <= 50; i++) stepped.tickFrame(100, i * 100);

    // The clamped run advanced by at most one frame's worth, so its first gate
    // is still ahead of it rather than silently passed.
    expect(clamped.snapshot().upcoming).not.toBeNull();
    const clampedX = clamped.snapshot().gates[0].x0;
    const steppedX = stepped.snapshot().gates[0].x0;
    expect(clampedX).toBeGreaterThan(steppedX);
  });
});

describe("Run — tutorial mode", () => {
  it("runs the fixed tone order, never loses hearts, ends after 8 gates", () => {
    const run = new Run({ mode: "tutorial", width: W });
    // Sing badly the whole way: tutorial must not punish.
    const { snapshots } = simulate(run, 4000, () => pitch(1));
    const outcomes = outcomesOf(snapshots);
    expect(outcomes.map((o) => o.tone)).toEqual([1, 1, 4, 4, 2, 2, 3, 3]);
    const last = snapshots[snapshots.length - 1];
    expect(last.hearts).toBe(3);
    expect(last.score).toBe(0);
    expect(last.over).toBe(true);
  });

  it("doubles the corridor tolerance", () => {
    const tut = new Run({ mode: "tutorial", width: W });
    const game = newGameRun();
    expect(tut.snapshot().gates[0].tolChao).toBeCloseTo(
      game.snapshot().gates[0].tolChao * 2,
      6,
    );
  });
});

describe("Run — snapshot extras", () => {
  it("flags pinned when the voice is clamped at the top of the range", () => {
    const run = newGameRun();
    run.tickAudio(pitch(5), 0);
    expect(run.snapshot().pinned).toBe("high");
    run.tickAudio(pitch(1), DT);
    expect(run.snapshot().pinned).toBe("low");
    run.tickAudio(pitch(3), DT * 2);
    expect(run.snapshot().pinned).toBeNull();
  });

  it("gives each queued gate a stable world-space xStart, ascending and unchanged by scrolling", () => {
    const run = newGameRun();
    const before = run.snapshot().gates;
    expect(before.length).toBeGreaterThanOrEqual(2);
    // xStart is ascending — the host relies on this to find "the next gate
    // past the last one cued" without re-scanning from the start.
    for (let i = 1; i < before.length; i++) {
      expect(before[i].xStart).toBeGreaterThan(before[i - 1].xStart);
    }
    // Scrolling changes screen-space x0/x1 but not the world-space xStart.
    run.tickFrame(DT, DT);
    const after = run.snapshot().gates;
    expect(after[0].xStart).toBe(before[0].xStart);
    expect(after[0].x0).toBeLessThan(before[0].x0);
  });

  it("raises the noisy flag when most voiced frames jump erratically", () => {
    const run = newGameRun();
    let now = 0;
    for (let i = 0; i < 200; i++) {
      run.tickAudio(pitch(i % 2 === 0 ? 1 : 5), now);
      run.tickFrame(DT, now);
      now += DT;
    }
    expect(run.snapshot().noisy).toBe(true);
  });

  it("does not raise the noisy flag on a steady voice", () => {
    const run = newGameRun();
    let now = 0;
    for (let i = 0; i < 200; i++) {
      run.tickAudio(pitch(3), now);
      run.tickFrame(DT, now);
      now += DT;
    }
    expect(run.snapshot().noisy).toBe(false);
  });

  it("keeps only the last 1.5s of trail", () => {
    const run = newGameRun();
    // Track the corridor so the run stays alive for the whole window.
    const { snapshots } = simulate(run, 400, trackCorridor);
    expect(snapshots[snapshots.length - 1].over).toBe(false);
    const now = 400 * DT;
    const trail = run.snapshot().trail;
    expect(trail.length).toBeGreaterThan(0);
    expect(now - trail[0].t).toBeLessThanOrEqual(1500 + DT);
  });

  it("reports the corridor centre so the renderer can draw the ghost line", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 200, trackCorridor);
    const inGate = snapshots.filter((s) => s.activeGate !== null);
    expect(inGate.length).toBeGreaterThan(0);
    for (const s of inGate) {
      const g = s.activeGate!;
      expect(g.corridorChao).toBeCloseTo(corridorChaoAt(shapeForTone(g.tone), g.t), 10);
      expect(g.t).toBeGreaterThanOrEqual(0);
      expect(g.t).toBeLessThanOrEqual(1);
    }
    // T1's corridor is flat, so the ghost line should report one constant.
    const t1 = inGate.filter((s) => s.activeGate!.tone === 1);
    expect(t1.length).toBeGreaterThan(0);
    for (const s of t1) {
      expect(s.activeGate!.corridorChao).toBeCloseTo(corridorChaoAt(shapeForTone(1), 0), 10);
    }
  });
});

describe("Run — pace", () => {
  it("defaults to the PRD baseline difficulty", () => {
    const run = new Run({ mode: "game", width: 420, rand: () => 0.1 });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(DEFAULT_TUNING.baseScrollSpeed);
    expect(run.snapshot().difficulty.restMs).toBeCloseTo(
      DEFAULT_TUNING.baseRestMs,
    );
  });

  it("a relaxed pace stretches rest for the whole run, leaving scrollSpeed fixed", () => {
    const run = new Run({
      mode: "game",
      width: 420,
      rand: () => 0.1,
      pace: "relaxed",
    });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(DEFAULT_TUNING.baseScrollSpeed);
    expect(run.snapshot().difficulty.restMs).toBeCloseTo(
      DEFAULT_TUNING.baseRestMs * 2,
    );
  });

  it("pace's rest stretch also applies in tutorial mode, scrollSpeed still fixed", () => {
    const run = new Run({ mode: "tutorial", width: 420, pace: "normal" });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(DEFAULT_TUNING.baseScrollSpeed);
  });
});

describe("Run — cue and listen/your-turn phases", () => {
  it("starts with no cue and a null phase", () => {
    const run = newGameRun();
    const s = run.snapshot();
    expect(s.cue).toBeNull();
    expect(s.phase).toBeNull();
  });

  it("fires the cue with cueApproachMs of travel left to the bird", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, trackCorridor);
    const firstCued = snapshots.find((s) => s.cue !== null);
    expect(firstCued).toBeDefined();
    const cue = firstCued!.cue!;
    // The cue is measured to the gate's *start* — the edge the bird enters —
    // so that the freeze ends roughly as the corridor arrives.
    const gate = firstCued!.gates.find((g) => g.xStart === cue.xStart)!;
    const travelToBirdMs =
      ((gate.x0 - W * BIRD_X_FRAC) / firstCued!.difficulty.scrollSpeed) * 1000;
    const approach = DEFAULT_TUNING.cueApproachMs;
    expect(travelToBirdMs).toBeLessThanOrEqual(approach);
    expect(travelToBirdMs).toBeGreaterThan(approach - 3 * DT);
    expect(cue.durationMs).toBe(500);
  });

  it("holds the listen phase until the bird enters the gate, then flips to active", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, trackCorridor);
    const firstListen = snapshots.findIndex((s) => s.phase === "listen");
    const firstActive = snapshots.findIndex((s) => s.phase === "active");
    expect(firstListen).toBeGreaterThanOrEqual(0);
    expect(firstActive).toBeGreaterThan(firstListen);
    // Every frame between cue fire and gate entry stays "listen".
    for (let i = firstListen; i < firstActive; i++) {
      expect(snapshots[i].phase).toBe("listen");
      expect(snapshots[i].cue).not.toBeNull();
    }
    // Once active, the cue is cleared — it is the player's turn.
    expect(snapshots[firstActive].cue).toBeNull();
  });

  it("cues every gate exactly once, in order", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, trackCorridor);
    const cuedStarts: number[] = [];
    for (const s of snapshots) {
      if (s.cue && cuedStarts[cuedStarts.length - 1] !== s.cue.xStart) {
        cuedStarts.push(s.cue.xStart);
      }
    }
    expect(cuedStarts.length).toBeGreaterThan(1);
    const sorted = [...cuedStarts].sort((a, b) => a - b);
    expect(cuedStarts).toEqual(sorted);
    expect(new Set(cuedStarts).size).toBe(cuedStarts.length);
  });
});

describe("Run — corridor width option", () => {
  it("wide widens every gate's tolerance by 1.4x over the default", () => {
    const normal = new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
    });
    const wide = new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
      corridor: "wide",
    });
    const gN = normal.snapshot().gates[0];
    const gW = wide.snapshot().gates[0];
    expect(gN.tone).toBe(gW.tone);
    expect(gW.tolChao).toBeCloseTo(gN.tolChao * 1.4);
  });
});

describe("Run — pause cue style", () => {
  function newPauseRun(): Run {
    return new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
      cueStyle: "pause",
    });
  }

  it("fires at a fixed distance from the bird, not once the gate fits on screen", () => {
    // The gate may still be off the right edge — the renderer draws a frozen
    // example at a fixed spot rather than at the gate's real position, so how
    // wide the corridor happens to be no longer decides the timing.
    const { snapshots } = simulate(newPauseRun(), 400, trackCorridor);
    const firstCued = snapshots.find((s) => s.cue !== null)!;
    const gate = firstCued.gates.find(
      (g) => g.xStart === firstCued.cue!.xStart,
    )!;
    const travelMs =
      ((gate.x0 - W * BIRD_X_FRAC) / firstCued.difficulty.scrollSpeed) * 1000;
    expect(travelMs).toBeLessThanOrEqual(tuning().cueApproachMs + DT);
    expect(travelMs).toBeGreaterThan(tuning().cueApproachMs - 4 * DT);
  });

  it("freezes the world for the demo plus a beat, then resumes", () => {
    const { snapshots } = simulate(newPauseRun(), 600, trackCorridor);
    const cueAt = snapshots.findIndex((s) => s.cue !== null);
    expect(cueAt).toBeGreaterThanOrEqual(0);
    const xOf = (s: RunSnapshot) =>
      s.gates.find((g) => g.xStart === snapshots[cueAt].cue!.xStart)?.x0;

    // The default 500ms demo plus the tuned hold. Read from tuning rather than
    // written down, so moving the preparation window is not a test edit.
    const pauseMs = 500 + tuning().cuePauseHoldMs;
    const duringPause = Math.floor((pauseMs - 100) / DT);
    for (let i = cueAt + 1; i <= cueAt + duringPause; i++) {
      expect(xOf(snapshots[i])).toBe(xOf(snapshots[cueAt]));
    }
    const afterPause = cueAt + Math.ceil((pauseMs + 100) / DT);
    expect(xOf(snapshots[afterPause])).toBeLessThan(xOf(snapshots[cueAt])!);
  });

  it("still reaches the gate and scores it after the pause", () => {
    const { snapshots } = simulate(newPauseRun(), 2500, trackCorridor);
    const outcomes = outcomesOf(snapshots);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes[0].outcome).toBe("perfect");
  });
});

describe("Run — call-and-response gap (spec B3)", () => {
  afterEach(() => resetTuning());

  /**
   * How long after the demo finishes the player waits before the corridor is
   * actually there to fly. Measured in play at 1161–1440ms, with the HUD still
   * reading "listen…" while the player had already answered.
   *
   * `randValue` picks the tone: nextTone reads floor(rand * 4) + 1.
   */
  function responseGapMs(randValue = 0): number {
    const run = new Run({
      mode: "game",
      width: W,
      rand: () => randValue,
      cueStyle: "pause",
      cueDurationMsFor: () => 500,
    });
    const { snapshots } = simulate(run, 4000, trackCorridor);
    const cueAt = snapshots.findIndex((s) => s.cue !== null);
    const activeAt = snapshots.findIndex((s) => s.activeGate !== null);
    expect(cueAt).toBeGreaterThanOrEqual(0);
    expect(activeAt).toBeGreaterThan(cueAt);
    return (activeAt - cueAt) * DT - 500 - tuning().cuePauseHoldMs;
  }

  it("the gap is cueApproachMs, not whatever is left of the approach", () => {
    setTuning({ cueApproachMs: 300 });
    expect(responseGapMs()).toBeGreaterThan(250);
    expect(responseGapMs()).toBeLessThan(360);
  });

  it("the gap is the same for every tone", () => {
    // It was not: the cue could not fire until the gate was fully on screen,
    // and a T3 corridor is more than twice as wide as a T4 one, so the pause
    // landed nearly on top of a T3 gate and well clear of a T1 one. Reported
    // in play as "for T3 the dot pauses very close to the gate start".
    const gaps = [0, 0.3, 0.5, 0.9].map((r) => responseGapMs(r));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2 * DT);
  });

  it("cueApproachMs buys as much approach as it asks for", () => {
    setTuning({ cueApproachMs: 300 });
    const tight = responseGapMs();
    setTuning({ cueApproachMs: 1200 });
    expect(responseGapMs()).toBeGreaterThan(tight + 700);
  });
});

describe("Run — cuePaused flag", () => {
  it("is set exactly while a pause-style demo freezes the world", () => {
    const run = new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
      cueStyle: "pause",
    });
    const { snapshots } = simulate(run, 600, trackCorridor);
    const cueAt = snapshots.findIndex((s) => s.cue !== null);
    const pauseMs = 500 + tuning().cuePauseHoldMs;
    expect(snapshots[cueAt].cuePaused).toBe(true);
    // Still paused most of the way through the window…
    expect(snapshots[cueAt + Math.floor((pauseMs - 100) / DT)].cuePaused).toBe(true);
    // …and released after it.
    expect(snapshots[cueAt + Math.ceil((pauseMs + 100) / DT)].cuePaused).toBe(false);
  });

  // Demo off is implemented entirely by never cueing, so this one assertion
  // covers the clip, the demo trace, the "listen" banner and the freeze.
  it("never cues or freezes with the demo off", () => {
    const run = new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
      cueStyle: "off",
    });
    const { snapshots } = simulate(run, 600, trackCorridor);
    expect(snapshots.some((s) => s.cue !== null)).toBe(false);
    expect(snapshots.some((s) => s.cuePaused)).toBe(false);
    expect(snapshots.some((s) => s.phase === "listen")).toBe(false);
  });
});

describe("Run — per-tone cue duration", () => {
  it("uses the injected duration for the cued tone", () => {
    const run = new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0, 0.5, 0.75]),
      // A wordless run: the inventory is empty, so the host is asked for the
      // tone's own cue length.
      cueDurationMsFor: (_word, tone) => 400 + tone * 100,
    });
    const { snapshots } = simulate(run, 400, trackCorridor);
    const cued = snapshots.find((s) => s.cue !== null)!;
    expect(cued.cue!.durationMs).toBe(400 + cued.cue!.tone * 100);
  });
});

describe("T3 gate boundaries", () => {
  it("stops centre-drift on the frame the bird enters a T3 gate, not a frame after", () => {
    // Drift is correct *between* gates and forbidden inside a T3 one (PRD §6),
    // so the handover must happen on the entry frame itself. Run at the 100ms
    // dt clamp -- a stuttering phone -- where one drift step is 0.53 chao, so a
    // single stray frame of drift cannot hide inside easing noise.
    const SLOW = 100;
    const run = newT3Run();

    const { snapshots } = simulate(
      run,
      // Long enough to reach the gate through the demo freeze — which grew
      // when cuePauseHoldMs did.
      32,
      (s) => {
        // Quiet from just before the gate arrives, so the grace period has
        // already expired and the dot is mid-drift as it crosses the threshold.
        const silent =
          s.activeGate?.tone === 3 ||
          (s.upcoming?.tone === 3 && s.upcoming.msUntil <= 250);
        return silent ? pitch(null, s.birdChao) : pitch(5);
      },
      SLOW,
    );

    const entry = snapshots.findIndex((s) => s.activeGate?.tone === 3);
    expect(entry).toBeGreaterThan(0);
    const driftStep = (5.33 * SLOW) / 1000;
    const movedOnEntry = Math.abs(
      snapshots[entry].birdChao - snapshots[entry - 1].birdChao,
    );
    expect(movedOnEntry).toBeLessThan(driftStep / 4);
  });
});

describe("Run — outcome payload for feedback (spec B4)", () => {
  it("reports accuracy, points and combo alongside the outcome", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 900, trackCorridor);
    const resolved = snapshots
      .map((s) => s.lastOutcome)
      .filter((o): o is NonNullable<typeof o> => o !== null);
    expect(resolved.length).toBeGreaterThan(0);

    const first = resolved[0];
    // Flying the corridor exactly should score well and pay out.
    expect(first.accuracy).toBeGreaterThan(0.8);
    expect(first.points).toBeGreaterThan(0);
    expect(first.comboMult).toBeGreaterThanOrEqual(1);
  });

  it("carries the flown path, bounded to the gate", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 900, trackCorridor);
    const outcome = snapshots.map((s) => s.lastOutcome).find((o) => o !== null);
    expect(outcome).toBeTruthy();
    expect(outcome!.path.length).toBeGreaterThan(2);

    // Every point must lie inside the gate's own window: the trail also holds
    // the approach, and igniting that would celebrate pitch aimed at nothing.
    const spanMs =
      outcome!.path[outcome!.path.length - 1].t - outcome!.path[0].t;
    expect(spanMs).toBeLessThanOrEqual(1400);
  });

  it("keeps the path after the live trail has pruned past it", () => {
    const run = newGameRun();
    // TRAIL_SECONDS is 1.0s; run well past a resolved gate and confirm the
    // captured path is still intact rather than emptied by pruning.
    const { snapshots } = simulate(run, 1200, trackCorridor);
    const last = snapshots[snapshots.length - 1];
    const withPath = snapshots
      .map((s) => s.lastOutcome)
      .filter((o): o is NonNullable<typeof o> => o !== null);
    expect(withPath[withPath.length - 1].path.length).toBeGreaterThan(2);
    expect(last.lastOutcome!.path.length).toBeGreaterThan(2);
  });

  it("explains an unheard gate and stays silent about the others", () => {
    const run = newGameRun();
    // Never voice: every gate goes unheard, with nothing to blame but level.
    const { snapshots } = simulate(run, 900, () => pitch(null));
    const unheard = snapshots
      .map((s) => s.lastOutcome)
      .find((o) => o?.outcome === "unheard");
    expect(unheard?.hint).toBe("louder");

    const run2 = newGameRun();
    const cleared = simulate(run2, 900, trackCorridor)
      .snapshots.map((s) => s.lastOutcome)
      .find((o) => o !== null && o.outcome !== "unheard");
    expect(cleared?.hint).toBeNull();
  });
});

describe("Run — trail is drawn in the world's frame (spec B4)", () => {
  it("moves the trail at scroll speed, so it stays glued to the corridor", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 200, trackCorridor);

    // Take one trail point and follow it across two snapshots. It must recede
    // at exactly the world's scroll speed — the whole point of the fix.
    const withTrail = snapshots.filter((s) => s.trail.length > 2);
    expect(withTrail.length).toBeGreaterThan(2);

    const a = withTrail[withTrail.length - 2];
    const b = withTrail[withTrail.length - 1];
    // Mid-trail, so pruning can't drop it between the two snapshots.
    const probe = a.trail[Math.floor(a.trail.length / 2)];
    const sameT = b.trail.find((p) => p.t === probe.t);
    expect(sameT).toBeTruthy();

    const movedPx = probe.x - sameT!.x;
    const expectedPx = (b.difficulty.scrollSpeed * DT) / 1000;
    expect(movedPx).toBeCloseTo(expectedPx, 5);
  });

  it("puts the newest trail point at the bird, where the dot is drawn", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 120, trackCorridor);
    const s = snapshots[snapshots.length - 1];
    const newest = s.trail[s.trail.length - 1];
    // The sample was taken at the bird's x, before this frame's scroll.
    expect(newest.x).toBeLessThanOrEqual(W * BIRD_X_FRAC + 0.001);
    expect(newest.x).toBeGreaterThan(W * BIRD_X_FRAC - 20);
  });
});

describe("Run — timing slack (a right shape, slightly off the beat)", () => {
  /**
   * Flies the corridor's exact contour, but shifted in time — the reported
   * failure mode: "I did the shape pretty much perfectly, but I started a bit
   * early", which used to collide because tolerance was uniform while the cost
   * of being late is not.
   */
  function shifted(offsetMs: number) {
    return (s: RunSnapshot) => {
      if (!s.activeGate) return pitch(3);
      const { tone, t } = s.activeGate;
      const offsetT = offsetMs / (GATE_DURATION_S[tone] * 1000);
      return pitch(corridorChaoAt(shapeForTone(tone), t + offsetT));
    };
  }

  function collisionsFor(offsetMs: number): number {
    const run = newGameRun();
    const { snapshots } = simulate(run, 1600, shifted(offsetMs));
    return outcomesOf(snapshots).filter((o) => o.outcome === "collision").length;
  }

  it("clears a contour that is a beat early", () => {
    expect(collisionsFor(-80)).toBe(0);
  });

  it("clears a contour that is a beat late", () => {
    expect(collisionsFor(80)).toBe(0);
  });

  it("still walls off a contour that is wildly out of step", () => {
    // The slack forgives being slightly off, not being in a different place.
    // If this ever reaches 0 the wall has been deleted, not widened.
    expect(collisionsFor(400)).toBeGreaterThan(0);
  });

  it("still walls off a flat hum through a moving corridor", () => {
    // The clearest "wrong contour": correct range, no shape at all.
    const run = newGameRun();
    const { snapshots } = simulate(run, 1600, () => pitch(3));
    const collisions = outcomesOf(snapshots).filter(
      (o) => o.outcome === "collision",
    );
    expect(collisions.length).toBeGreaterThan(0);
  });
});

describe("Run — flying an inventory", () => {
  /** A minimal manifest: one word per tone, each with its own length and shape. */
  const words: Word[] = loadWords({
    clips: [
      { id: "ba1", hanzi: "八", pinyin: "bā", tone: 1, file: "ba1.wav", durationS: 1.1,
        polyline: [[0, 4.5], [1, 4.5]] },
      { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2, file: "ma2.wav", durationS: 0.95,
        polyline: [[0, 2.5], [0.4, 1.9], [1, 4.6]] },
      { id: "wo3", hanzi: "我", pinyin: "wǒ", tone: 3, file: "wo3.wav", durationS: 0.4,
        polyline: [[0, 2.4], [1, 1.6]] },
      { id: "ba4", hanzi: "爸", pinyin: "bà", tone: 4, file: "ba4.wav", durationS: 0.52,
        polyline: [[0, 4.5], [0.5, 4.4], [1, 1.3]] },
    ],
  });

  function wordRun() {
    return new Run({ mode: "game", width: W, rand: seqRand([0, 0.3, 0.6, 0.9]), words });
  }

  it("builds every gate from a word", () => {
    const { snapshots } = simulate(wordRun(), 300, () => pitch(3));
    const seen = snapshots.flatMap((s) => s.gates);
    expect(seen.length).toBeGreaterThan(0);
    for (const g of seen) expect(g.word).not.toBeNull();
  });

  it("gives the gate the clip's own length", () => {
    // Width in px is scrollSpeed * the clip's duration, so a gate lasts exactly
    // as long as the demo the player just heard (PRD §6).
    const { snapshots } = simulate(wordRun(), 300, () => pitch(3));
    const gates = snapshots.flatMap((s) => s.gates).filter((g) => g.word);
    expect(gates.length).toBeGreaterThan(0);
    // Every gate's width, divided by its own clip length, is the one scroll
    // speed — which is the invariant, and holds for every tone including 3
    // now that shapeForWord flies a word's own measured shape throughout.
    const speeds = gates.map((g) => (g.x1 - g.x0) / g.word!.durationS);
    for (const v of speeds) expect(v).toBeCloseTo(speeds[0], 6);
  });

  it("draws every tone's corridor from its own word, including 3", () => {
    const { snapshots } = simulate(wordRun(), 400, () => pitch(3));
    const gates = snapshots.flatMap((s) => s.gates);
    const t2 = gates.find((g) => g.tone === 2);
    if (t2) expect(corridorChaoAt(t2.shape, 0.4)).toBeCloseTo(1.9, 2);
    const t3 = gates.find((g) => g.tone === 3);
    // The fixture's T3 word falls to 1.6 and never rises — shapeForWord no
    // longer substitutes the citation shape, so the corridor should match.
    if (t3) expect(corridorChaoAt(t3.shape, 1)).toBeCloseTo(1.6, 1);
  });

  it("cues the word, so the host knows which clip to play", () => {
    const { snapshots } = simulate(wordRun(), 400, () => pitch(3));
    const cued = snapshots.find((s) => s.cue !== null);
    expect(cued?.cue?.word?.id).toBeTruthy();
  });

  it("puts the word in the HUD's upcoming slot", () => {
    const { snapshots } = simulate(wordRun(), 200, () => pitch(3));
    const withUpcoming = snapshots.find((s) => s.upcoming !== null)!;
    expect(withUpcoming.upcoming!.word?.pinyin).toBeTruthy();
  });

  it("still runs on an empty inventory, on the tuning defaults", () => {
    const run = new Run({ mode: "game", width: W, rand: seqRand([0, 0.3]), words: [] });
    const { snapshots } = simulate(run, 200, () => pitch(3));
    const gates = snapshots.flatMap((s) => s.gates);
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(g.word).toBeNull();
      expect(g.shape).toEqual(shapeForTone(g.tone));
    }
  });
});

describe("Run — demo dot waits out the consonant", () => {
  function onsetRun(onsetS: number): Run {
    const words: Word[] = loadWords({
      clips: [
        {
          id: "ma2",
          hanzi: "麻",
          pinyin: "má",
          tone: 2,
          file: "ma2.wav",
          durationS: 1.0,
          onsetS,
          polyline: [[0, 2.5], [0.4, 1.9], [1, 4.6]],
        },
      ],
    });
    return new Run({
      mode: "game",
      width: W,
      rand: seqRand([0, 0.3]),
      words,
      cueStyle: "pause",
    });
  }

  it("delays the demo dot by the clip's consonant", () => {
    const { snapshots } = simulate(onsetRun(0.19), 600, () => pitch(3));
    const cued = snapshots.find((s) => s.cue?.word)!;
    expect(cued.cue!.sweepDelayMs).toBeCloseTo(190, 0);
  });

  it("does not delay a dot with no consonant to wait for", () => {
    const { snapshots } = simulate(onsetRun(0), 600, () => pitch(3));
    const cued = snapshots.find((s) => s.cue?.word)!;
    expect(cued.cue!.sweepDelayMs).toBe(0);
  });
});
