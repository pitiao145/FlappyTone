/**
 * The recording booth.
 *
 * One word at a time, big. The mic runs continuously; silence ends a take and
 * advances. Jane never has to press anything to record, and never has to make a
 * keep-or-retake decision — the only controls are for when something went
 * wrong. Everything about this screen is downstream of "she is doing this alone
 * and her time is the scarce resource".
 *
 * Per CLAUDE.md rule 1, the meters do not re-render per frame: the detector and
 * tracker run in a frame sink outside React, and React sees a 10Hz readout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { setFrameSink, stopMic } from "../audio/session.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { encodeWav } from "../dev/wav.ts";
import { TakeBuffer } from "./takeBuffer.ts";
import { TakeDetector, type RejectReason } from "./takeDetector.ts";
import { Uploader, type UploadState } from "./upload.ts";
import { WORDS, type WordItem } from "./wordlist.ts";
import { loadProgress, saveProgress } from "./progress.ts";

const FRAME_MS_HZ = 10;
/** How long "got it" stays up before the next word. Long enough to register. */
const ADVANCE_DELAY_MS = 700;

type Feedback =
  | { kind: "idle" }
  | { kind: "hearing" }
  | { kind: "got-it" }
  | { kind: "rejected"; reason: RejectReason };

const REJECT_COPY: Record<RejectReason, string> = {
  // Never "you said it wrong" — the booth has no opinion on her Mandarin, only
  // on whether it captured a usable signal.
  short: "Didn't quite catch that — a little longer?",
  clipped: "That came out loud — try holding the phone further away.",
};

interface Props {
  passcode: string;
}

