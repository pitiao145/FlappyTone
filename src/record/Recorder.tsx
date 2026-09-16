/**
 * The recording screen.
 *
 * One word at a time, big. While the microphone is armed it runs continuously:
 * silence ends a take and advances, so working down the pending list costs
 * Jane no taps at all. That is the booth's reason to exist and nothing here
 * may cost it.
 *
 * What is new is that armed is a state she can see and control, not an
 * invisible consequence of which screen she is on. `boothArming.ts` holds the
 * three rules and the incident behind them; in short, the bulk pass arms
 * itself and every other way of reaching a word does not.
 *
 * The word list, the `Uploader` and the session id belong to `Overview.tsx` —
 * this screen is handed them, so leaving it (Back to list) cannot drop an
 * upload that is still in flight.
 *
 * Per CLAUDE.md rule 1, the meters do not re-render per frame: the detector
 * and tracker run in a frame sink outside React, and React sees a 10Hz
 * readout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { setFrameSink, stopMic } from "../audio/session.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { encodeWav } from "../dev/wav.ts";
import { TakeBuffer } from "./takeBuffer.ts";
import { TakeDetector, type RejectReason } from "./takeDetector.ts";
import { ConfirmRedo } from "./ConfirmRedo.tsx";
import type { Uploader, UploadState } from "./upload.ts";
import type { BoothWord, BoothWordStatus } from "./boothWords.ts";
import { nextPendingId } from "./boothQueue.ts";
import { afterTake, initialArmed, needsRedoConfirm, type BoothEntry } from "./boothArming.ts";

const FRAME_MS_HZ = 10;
/** How long "got it" stays up before the next word. Long enough to register. */
const ADVANCE_DELAY_MS = 700;

type Feedback =
  | { kind: "idle" }
  | { kind: "paused" }
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
  pending: BoothWord[];
  recorded: BoothWord[];
  captured: Set<string>;
  markCaptured: (id: string) => void;
  uploader: Uploader;
  uploads: UploadState;
  /** The word to open on; `null` means "the first still-pending one". */
  startId: string | null;
  entry: BoothEntry;
  onExit: () => void;
}

