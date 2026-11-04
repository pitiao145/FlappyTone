// `startMic`'s call order: the mic is requested synchronously, before any
// `await`, so WebKit still sees the tap (see
// docs/reports/mic-permission-research-2026-11-04.md). And a failure at any
// step closes the context and stops a mic that arrives late.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicError, micDenial, startMic, toMicError } from "./mic.ts";

const calls: string[] = [];
let resumeImpl: () => Promise<void>;
let addModuleImpl: () => Promise<void>;
let gumImpl: () => Promise<MediaStream>;
const contexts: FakeContext[] = [];
const lastCtx = (): FakeContext | undefined => contexts.at(-1);

class FakeContext {
  sampleRate = 48000;
  state = "suspended";
  onstatechange: (() => void) | null = null;
  close = vi.fn(async () => {
    calls.push("close");
  });
  audioWorklet = {
    addModule: () => {
      calls.push("addModule");
      return addModuleImpl();
    },
  };
  constructor() {
    calls.push("new AudioContext");
    contexts.push(this);
  }
  resume() {
    calls.push("resume");
    return resumeImpl();
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
}

class FakeNode {
  port = { onmessage: null as unknown };
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return {
    track,
    stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream,
  };
}

beforeEach(() => {
  calls.length = 0;
  contexts.length = 0;
  resumeImpl = async () => {};
  addModuleImpl = async () => {};
  const { stream } = fakeStream();
  gumImpl = async () => stream;
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("AudioWorkletNode", FakeNode);
  vi.stubGlobal("navigator", {
    userAgent: "test",
    mediaDevices: {
      getUserMedia: () => {
        calls.push("getUserMedia");
        return gumImpl();
      },
    },
  });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startMic call order", () => {
  it("asks for the mic first, and starts every step before the first await", async () => {
    const pending = startMic(() => {});
    // Synchronous part of the call, still inside the tap:
    expect(calls).toEqual(["getUserMedia", "new AudioContext", "resume", "addModule"]);
    const s = await pending;
    expect(s.hasStream()).toBe(true);
  });

  it("closes the context and stops the late mic when the worklet fails", async () => {
    const { track, stream } = fakeStream();
    gumImpl = async () => stream;
    addModuleImpl = async () => {
      throw new DOMException("x", "AbortError");
    };
    const err = await startMic(() => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MicError);
    expect(err).toMatchObject({ kind: "unknown", stage: "worklet", errorName: "AbortError" });
    expect(lastCtx()?.close).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(track.stop).toHaveBeenCalled();
  });

  it("reports the context stage when resume fails", async () => {
    resumeImpl = async () => {
      throw new DOMException("x", "InvalidStateError");
    };
    await expect(startMic(() => {})).rejects.toMatchObject({ stage: "context" });
    expect(lastCtx()?.close).toHaveBeenCalled();
  });

  it("reports a refused mic as the gum stage and closes the context", async () => {
    gumImpl = async () => {
      throw new DOMException("Permission dismissed", "NotAllowedError");
    };
    await expect(startMic(() => {})).rejects.toMatchObject({
      kind: "permission-denied",
      stage: "gum",
      denial: "dismissed",
    });
    expect(lastCtx()?.close).toHaveBeenCalled();
  });
});

describe("micDenial", () => {
  const na = (m: string) => new DOMException(m, "NotAllowedError");
  it.each([
    ["Permission dismissed", "dismissed"],
    ["Permission denied", "denied"],
    ["Permission denied by user", "denied"],
    ["Permission denied by system", "system"],
    ["The request is not allowed by the user agent or the platform in the current context.", "other"],
  ] as const)("%s -> %s", (message, denial) => {
    expect(micDenial(na(message))).toBe(denial);
    expect(toMicError(na(message)).denial).toBe(denial);
  });

  it("is none for every other error", () => {
    expect(micDenial(new DOMException("busy", "NotReadableError"))).toBe("none");
    expect(micDenial("boom")).toBe("none");
  });
});
