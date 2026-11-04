// The `mic` event's shape from `ensureMic` (brief 27): every request sends its
// surface, the permission state read before getUserMedia, the time to the
// result and the attempt number; a failure adds its reason and error name.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tracked: unknown[] = [];
vi.mock("../analytics/client.ts", () => ({ track: (e: unknown) => tracked.push(e) }));
vi.mock("../lib/micPermission.ts", () => ({ queryMicPermission: async () => "prompt" }));

let nextStart: () => Promise<unknown> = async () => ({ stop: vi.fn() });
vi.mock("./mic.ts", async (orig) => {
  const real = await orig<typeof import("./mic.ts")>();
  return { ...real, startMic: vi.fn(() => nextStart()) };
});

// The node test env has no window; session.ts listens for pagehide on it.
const fakeWindow = new EventTarget();
vi.stubGlobal("window", fakeWindow);

const { acquireMicStream, ensureMic, releaseMicStream, stopMic } = await import("./session.ts");
const { toMicError } = await import("./mic.ts");

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("mic event", () => {
  beforeEach(() => {
    tracked.length = 0;
    stopMic();
  });

  it("sends surface, perm_before, ms and attempt on success", async () => {
    nextStart = async () => ({ stop: vi.fn() });
    await ensureMic("demo");
    await flush();
    expect(tracked).toEqual([
      { type: "mic", ok: true, surface: "demo", perm_before: "prompt", ms: expect.any(Number), attempt: expect.any(Number) },
    ]);
    const ev = tracked[0] as { ms: number };
    expect(ev.ms % 100).toBe(0);
  });

  it("adds reason and error_name on a failure, and counts attempts", async () => {
    nextStart = async () => {
      throw toMicError(new DOMException("busy", "NotReadableError"));
    };
    await expect(ensureMic("visualizer-tool")).rejects.toThrow();
    await expect(ensureMic("visualizer-tool")).rejects.toThrow();
    await flush();
    const [a, b] = tracked as Array<Record<string, unknown>>;
    expect(a).toMatchObject({
      type: "mic",
      ok: false,
      reason: "in-use",
      error_name: "NotReadableError",
      stage: "gum",
      denial: "none",
      surface: "visualizer-tool",
      perm_before: "prompt",
    });
    expect((b.attempt as number) - (a.attempt as number)).toBe(1);
  });

  it("defaults the surface to the app", async () => {
    nextStart = async () => ({ stop: vi.fn() });
    await ensureMic();
    await flush();
    expect(tracked[0]).toMatchObject({ surface: "app" });
  });

  it("sends the denial kind of a refused mic", async () => {
    nextStart = async () => {
      throw toMicError(new DOMException("Permission dismissed", "NotAllowedError"));
    };
    await expect(ensureMic("app-settings")).rejects.toThrow();
    await flush();
    expect(tracked[0]).toMatchObject({ reason: "permission-denied", denial: "dismissed", surface: "app-settings" });
  });

  it("sends mic_unanswered on pagehide while the prompt is open, once", async () => {
    let settle: (v: unknown) => void = () => {};
    nextStart = () => new Promise((r) => (settle = r));
    const pending = ensureMic("demo");
    fakeWindow.dispatchEvent(new Event("pagehide"));
    fakeWindow.dispatchEvent(new Event("pagehide"));
    expect(tracked).toEqual([{ type: "mic_unanswered", surface: "demo", ms: expect.any(Number), attempt: expect.any(Number) }]);
    settle({ stop: vi.fn() });
    await pending;
  });

  it("sends nothing on pagehide once the request has settled", async () => {
    nextStart = async () => ({ stop: vi.fn() });
    await ensureMic("demo");
    tracked.length = 0;
    fakeWindow.dispatchEvent(new Event("pagehide"));
    expect(tracked).toEqual([]);
  });

  it("sends mic_reacquire when taking the mic back after a cue fails", async () => {
    const session = {
      stop: vi.fn(),
      releaseStream: vi.fn(),
      acquireStream: vi.fn(async () => {
        throw toMicError(new DOMException("Permission denied", "NotAllowedError"));
      }),
    };
    nextStart = async () => session;
    await ensureMic();
    tracked.length = 0;
    releaseMicStream();
    await acquireMicStream();
    expect(tracked).toEqual([
      {
        type: "mic_reacquire",
        ok: false,
        phase: "cue",
        idle_ms: expect.any(Number),
        reason: "permission-denied",
        error_name: "NotAllowedError",
        denial: "denied",
      },
    ]);
  });
});
