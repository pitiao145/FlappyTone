import { describe, expect, it } from "vitest";
import { Run, type RunSnapshot } from "./run.ts";
import { corridorChaoAt } from "./gates.ts";
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
): SimResult {
  const snapshots: RunSnapshot[] = [];
  let now = 0;
  for (let i = 0; i < frames; i++) {
    const s = run.snapshot();
    run.tickAudio(voice(s, i), now);
    run.tickFrame(DT, now);
    snapshots.push(run.snapshot());
    now += DT;
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

  it("50% unvoiced frames in a gate yield 'unheard' with hearts unchanged", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, (s, i) =>
      i % 2 === 0
        ? pitch(s.activeGate ? s.activeGate.corridorChao : 3)
        : pitch(null, s.birdChao),
    );
    const outcomes = outcomesOf(snapshots);
    expect(outcomes[0].outcome).toBe("unheard");
    const last = snapshots[snapshots.length - 1];
    expect(last.hearts).toBe(3);
    expect(last.score).toBe(0);
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
  it("scroll speed increases after 5 gates cleared", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 1200, trackCorridor);
    const speeds = snapshots.map((s) => s.difficulty.scrollSpeed);
    expect(speeds[0]).toBe(220);
    // The first ramp step lands exactly on base * 1.08 after 5 gates.
    expect(speeds.some((s) => Math.abs(s - 220 * 1.08) < 1e-9)).toBe(true);
    expect(Math.max(...speeds)).toBeGreaterThan(220 * 1.08);
  });

  it("does not ramp on gates the player failed", () => {
    // Colliding on every gate: the run ends on 3 hearts, but even before that
    // the game must not have sped up on someone who is struggling.
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, () => pitch(1));
    const speeds = snapshots.map((s) => s.difficulty.scrollSpeed);
    expect(Math.max(...speeds)).toBe(220);
  });

  it("does not ramp on gates it couldn't hear", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 2000, (s) => pitch(null, s.birdChao));
    expect(outcomesOf(snapshots).length).toBeGreaterThanOrEqual(5);
    expect(
      Math.max(...snapshots.map((s) => s.difficulty.scrollSpeed)),
    ).toBe(220);
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
      expect(g.corridorChao).toBeCloseTo(corridorChaoAt(g.tone, g.t), 10);
      expect(g.t).toBeGreaterThanOrEqual(0);
      expect(g.t).toBeLessThanOrEqual(1);
    }
    // T1's corridor is flat at chao 5, so the ghost line should report exactly that.
    const t1 = inGate.filter((s) => s.activeGate!.tone === 1);
    expect(t1.length).toBeGreaterThan(0);
    for (const s of t1) {
      expect(s.activeGate!.corridorChao).toBe(5);
    }
  });
});

describe("Run — pace", () => {
  it("defaults to the PRD baseline difficulty", () => {
    const run = new Run({ mode: "game", width: 420, rand: () => 0.1 });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(220);
    expect(run.snapshot().difficulty.restMs).toBeCloseTo(900);
  });

  it("a relaxed pace slows scroll and stretches rest for the whole run", () => {
    const run = new Run({
      mode: "game",
      width: 420,
      rand: () => 0.1,
      pace: "relaxed",
    });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(220 * 0.75);
    expect(run.snapshot().difficulty.restMs).toBeCloseTo(900 * 2);
  });

  it("pace also applies in tutorial mode", () => {
    const run = new Run({ mode: "tutorial", width: 420, pace: "normal" });
    expect(run.snapshot().difficulty.scrollSpeed).toBeCloseTo(220 * 0.9);
  });
});

describe("Run — cue and listen/your-turn phases", () => {
  it("starts with no cue and a null phase", () => {
    const run = newGameRun();
    const s = run.snapshot();
    expect(s.cue).toBeNull();
    expect(s.phase).toBeNull();
  });

  it("fires the cue ~300ms before the gate's leading edge enters the screen", () => {
    const run = newGameRun();
    const { snapshots } = simulate(run, 400, trackCorridor);
    const firstCued = snapshots.find((s) => s.cue !== null);
    expect(firstCued).toBeDefined();
    const cue = firstCued!.cue!;
    // The cued gate's right edge should still be at most ~300ms of travel
    // past the screen's right edge (it fires as soon as the lead is reached).
    const gate = firstCued!.gates.find((g) => g.xStart === cue.xStart)!;
    const msUntilOnScreen =
      ((gate.x1 - W) / firstCued!.difficulty.scrollSpeed) * 1000;
    expect(msUntilOnScreen).toBeLessThanOrEqual(300);
    expect(msUntilOnScreen).toBeGreaterThan(300 - 3 * DT);
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
