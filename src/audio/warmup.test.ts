import { describe, expect, it } from "vitest";
import { warmupWait } from "./warmup.ts";

/**
 * A deterministic stand-in for setTimeout: every sleep resolves in virtual
 * time, and `advance` runs the clock forward. Real timers would make these
 * tests either slow (2.5s) or flaky.
 */
function fakeClock() {
  let now = 0;
  const pending: Array<{ at: number; resolve: () => void }> = [];
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => pending.push({ at: now + Math.max(0, ms), resolve }));
  const advance = async (ms: number): Promise<void> => {
    now += ms;
    for (const t of pending.filter((p) => p.at <= now)) {
      pending.splice(pending.indexOf(t), 1);
      t.resolve();
    }
    // Let the awaiting continuations run.
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return { sleep, advance, now: () => now };
}

describe("warmupWait", () => {
  it("resolves at the floor when the clip is already loaded", async () => {
    const clock = fakeClock();
    let outcome: string | null = null;
    void warmupWait(() => Promise.resolve(), {
      minMs: 400,
      maxMs: 2500,
      sleep: clock.sleep,
    }).then((o) => {
      outcome = o;
    });

    await clock.advance(399);
    expect(outcome).toBeNull(); // the floor is real: no flash on a warm cache
    await clock.advance(1);
    expect(outcome).toBe("ready");
  });

  it("gives up at the cap rather than waiting forever", async () => {
    const clock = fakeClock();
    let outcome: string | null = null;
    // A load that never settles — a dead network.
    void warmupWait(() => new Promise<void>(() => {}), {
      minMs: 400,
      maxMs: 2500,
      sleep: clock.sleep,
    }).then((o) => {
      outcome = o;
    });

    await clock.advance(2499);
    expect(outcome).toBeNull();
    await clock.advance(1);
    expect(outcome).toBe("timeout");
  });

  it("waits for a slow-but-arriving clip, up to the cap", async () => {
    const clock = fakeClock();
    let resolveClip = (): void => {};
    const clip = new Promise<void>((r) => {
      resolveClip = r;
    });
    let outcome: string | null = null;
    void warmupWait(() => clip, { minMs: 400, maxMs: 2500, sleep: clock.sleep }).then(
      (o) => {
        outcome = o;
      },
    );

    await clock.advance(1200);
    expect(outcome).toBeNull(); // past the floor, still waiting on the clip
    resolveClip();
    await clock.advance(0);
    expect(outcome).toBe("ready");
  });

  it("never rejects when the load fails", async () => {
    const clock = fakeClock();
    let outcome: string | null = null;
    let rejected = false;
    void warmupWait(() => Promise.reject(new Error("no clips source")), {
      minMs: 400,
      maxMs: 2500,
      sleep: clock.sleep,
    }).then(
      (o) => {
        outcome = o;
      },
      () => {
        rejected = true;
      },
    );

    await clock.advance(400);
    expect(rejected).toBe(false);
    // A failed load has "settled" — there is nothing left to wait for — but it
    // is not readiness, and must not report as such. The cue will be synthetic.
    expect(outcome).toBe("failed");
  });

  it("survives a synchronous throw from the loader", async () => {
    const clock = fakeClock();
    let outcome: string | null = null;
    void warmupWait(
      () => {
        throw new Error("boom");
      },
      { minMs: 400, maxMs: 2500, sleep: clock.sleep },
    ).then((o) => {
      outcome = o;
    });
    await clock.advance(400);
    expect(outcome).toBe("failed");
  });
});
