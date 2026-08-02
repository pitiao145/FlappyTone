import { beforeEach, describe, expect, it, vi } from "vitest";

/** Resolvers for each pending startMic call, in order. */
const pendingStarts: Array<(s: unknown) => void> = [];

vi.mock("./mic.ts", () => ({
  MicError: class extends Error {},
  startMic: vi.fn(
    () =>
      new Promise((resolve) => {
        pendingStarts.push(resolve);
      }),
  ),
}));

const { ensureMic, getMicSession, MicCancelled, stopMic } = await import(
  "./session.ts"
);
const { startMic } = await import("./mic.ts");

function makeSession() {
  return { sampleRate: 48000, ctx: {} as AudioContext, stop: vi.fn() };
}

describe("mic session cancellation", () => {
  beforeEach(() => {
    pendingStarts.length = 0;
    vi.mocked(startMic).mockClear();
    stopMic();
  });

  it("closes a session that resolves after stopMic, rather than storing it", async () => {
    const pending = ensureMic();
    // Player navigates home while getUserMedia is still resolving.
    stopMic();
    const session = makeSession();
    pendingStarts[0](session);

    await expect(pending).rejects.toBeInstanceOf(MicCancelled);
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(getMicSession()).toBeNull();
  });

  it("stores a session that resolves normally", async () => {
    const pending = ensureMic();
    const session = makeSession();
    pendingStarts[0](session);

    await expect(pending).resolves.toBe(session);
    expect(getMicSession()).toBe(session);
    stopMic();
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(getMicSession()).toBeNull();
  });

  it("starts a fresh session when called after a stop, while the old start is in flight", async () => {
    const doomed = ensureMic();
    stopMic();

    // Home then Play: this click must open its own mic rather than attaching
    // to the start stopMic already doomed, which would silently do nothing.
    const revived = ensureMic();
    expect(startMic).toHaveBeenCalledTimes(2);
    expect(revived).not.toBe(doomed);

    const abandoned = makeSession();
    const fresh = makeSession();
    pendingStarts[0](abandoned);
    pendingStarts[1](fresh);

    await expect(doomed).rejects.toBeInstanceOf(MicCancelled);
    await expect(revived).resolves.toBe(fresh);
    expect(abandoned.stop).toHaveBeenCalledTimes(1);
    expect(fresh.stop).not.toHaveBeenCalled();
    expect(getMicSession()).toBe(fresh);
  });
});