export function Recorder({
  pending,
  recorded,
  captured,
  markCaptured,
  uploader,
  uploads,
  startId,
  entry,
  onExit,
}: Props) {
  /**
   * The order pending words are worked through, fixed when this screen opens.
   * Advance walks this list rather than the mutating `pending` array, so a
   * word moving to `recorded` mid-session doesn't reshuffle what "next" means.
   */
  const [order] = useState<string[]>(() => pending.map((w) => w.id));
  const [currentId, setCurrentId] = useState<string | null>(
    () => startId ?? pending[0]?.id ?? null,
  );
  const [armed, setArmedState] = useState(() => initialArmed(entry));
  const [feedback, setFeedback] = useState<Feedback>(() =>
    initialArmed(entry) ? { kind: "idle" } : { kind: "paused" },
  );
  const [level, setLevel] = useState(0);
  const [showRecorded, setShowRecorded] = useState(false);
  const [confirming, setConfirming] = useState<BoothWord | null>(null);

  const detectorRef = useRef(new TakeDetector());
  const bufferRef = useRef<TakeBuffer | null>(null);
  const levelRef = useRef(0);
  // The current word, readable from the frame sink without re-installing it.
  const currentIdRef = useRef(currentId);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  /**
   * Armed, readable from the frame sink. The sink is installed once and must
   * not be torn down on a pause — rebuilding it drops the pre-roll buffer, so
   * resuming would clip the start of the next word.
   */
  const armedRef = useRef(armed);
  const setArmed = useCallback((on: boolean) => {
    armedRef.current = on;
    setArmedState(on);
    const detector = detectorRef.current;
    if (on) detector.arm();
    else detector.disarm();
    setFeedback(on ? { kind: "idle" } : { kind: "paused" });
  }, []);

  /**
   * Status by id, for the sink's after-take decision. Kept in a ref, updated
   * after every render, for the same reason `advanceRef` is: the sink is
   * installed once and must read live state without being torn down.
   */
  const statusRef = useRef<Map<string, BoothWordStatus>>(new Map());
  useEffect(() => {
    statusRef.current = new Map([...pending, ...recorded].map((w) => [w.id, w.status] as const));
  });

  const current: BoothWord | undefined =
    pending.find((w) => w.id === currentId) ?? recorded.find((w) => w.id === currentId);
  const allDone = pending.length === 0;
  const total = pending.length + recorded.length;

  /**
   * `nextPendingId` needs *current* `pending`/`captured`, not whatever they
   * were the one time the sink effect ran — closing over them directly froze
   * both at their initial values, so every advance fell to the fallback path
   * over an empty `captured` set and walked back toward the top of the list. A
   * ref updated every render keeps the call live without pulling
   * `pending`/`captured` into the sink effect's deps.
   */
  const advanceRef = useRef<(afterId: string | null) => string | null>(() => null);
  useEffect(() => {
    advanceRef.current = (afterId) => nextPendingId(order, pending, captured, afterId);
  });

  // Live meters, at 10Hz. Never per frame.
  useEffect(() => {
    const timer = setInterval(() => setLevel(levelRef.current), 1000 / FRAME_MS_HZ);
    return () => clearInterval(timer);
  }, []);

  // One frame sink for the life of the screen. It reads the current word and
  // the armed flag through refs rather than being torn down and rebuilt on
  // every advance or pause, which would drop the pre-roll buffer exactly when
  // she starts speaking.
  useEffect(() => {
    let tracker: PitchTracker | null = null;
    const detector = detectorRef.current;
    if (armedRef.current) detector.arm();

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

      // Paused: the buffer keeps filling (so Resume doesn't clip her first
      // syllable) but nothing reaches the detector, so nothing can be
      // captured or uploaded.
      if (!armedRef.current) return;

      const id = currentIdRef.current;
      if (!id) return;
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
        id,
        new Blob([wav.slice() as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
      );
      markCaptured(id);
      setFeedback({ kind: "got-it" });

      const after = afterTake(statusRef.current.get(id) ?? "pending");

      setTimeout(() => {
        if (!after.advance) {
          // A take that just replaced a published clip. Stop here rather than
          // running on into the next word with the microphone still live.
          armedRef.current = false;
          setArmedState(false);
          detector.disarm();
          setFeedback({ kind: "paused" });
          return;
        }
        setCurrentId((cur) => advanceRef.current(cur));
        setFeedback({ kind: "idle" });
        detector.arm();
      }, ADVANCE_DELAY_MS);
    });

    return () => {
      setFrameSink(null);
      detector.disarm();
    };
  }, [markCaptured, uploader]);

  // Leaving this screen turns the microphone off for real — the overview is
  // not a place where anything can be recorded.
  useEffect(() => () => stopMic(), []);

  const goTo = useCallback(
    (word: BoothWord) => {
      if (needsRedoConfirm(word.status)) {
        setConfirming(word);
        return;
      }
      setCurrentId(word.id);
      setArmed(false);
    },
    [setArmed],
  );

  if (!allDone && !current) {
    // Shouldn't happen — pending is non-empty but currentId didn't resolve.
    // Fail visibly rather than render a blank screen.
    return (
      <div className="rec rec-gate">
        <p className="rec-warn">Lost track of the current word.</p>
        <button className="rec-btn rec-btn-primary" onClick={onExit}>
          Back to list
        </button>
      </div>
    );
  }

  if (allDone && !current) {
    return (
      <div className="rec">
        <h1 className="rec-done">All done — thank you!</h1>
        <p className="rec-sub">
          {recorded.length} words recorded.
          {uploads.pending > 0 && ` ${uploads.pending} still uploading — keep this open a moment.`}
        </p>
        {uploads.failed > 0 && (
          <>
            <p className="rec-warn">
              {uploads.failed} didn't reach the server. Nothing is lost while this page stays open.
            </p>
            <button className="rec-btn" onClick={() => uploader.retryFailed()}>
              Try those again
            </button>
          </>
        )}
        <button className="rec-btn rec-btn-primary" onClick={onExit}>
          Back to list
        </button>
      </div>
    );
  }

  const word = current as BoothWord;

  return (
    <div className={"rec" + (armed ? "" : " rec-paused")}>
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
        {feedback.kind === "paused" && "Mic paused — nothing is being recorded"}
        {feedback.kind === "hearing" && "listening…"}
        {feedback.kind === "got-it" && "got it ✓"}
        {feedback.kind === "rejected" && REJECT_COPY[feedback.reason]}
      </div>

      <button
        className={"rec-btn " + (armed ? "rec-btn-pause" : "rec-btn-primary")}
        onClick={() => setArmed(!armed)}
      >
        {armed ? "Pause mic" : "Resume — start listening"}
      </button>

      <div className="rec-strip">
        {pending.map((w) => (
          <button
            key={w.id}
            className={
              "rec-chip" +
              (w.id === word.id ? " rec-chip-current" : "") +
              (captured.has(w.id) ? " rec-chip-done" : "")
            }
            onClick={() => goTo(w)}
            title={`re-record ${w.pinyin}`}
          >
            {captured.has(w.id) ? "✓ " : ""}
            {w.pinyin}
          </button>
        ))}
      </div>

      {recorded.length > 0 && (
        <div className="rec-recorded">
          <button
            className="rec-recorded-toggle"
            onClick={() => setShowRecorded((s) => !s)}
            aria-expanded={showRecorded}
          >
            {showRecorded ? "▾" : "▸"} Recorded ({recorded.length}) — tap to redo
          </button>
          {showRecorded && (
            <div className="rec-strip">
              {recorded.map((w) => (
                <button
                  key={w.id}
                  className={
                    "rec-chip rec-chip-done" + (w.id === word.id ? " rec-chip-current" : "")
                  }
                  onClick={() => goTo(w)}
                  title={`re-record ${w.pinyin}`}
                >
                  ✓ {w.pinyin}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rec-footer">
        <button className="rec-btn" onClick={onExit}>
          Back to list
        </button>
        {uploads.failed > 0 && (
          <button className="rec-btn" onClick={() => uploader.retryFailed()}>
            Try {uploads.failed} again
          </button>
        )}
        <span className="rec-count">
          {recorded.length} / {total}
          {uploads.pending > 0 && ` · ${uploads.pending} uploading`}
          {uploads.failed > 0 && ` · ${uploads.failed} failed`}
        </span>
      </div>

      {confirming && (
        <ConfirmRedo
          word={confirming}
          onConfirm={() => {
            const w = confirming;
            setConfirming(null);
            setCurrentId(w.id);
            setArmed(false);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