export function Recorder({ passcode }: Props) {
  const [progress, setProgress] = useState(() => loadProgress());
  const [index, setIndex] = useState(() => {
    const p = loadProgress();
    const next = WORDS.findIndex((w) => !p.done.includes(w.id));
    return next === -1 ? WORDS.length : next;
  });
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [level, setLevel] = useState(0);
  const [uploads, setUploads] = useState<UploadState>({ byId: {}, pending: 0, failed: 0 });

  const detectorRef = useRef(new TakeDetector());
  const bufferRef = useRef<TakeBuffer | null>(null);
  const levelRef = useRef(0);
  // The current word, readable from the frame sink without re-installing it.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  /**
   * Persisted progress follows the *server*, not the microphone.
   *
   * Resume reads this, so a word is only recorded here once the upload has been
   * acknowledged. Marking it on capture meant a permanently failed upload was
   * still remembered as done, and coming back to the page would skip a word
   * that never reached storage — the one failure mode resume exists to prevent.
   */
  const markConfirmed = useCallback((id: string) => {
    setProgress((prev) => {
      if (prev.done.includes(id)) return prev;
      const next = { ...prev, done: [...prev.done, id] };
      saveProgress(next);
      return next;
    });
  }, []);

  // Lazy initialiser, not a ref assigned during render: the queue must outlive
  // re-renders but must also not be rebuilt by one, which would drop pending
  // uploads on the floor.
  const [uploader] = useState(
    () =>
      new Uploader({
        sessionId: progress.sessionId,
        passcode,
        onChange: setUploads,
        onConfirmed: markConfirmed,
      }),
  );

  /** Captured this session but not yet acknowledged — drives the tick, not resume. */
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const markCaptured = useCallback((id: string) => {
    setCaptured((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Ticked = captured this session or confirmed on the server. She should not
  // watch a word untick itself while the upload is in flight.
  const done = new Set([...progress.done, ...captured]);
  const word: WordItem | undefined = WORDS[index];
  const finished = index >= WORDS.length;

  // Live meters, at 10Hz. Never per frame.
  useEffect(() => {
    const timer = setInterval(() => setLevel(levelRef.current), 1000 / FRAME_MS_HZ);
    return () => clearInterval(timer);
  }, []);

  // One frame sink for the life of the screen. It reads the current word
  // through a ref rather than being torn down and rebuilt on every advance,
  // which would drop the pre-roll buffer exactly when she starts speaking.
  useEffect(() => {
    let tracker: PitchTracker | null = null;
    const detector = detectorRef.current;

    setFrameSink((frame, sampleRate) => {
      tracker ??= new PitchTracker({ sampleRate });
      bufferRef.current ??= new TakeBuffer(sampleRate);
      const buffer = bufferRef.current;

      const state = tracker.push(frame);
      buffer.push(frame);

      let peak = 0;
      for (let i = 0; i < frame.length; i++) {
        const a = Math.abs(frame[i]);
        if (a > peak) peak = a;
      }
      levelRef.current = peak;

      const current = WORDS[indexRef.current];
      if (!current) return;
      if (!detector.isArmed) detector.arm();

      const event = detector.push(buffer.elapsedMs, state.voiced, peak);
      if (!event) return;

      if (event.type === "onset") {
        setFeedback({ kind: "hearing" });
        return;
      }
      if (event.type === "rejected") {
        setFeedback({ kind: "rejected", reason: event.reason });
        detector.arm(); // stay on this word, listening
        return;
      }

      const samples = buffer.slice(event.startMs, event.endMs);
      const wav = encodeWav(samples, buffer.sampleRate);
      uploader.enqueue(
        current.id,
        new Blob([wav.slice() as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
      );
      markCaptured(current.id);
      setFeedback({ kind: "got-it" });

      // Advance after a beat, then listen again for the next word.
      setTimeout(() => {
        setIndex((i) => {
          const from = Math.max(i, indexRef.current);
          let next = from + 1;
          // Skip anything already recorded — she may have jumped back to redo
          // one word and should land past it, not walk the whole list again.
          while (next < WORDS.length && uploader.getState().byId[WORDS[next].id] === "done") {
            next++;
          }
          return next;
        });
        setFeedback({ kind: "idle" });
        detector.arm();
      }, ADVANCE_DELAY_MS);
    });

    return () => {
      setFrameSink(null);
      detector.disarm();
    };
  }, [markCaptured, uploader]);

  useEffect(() => () => stopMic(), []);

  const goTo = (i: number) => {
    detectorRef.current.arm();
    setFeedback({ kind: "idle" });
    setIndex(i);
  };

  if (finished) {
    return (
      <div className="rec">
        <h1 className="rec-done">All done — thank you!</h1>
        <p className="rec-sub">
          {WORDS.length} words recorded.
          {uploads.pending > 0 && ` ${uploads.pending} still uploading — keep this open a moment.`}
        </p>
        {uploads.failed > 0 && (
          <>
            <p className="rec-warn">
              {uploads.failed} didn't reach the server. Nothing is lost while this page stays
              open.
            </p>
            <button className="rec-btn" onClick={() => uploader.retryFailed()}>
              Try those again
            </button>
          </>
        )}
        <button className="rec-btn" onClick={() => goTo(0)}>
          Back to the list
        </button>
      </div>
    );
  }

  return (
    <div className="rec">
      <div className="rec-level" aria-hidden>
        <div className="rec-level-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
      </div>

      <div className="rec-word">
        <div className="rec-hanzi">{word.hanzi}</div>
        <div className="rec-pinyin">
          {word.pinyin} <span className="rec-tone">({word.tone})</span>
        </div>
      </div>

      <div className={`rec-feedback rec-feedback-${feedback.kind}`}>
        {feedback.kind === "idle" && "Say it when you're ready"}
        {feedback.kind === "hearing" && "listening…"}
        {feedback.kind === "got-it" && "got it ✓"}
        {feedback.kind === "rejected" && REJECT_COPY[feedback.reason]}
      </div>

      <div className="rec-strip">
        {WORDS.map((w, i) => (
          <button
            key={w.id}
            className={
              "rec-chip" +
              (i === index ? " rec-chip-current" : "") +
              (done.has(w.id) ? " rec-chip-done" : "")
            }
            onClick={() => goTo(i)}
            title={`re-record ${w.pinyin}`}
          >
            {done.has(w.id) ? "✓ " : ""}
            {w.pinyin}
          </button>
        ))}
      </div>

      <div className="rec-footer">
        <button className="rec-btn" onClick={() => goTo(Math.max(0, index - 1))}>
          Redo last
        </button>
        <span className="rec-count">
          {done.size} / {WORDS.length}
          {uploads.pending > 0 && ` · ${uploads.pending} uploading`}
          {uploads.failed > 0 && ` · ${uploads.failed} failed`}
        </span>
      </div>
    </div>
  );
}
