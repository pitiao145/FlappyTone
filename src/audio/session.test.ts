import { beforeEach, describe, expect, it, vi } from "vitest";

/** Resolvers for each pending startMic call, in order. */
const pendingStarts: Array<(s: unknown) => void> = [];
/** The `onLost` callback handed to the most recent startMic. */
let lastOnLost: (() => void) | undefined;

vi.mock("./mic.ts", () => ({
  MicError: class extends Error {},
  startMic: vi.fn(
    (_sink: unknown, onLost?: () => void) =>
      new Promise((resolve) => {
        lastOnLost = onLost;
        pendingStarts.push(resolve);
      }),
  ),
}));

const {
  ensureMic,
  getMicSession,
  getMicStatus,
  MicCancelled,
  recoverMic,
  releaseMicStream,
  stopMic,
} = await import("./session.ts");
const { startMic } = await import("./mic.ts");

function makeSession() {
  return { sampleRate: 48000, ctx: {} as AudioContext, stop: vi.fn() };
}

/** A session with the full stream lifecycle, for recovery tests. */
function makeLiveSession() {
  const ctx = { state: "running" } as { state: string };
  let live = true;
  return {
    sampleRate: 48000,
    ctx: ctx as unknown as AudioContext,
    hasStream: vi.fn(() => live),
    releaseStream: vi.fn(() => {
      live = false;
    }),
    acquireStream: vi.fn(async () => {
      live = true;
    }),
    stop: vi.fn(() => {
      live = false;
    }),
  };
}

describe("mic session cancellation", () => {
  beforeEach(() => {
    pendingStarts.length = 0;
    lastOnLost = undefined;
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

describe("mic status & recovery", () => {
  beforeEach(() => {
    pendingStarts.length = 0;
    lastOnLost = undefined;
    vi.mocked(startMic).mockClear();
    stopMic();
  });

  it("goes live on open and idle on stop", async () => {
    const pending = ensureMic();
    pendingStarts[0](makeLiveSession());
    await pending;
    expect(getMicStatus()).toBe("live");
    stopMic();
    expect(getMicStatus()).toBe("idle");
  });

  it("recovers a lost mic by releasing and re-acquiring the stream", async () => {
    const pending = ensureMic();
    const s = makeLiveSession();
    pendingStarts[0](s);
    await pending;

    // An OS interruption fires the onLost handed to startMic.
    lastOnLost?.();
    // The proactive recovery runs its release + re-acquire microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(s.releaseStream).toHaveBeenCalledTimes(1);
    expect(s.acquireStream).toHaveBeenCalledTimes(1);
    expect(getMicStatus()).toBe("live");
  });

  it("marks the mic lost when re-acquisition fails", async () => {
    const pending = ensureMic();
    const s = makeLiveSession();
    s.acquireStream.mockRejectedValueOnce(new Error("still held"));
    s.hasStream.mockReturnValue(false);
    pendingStarts[0](s);
    await pending;

    await recoverMic();
    expect(getMicStatus()).toBe("lost");
  });

  it("does not recover while the mic is deliberately released for a cue", async () => {
    const pending = ensureMic();
    const s = makeLiveSession();
    pendingStarts[0](s);
    await pending;

    releaseMicStream(); // cue release: hasStream() is now false by design
    s.acquireStream.mockClear();
    await recoverMic();

    // The cue-release flag must stop recovery from re-acquiring mid-cue (which
    // on iOS would flip the route back to the earpiece while the cue plays).
    expect(s.acquireStream).not.toHaveBeenCalled();
  });
});
