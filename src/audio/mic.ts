export type MicErrorKind =
  | "permission-denied"
  | "no-microphone"
  | "no-audioworklet"
  | "unknown";

export class MicError extends Error {
  kind: MicErrorKind;

  constructor(kind: MicErrorKind, message: string) {
    super(message);
    this.name = "MicError";
    this.kind = kind;
  }
}

export interface MicSession {
  sampleRate: number;
  /**
   * The capture AudioContext. Exposed so the host can suspend it when the tab
   * is backgrounded (PRD §10) and so reference cues can be played through the
   * same, already-gesture-resumed context.
   */
  ctx: AudioContext;
  stop: () => void;
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;

// AudioWorkletProcessor that accumulates render quanta and posts
// FRAME_SIZE-sample frames every HOP_SIZE samples. Registered via a Blob URL
// so the whole audio layer ships as one module.
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${FRAME_SIZE});
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    let i = 0;
    while (i < input.length) {
      const n = Math.min(input.length - i, ${FRAME_SIZE} - this.filled);
      this.buffer.set(input.subarray(i, i + n), this.filled);
      this.filled += n;
      i += n;
      if (this.filled === ${FRAME_SIZE}) {
        this.port.postMessage(this.buffer.slice(0));
        this.buffer.copyWithin(0, ${HOP_SIZE});
        this.filled = ${FRAME_SIZE} - ${HOP_SIZE};
      }
    }
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
`;

/**
 * Must be called from a user gesture handler (iOS Safari requires a gesture
 * for both getUserMedia and AudioContext.resume).
 */
export async function startMic(
  onFrame: (frame: Float32Array, sampleRate: number) => void,
): Promise<MicSession> {
  if (typeof AudioWorkletNode === "undefined") {
    throw new MicError(
      "no-audioworklet",
      "This browser doesn't support AudioWorklet.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        throw new MicError("permission-denied", "Microphone access was denied.");
      }
      if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        throw new MicError("no-microphone", "No microphone was found.");
      }
    }
    throw new MicError("unknown", String(err));
  }

  const ctx = new AudioContext();
  await ctx.resume();

  const workletUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
  );
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onFrame(e.data, ctx.sampleRate);
  };
  source.connect(node);

  return {
    sampleRate: ctx.sampleRate,
    ctx,
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
