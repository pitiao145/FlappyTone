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

const { ensureMic, stopMic } = await import("./session.ts");
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
});
