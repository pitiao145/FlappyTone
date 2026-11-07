import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ABANDON_AFTER_MS, createAwayWatch } from "./abandonWatch.ts";
import { runLogOutcome, type LogOutcome } from "./runTrend.ts";

/**
 * A stand-in for `Game.tsx`'s wiring (brief 31): one run, the away watch, and
 * the three exits that report a `run_end`. Uses the real watch and the real
 * `runLogOutcome`, with spies where Game calls `track`, `postRunLog`,
 * `stopMic` and `acquireMicStream`.
 */
function harness() {
  let t = 0;
  const runEnds: { reason: string; idle_ms?: number }[] = [];
  const runLogs: LogOutcome[] = [];
  const stopMic = vi.fn();
  const acquireMicStream = vi.fn();
  const resumed = vi.fn();
  let finished = false;

  const reportRunEnd = (reason: LogOutcome | "abandoned", idleMs?: number) => {
    runEnds.push(reason === "abandoned" ? { reason, idle_ms: idleMs } : { reason });
    runLogs.push(runLogOutcome(reason, "game", 2));
  };
  const watch = createAwayWatch({
    now: () => t,
    onAbandon: (idleMs) => {
      if (finished) return;
      finished = true;
      reportRunEnd("abandoned", idleMs);
      stopMic();
    },
  });
  return {
    watch,
    runEnds,
    runLogs,
    stopMic,
    acquireMicStream,
    resumed,
    advance(ms: number) {
      t += ms;
      vi.advanceTimersByTime(ms);
    },
    /** The pause menu's Resume: a no-op once the run has ended. */
    resume() {
      if (!finished) resumed();
    },
    gameOver() {
      if (finished) return;
      finished = true;
      watch.finish();
      reportRunEnd("out_of_hearts");
      stopMic();
    },
    /** Game's teardown: re-acquires a streamless mic unless the run was abandoned. */
    teardown(streamless: boolean) {
      watch.finish();
      if (streamless && !watch.abandoned()) acquireMicStream();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("abandoned run (brief 31)", () => {
  it("is two minutes", () => {
    expect(ABANDON_AFTER_MS).toBe(120_000);
  });

  it("hidden less than the limit: resumes, no run_end", () => {
    const h = harness();
    h.watch.setAway(true);
    h.advance(ABANDON_AFTER_MS - 1);
    h.watch.setAway(false);
    h.resume();
    h.advance(ABANDON_AFTER_MS * 5);
    expect(h.resumed).toHaveBeenCalledOnce();
    expect(h.runEnds).toEqual([]);
    expect(h.stopMic).not.toHaveBeenCalled();
  });

  it("hidden past the limit: one run_end 'abandoned', one run log 'quit', mic stopped, no re-acquire", () => {
    const h = harness();
    h.advance(5_000);
    h.watch.setAway(true);
    h.advance(ABANDON_AFTER_MS);
    // Still away much later, and the page hidden on top: nothing more.
    h.watch.setAway(true);
    h.advance(ABANDON_AFTER_MS * 10);
    h.watch.pageGone();
    h.watch.setAway(false);
    h.resume();
    h.teardown(true);

    expect(h.runEnds).toEqual([{ reason: "abandoned", idle_ms: ABANDON_AFTER_MS }]);
    expect(h.runLogs).toEqual(["quit"]);
    expect(h.stopMic).toHaveBeenCalledOnce();
    expect(h.acquireMicStream).not.toHaveBeenCalled();
    expect(h.resumed).not.toHaveBeenCalled();
  });

  it("game over after a resume still sends exactly one run_end", () => {
    const h = harness();
    h.watch.setAway(true);
    h.advance(60_000);
    h.watch.setAway(false);
    h.resume();
    h.gameOver();
    // A later hide (or page close) must not end it a second time.
    h.watch.setAway(true);
    h.advance(ABANDON_AFTER_MS * 2);
    h.watch.pageGone();
    expect(h.runEnds).toEqual([{ reason: "out_of_hearts" }]);
    expect(h.runLogs).toEqual(["finished"]);
  });

  it("each trip away gets the full limit", () => {
    const h = harness();
    h.watch.setAway(true);
    h.advance(100_000);
    h.watch.setAway(false);
    h.watch.setAway(true);
    h.advance(100_000);
    expect(h.runEnds).toEqual([]);
    h.advance(20_000);
    expect(h.runEnds).toEqual([{ reason: "abandoned", idle_ms: ABANDON_AFTER_MS }]);
  });

  it("a page closed mid-run ends it at once, with idle 0 when it was in view", () => {
    const h = harness();
    h.advance(30_000);
    h.watch.pageGone();
    expect(h.runEnds).toEqual([{ reason: "abandoned", idle_ms: 0 }]);
    expect(h.stopMic).toHaveBeenCalledOnce();
  });

  it("a teardown that was not an abandon still restores a streamless mic", () => {
    const h = harness();
    h.teardown(true);
    expect(h.acquireMicStream).toHaveBeenCalledOnce();
  });
});

describe("runLogOutcome", () => {
  it("logs an abandoned run as quit (the server accepts no other value)", () => {
    expect(runLogOutcome("abandoned", "game", 3)).toBe("quit");
    expect(runLogOutcome("abandoned", "tutorial", 0)).toBe("quit");
  });
  it("keeps the existing mapping", () => {
    expect(runLogOutcome("out_of_hearts", "drill", 2)).toBe("finished");
    expect(runLogOutcome("out_of_hearts", "game", 0)).toBe("out_of_hearts");
    expect(runLogOutcome("out_of_hearts", "tutorial", 3)).toBe("out_of_hearts");
    expect(runLogOutcome("quit", "game", 3)).toBe("quit");
    expect(runLogOutcome("restart", "game", 3)).toBe("restart");
  });
});
