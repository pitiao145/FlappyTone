/**
 * The recording booth.
 *
 * One word at a time, big. The mic runs continuously; silence ends a take and
 * advances. Jane never has to press anything to record, and never has to make a
 * keep-or-retake decision — the only controls are for when something went
 * wrong. Everything about this screen is downstream of "she is doing this alone
 * and her time is the scarce resource".
 *
 * The word list comes from the database (`fetchBoothWords`), not the bundled
 * `wordlist.ts` — server status is the truth for what's pending vs. recorded,
 * not anything remembered locally. `fetchBoothWords` throws on failure; this
 * screen is the one that catches it and shows an error with a Retry button,
 * because the booth is Jane's one working tool, not a player surface that
 * should degrade silently.
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
import { fetchBoothWords, type BoothWord } from "./boothWords.ts";
import { loadProgress } from "./progress.ts";

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

type LoadState = "loading" | "error" | "ready";

export function Recorder({ passcode }: Props) {
  const [progress] = useState(() => loadProgress());

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<BoothWord[]>([]);
  const [recorded, setRecorded] = useState<BoothWord[]>([]);
  /**
   * The order pending words are worked through, fixed at load (or refresh).
   * Advance walks this list rather than the mutating `pending` array, so a
   * word moving to `recorded` mid-session doesn't reshuffle what "next" means.
   */
  const orderRef = useRef<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showRecorded, setShowRecorded] = useState(false);

  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [level, setLevel] = useState(0);
  const [uploads, setUploads] = useState<UploadState>({ byId: {}, pending: 0, failed: 0 });

  const detectorRef = useRef(new TakeDetector());
  const bufferRef = useRef<TakeBuffer | null>(null);
  const levelRef = useRef(0);
  // The current word, readable from the frame sink without re-installing it.
  const currentIdRef = useRef(currentId);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const words = await fetchBoothWords(passcode);
      setPending(words.pending);
      setRecorded(words.recorded);
      orderRef.current = words.pending.map((w) => w.id);
      setCurrentId(words.pending[0]?.id ?? null);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
      setLoadState("error");
    }
  }, [passcode]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * A confirmed upload moves its word from `pending` to `recorded` locally —
   * no refetch. A redo (the word was already in `recorded`) leaves it there;
   * this only ever removes from `pending`.
   */
  const markConfirmed = useCallback((id: string) => {
    setPending((prev) => {
      const word = prev.find((w) => w.id === id);
      if (!word) return prev;
      setRecorded((r) => (r.some((w) => w.id === id) ? r : [...r, { ...word, status: "recorded" }]));
      return prev.filter((w) => w.id !== id);
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

  /** Captured this session but not yet acknowledged — drives the tick, not the pending/recorded split. */
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const markCaptured = useCallback((id: string) => {
    setCaptured((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const current: BoothWord | undefined =
    pending.find((w) => w.id === currentId) ?? recorded.find((w) => w.id === currentId);
  const allDone = loadState === "ready" && pending.length === 0;
  const total = pending.length + recorded.length;

  /** Picks the next word to work on: the first `order` entry still in `pending`, after `afterId`. */
  const nextPendingId = useCallback(
    (afterId: string | null): string | null => {
      const order = orderRef.current;
      const startAt = afterId ? order.indexOf(afterId) + 1 : 0;
      for (let i = Math.max(startAt, 0); i < order.length; i++) {
        const id = order[i];
        if (pending.some((w) => w.id === id) && !captured.has(id)) return id;
      }
      // Nothing left in original order (e.g. everything past this point is
      // already captured/confirmed) — fall back to the first still-pending word.
      const fallback = pending.find((w) => !captured.has(w.id));
      return fallback?.id ?? null;
    },
    [pending, captured],
  );

  // Live meters, at 10Hz. Never per frame.
  useEffect(() => {
    const timer = setInterval(() => setLevel(levelRef.current), 1000 / FRAME_MS_HZ);
    return () => clearInterval(timer);
  }, []);

  // One frame sink for the life of the screen. It reads the current word
  // through a ref rather than being torn down and rebuilt on every advance,
  // which would drop the pre-roll buffer exactly when she starts speaking.
  useEffect(() => {
    if (loadState !== "ready") return;
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

      // Advance after a beat, then listen again for the next word.
      setTimeout(() => {
        setCurrentId((cur) => nextPendingId(cur));
        setFeedback({ kind: "idle" });
        detector.arm();
      }, ADVANCE_DELAY_MS);
    });

    return () => {
      setFrameSink(null);
      detector.disarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nextPendingId reads fresh state via closures over pending/captured each render; re-installing the sink on every keystroke of those would drop the pre-roll buffer.
  }, [markCaptured, uploader, loadState]);

  useEffect(() => () => stopMic(), []);

  const goTo = (id: string) => {
    detectorRef.current.arm();
    setFeedback({ kind: "idle" });
    setCurrentId(id);
  };

  if (loadState === "loading") {
    return (
      <div className="rec rec-gate">
        <p className="rec-sub">Loading the word list…</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="rec rec-gate">
        <p className="rec-warn">{loadError}</p>
        <button className="rec-btn rec-btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (allDone) {
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
              {uploads.failed} didn't reach the server. Nothing is lost while this page stays
              open.
            </p>
            <button className="rec-btn" onClick={() => uploader.retryFailed()}>
              Try those again
            </button>
          </>
        )}
        {recorded.length > 0 && (
          <button className="rec-btn" onClick={() => goTo(recorded[0].id)}>
            Redo a word
          </button>
        )}
        <button className="rec-btn" onClick={() => void load()}>
          Refresh list
        </button>
      </div>
    );
  }

  if (!current) {
    // Shouldn't happen — pending is non-empty but currentId didn't resolve.
    // Fail visibly rather than render a blank screen.
    return (
      <div className="rec rec-gate">
        <p className="rec-warn">Lost track of the current word.</p>
        <button className="rec-btn rec-btn-primary" onClick={() => void load()}>
          Retry
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
        <div className="rec-hanzi">{current.hanzi}</div>
        <div className="rec-pinyin">
          {current.pinyin} <span className="rec-tone">({current.tone})</span>
        </div>
      </div>

      <div className={`rec-feedback rec-feedback-${feedback.kind}`}>
        {feedback.kind === "idle" && "Say it when you're ready"}
        {feedback.kind === "hearing" && "listening…"}
        {feedback.kind === "got-it" && "got it ✓"}
        {feedback.kind === "rejected" && REJECT_COPY[feedback.reason]}
      </div>

      <div className="rec-strip">
        {pending.map((w) => (
          <button
            key={w.id}
            className={
              "rec-chip" +
              (w.id === current.id ? " rec-chip-current" : "") +
              (captured.has(w.id) ? " rec-chip-done" : "")
            }
            onClick={() => goTo(w.id)}
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
                  className={"rec-chip rec-chip-done" + (w.id === current.id ? " rec-chip-current" : "")}
                  onClick={() => goTo(w.id)}
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
        <button className="rec-btn" onClick={() => void load()}>
          Refresh list
        </button>
        <span className="rec-count">
          {recorded.length} / {total}
          {uploads.pending > 0 && ` · ${uploads.pending} uploading`}
          {uploads.failed > 0 && ` · ${uploads.failed} failed`}
        </span>
      </div>
    </div>
  );
}
