import { beforeEach, describe, expect, it, vi } from "vitest";

const stops: Array<() => void> = [];
let resolveStart: ((s: unknown) => void) | null = null;

vi.mock("./mic.ts", () => ({
  MicError: class extends Error {},
  startMic: vi.fn(
    () =>
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
  ),
}));

const { ensureMic, getMicSession, MicCancelled, stopMic } = await import(
  "./session.ts"
);

function makeSession() {
  const stop = vi.fn();
  stops.push(stop);
  return { sampleRate: 48000, ctx: {} as AudioContext, stop };
}

describe("mic session cancellation", () => {
  beforeEach(() => {
    stops.length = 0;
    resolveStart = null;
  });

  it("closes a session that resolves after stopMic, rather than storing it", async () => {
    const pending = ensureMic();
    // Player navigates home while getUserMedia is still resolving.
    stopMic();
    const session = makeSession();
    resolveStart?.(session);

    await expect(pending).rejects.toBeInstanceOf(MicCancelled);
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(getMicSession()).toBeNull();
  });

  it("stores a session that resolves normally", async () => {
    const pending = ensureMic();
    const session = makeSession();
    resolveStart?.(session);

    await expect(pending).resolves.toBe(session);
    expect(getMicSession()).toBe(session);
    stopMic();
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(getMicSession()).toBeNull();
  });
});
