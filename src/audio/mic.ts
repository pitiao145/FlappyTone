import { isChromeIOS } from "./platform.ts";

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
   *
   * The context and its capture worklet node outlive any individual mic
   * MediaStream: `releaseStream`/`acquireStream` add and remove only the
   * `getUserMedia` stream and its source node against this persistent context.
   * That split is what lets a reference cue play on the loud speaker — see
   * `docs/flappytone-SPEC-ios-audio-routing.md`. On iOS the audio route is
   * process-wide and forced to the earpiece (`play-and-record`) whenever *any*
   * live mic track exists; releasing the stream reverts it to the speaker
   * without tearing down the context.
   */
  ctx: AudioContext;
  /** True while a live mic MediaStream is connected to the worklet. */
  hasStream: () => boolean;
  /**
   * Stops the mic MediaStream (its tracks) and disconnects its source node,
   * keeping the context and worklet alive. On iOS this reverts the output
   * route to the built-in speaker. Idempotent; safe to call when already
   * released.
   */
  releaseStream: () => void;
  /**
   * Re-acquires the mic MediaStream and connects it to the persistent worklet.
   * Idempotent — resolves immediately if a stream is already live. Throws
   * `MicError` on failure, same mapping as the initial open. The re-acquire
   * during a run happens outside a user gesture; iOS allows it because the
   * permission was already granted for this document.
   */
  acquireStream: () => Promise<void>;
  /** Fully tears down: releases the stream, then closes the context. */
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
  /**
   * Fired when the capture is lost mid-session — the mic track ends or mutes
   * (an OS interruption: a call, Siri, another app grabbing the mic), or the
   * AudioContext goes `interrupted` (iOS). The stream is not automatically
   * re-acquired here; the coordinator in session.ts decides how to recover.
   * iOS frequently never fires the matching `unmute`, so recovery must be
   * proactive, not a wait — see docs/flappytone-SPEC-ios-audio-routing.md.
   */
  onLost?: () => void,
): Promise<MicSession> {
  if (typeof AudioWorkletNode === "undefined") {
    throw new MicError(
      "no-audioworklet",
      "This browser doesn't support AudioWorklet.",
    );
  }

  // The context and worklet are created once and persist for the whole
  // session; only the MediaStream + its source node come and go (see
  // MicSession's doc comment). Creating the context here — before the first
  // getUserMedia — is still inside the caller's user gesture, which is what
  // iOS requires for resume().
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

  const node = new AudioWorkletNode(ctx, "capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onFrame(e.data, ctx.sampleRate);
  };

  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  // The acquire in flight, if any — so overlapping acquire triggers (a cue
  // re-acquire and a visibility-driven recovery landing together) share one
  // getUserMedia instead of opening two live streams (the iOS muted-track /
  // NotReadableError landmine).
  let acquiring: Promise<void> | null = null;
  // Bumped by every release. An acquire that was in flight when a release
  // happened is stale: it must discard the stream it just got rather than
  // connect it, or a release-then-acquire race (e.g. a run torn down mid-cue
  // while its getUserMedia is still resolving) leaves a live mic behind.
  let streamEpoch = 0;

  // Coalesce loss signals: a track ending often also flips the context, and we
  // want one recovery attempt, not three. Reset on each fresh acquire.
  let lostFired = false;
  const fireLost = (): void => {
    if (lostFired) return;
    lostFired = true;
    onLost?.();
  };

  // iOS can flip the context to `interrupted` transiently while the mic track
  // stays live. Just try to resume it — never tear the stream down, which would
  // cut capture mid-utterance. A *real* loss (a call, Siri, the device
  // reclaimed) comes through the track's own `ended`/`mute` listeners below.
  // Not wired on the Chrome/Firefox-iOS legacy path (production had no such
  // handler); there the browser handles its own single context.
  if (!isChromeIOS()) {
    ctx.onstatechange = () => {
      if (ctx.state === "interrupted") void ctx.resume();
    };
  }

  const releaseStream = (): void => {
    streamEpoch += 1;
    source?.disconnect();
    source = null;
    // Detach the loss listeners and suppress `fireLost` before stopping, so a
    // deliberate release (a cue, or recovery teardown) does not read its own
    // `ended` as an OS interruption. Re-armed by the next acquireStream.
    lostFired = true;
    if (stream) {
      for (const t of stream.getAudioTracks()) {
        t.removeEventListener("ended", fireLost);
        t.removeEventListener("mute", fireLost);
        t.stop();
      }
    }
    stream = null;
  };

  const acquireStream = (): Promise<void> => {
    // Idempotent: a live source means the stream is already connected.
    if (source) return Promise.resolve();
    // Share an acquire already in flight rather than starting a second
    // getUserMedia — never hold two live streams at once (see the spec).
    if (acquiring) return acquiring;

    const epoch = streamEpoch;
    const p = (async () => {
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err) {
        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError" || err.name === "SecurityError") {
            throw new MicError(
              "permission-denied",
              "Microphone access was denied.",
            );
          }
          if (
            err.name === "NotFoundError" ||
            err.name === "OverconstrainedError"
          ) {
            throw new MicError("no-microphone", "No microphone was found.");
          }
        }
        throw new MicError("unknown", String(err));
      }
      // A release happened (or another acquire won) while we awaited: this
      // stream is stale — stop it rather than connect a mic nobody expects.
      if (epoch !== streamEpoch || source) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      source = ctx.createMediaStreamSource(stream);
      source.connect(node);
      // A fresh stream can be lost again; re-arm and watch this stream's track.
      // `mute` fires on an OS interruption; `ended` when the device is reclaimed.
      // Skipped on the Chrome/Firefox-iOS legacy path — those run production's
      // no-recovery behaviour, where a transient mute must not tear the mic down
      // mid-utterance (see reference.ts's getPlaybackCtx).
      lostFired = false;
      if (!isChromeIOS()) {
        for (const t of stream.getAudioTracks()) {
          t.addEventListener("ended", fireLost);
          t.addEventListener("mute", fireLost);
        }
      }
    })();

    const wrapped = p.finally(() => {
      if (acquiring === wrapped) acquiring = null;
    });
    acquiring = wrapped;
    return acquiring;
  };

  try {
    // Initial acquire, still inside the gesture. A failure here must not leak
    // the context we just opened.
    await acquireStream();
  } catch (err) {
    node.port.onmessage = null;
    void ctx.close();
    throw err;
  }

  return {
    sampleRate: ctx.sampleRate,
    ctx,
    hasStream: () => source !== null,
    releaseStream,
    acquireStream,
    stop: () => {
      node.port.onmessage = null;
      ctx.onstatechange = null;
      releaseStream();
      void ctx.close();
    },
  };
}
