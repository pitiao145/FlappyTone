/**
 * The booth's home screen, and the owner of everything that must outlive a
 * trip into the recording screen.
 *
 * Two things sit here rather than in `Recorder.tsx`, both deliberate:
 *
 * 1. **The word list is fetched before the microphone is ever touched.** The
 *    old flow went passcode → "Tap to start" → live microphone, so the first
 *    thing Jane saw after the door was a screen that was already recording.
 *    She now sees what is left and what is done, and arms the microphone
 *    herself.
 * 2. **The `Uploader` lives here.** Leaving the recording screen must not drop
 *    a take that is still in flight — an `Uploader` owned by `Recorder.tsx`
 *    would be rebuilt (and its queue lost) every time she came back to the
 *    list.
 *
 * `ensureMic()` is called synchronously inside the click handlers, never from
 * an effect: iOS Safari grants `getUserMedia` only within a user gesture
 * (CLAUDE.md hard rule 4). Awaiting anything before it loses the gesture.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureMic } from "../audio/session.ts";
import { MicError } from "../audio/mic.ts";
import { Recorder } from "./Recorder.tsx";
import { ConfirmRedo } from "./ConfirmRedo.tsx";
import { fetchBoothWords, type BoothSpeaker, type BoothWord } from "./boothWords.ts";
import { loadProgress, saveProgress } from "./progress.ts";
import { needsRedoConfirm, type BoothEntry } from "./boothArming.ts";
import { Uploader, type UploadState } from "./upload.ts";

/**
 * Which lists a recorder should work through right now — a workflow choice
 * that changes far more often than the catalog itself, so it lives here as a
 * client-side picker rather than a server-side allowlist (see
 * `boothWords.ts`'s Worker-side doc comment for the full reasoning). `hsk*`
 * lists are shown but disabled: visible so nobody wonders where 1000+ words
 * went, disabled because Jane/Ted aren't recording Mandarin-accented Mainland
 * vocabulary right now — not a schema decision, just this week's ask.
 */
const DISABLED_LIST_PREFIX = "hsk";
const LIST_LABELS: Record<string, string> = {
  "core-120": "Core 120",
  "tonepairs-v1": "Tone pairs",
  tocfl1: "TOCFL 1",
  tocfl2: "TOCFL 2",
  tocfl3: "TOCFL 3",
  hsk1: "HSK 1",
  hsk2: "HSK 2",
  hsk3: "HSK 3",
};
const LIST_ORDER = ["core-120", "tonepairs-v1", "tocfl1", "tocfl2", "tocfl3", "hsk1", "hsk2", "hsk3"];

function listLabel(id: string): string {
  return LIST_LABELS[id] ?? id;
}

function sortListIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => {
    const ia = LIST_ORDER.indexOf(a);
    const ib = LIST_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

const MIC_COPY: Record<string, string> = {
  "permission-denied":
    "The browser blocked the microphone. Allow it for this site in the address bar, then tap again.",
  "no-microphone": "No microphone found. If you have headphones plugged in, try unplugging them.",
  "no-audioworklet": "This browser is too old to record here — try Safari or Chrome.",
  unknown: "The microphone didn't start. Reload the page and try once more.",
};

type LoadState = "loading" | "error" | "ready";

type Mode =
  | { kind: "overview" }
  | { kind: "recording"; startId: string | null; entry: BoothEntry };

interface Props {
  passcode: string;
}

export function Overview({ passcode }: Props) {
  const [progress] = useState(() => loadProgress());
  // Persist once, on mount: without it a mid-session reload mints a fresh
  // session id (and a fresh R2 folder) instead of resuming the one she is
  // already recording into.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  // pending/recorded live together so a confirmed upload moves a word between
  // them in one update, rather than one setter calling another from inside
  // its updater.
  const [words, setWords] = useState<{ pending: BoothWord[]; recorded: BoothWord[] }>({
    pending: [],
    recorded: [],
  });
  const [mode, setMode] = useState<Mode>({ kind: "overview" });
  const [showRecorded, setShowRecorded] = useState(false);
  // `null` = every list. Reset on every fresh load (see `load` below) so a
  // stale filter from a previous passcode/session can't hide words silently.
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BoothWord | null>(null);
  const [uploads, setUploads] = useState<UploadState>({ byId: {}, pending: 0, failed: 0 });

  /** Captured this session but not yet acknowledged by the server. */
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const markCaptured = useCallback((id: string) => {
    setCaptured((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  /**
   * A confirmed upload moves its word from `pending` to `recorded` locally —
   * no refetch. A redo (the word was already in `recorded`) leaves it there;
   * this only ever removes from `pending`.
   */
  const markConfirmed = useCallback((id: string) => {
    setWords((prev) => {
      const word = prev.pending.find((w) => w.id === id);
      if (!word) return prev;
      return {
        pending: prev.pending.filter((w) => w.id !== id),
        recorded: prev.recorded.some((w) => w.id === id)
          ? prev.recorded
          : [...prev.recorded, { ...word, status: "recorded" }],
      };
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

  // Server-resolved from the passcode, never chosen here. Rendered above the
  // word list, before anything is armed, so someone handed the wrong code sees
  // it on the first screen rather than after a session's work.
  const [speaker, setSpeaker] = useState<BoothSpeaker | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const fetched = await fetchBoothWords(passcode);
      setSpeaker(fetched.speaker);
      setWords({ pending: fetched.pending, recorded: fetched.recorded });
      setSelectedList(null);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
      setLoadState("error");
    }
  }, [passcode]);

  useEffect(() => {
    void load();
  }, [load]);

  const { pending, recorded } = words;
  const total = pending.length + recorded.length;

  const listIds = useMemo(() => {
    const ids = new Set<string>();
    // `w.lists` defensively defaulted: the deployed Worker only started
    // sending it once `/booth/words` shipped this field, and a stale
    // deploy (or an older client mid-rollout) must degrade to "no picker",
    // never crash the whole screen.
    for (const w of [...pending, ...recorded]) for (const l of w.lists ?? []) ids.add(l);
    return sortListIds(ids);
  }, [pending, recorded]);

  const visiblePending = useMemo(
    () => (selectedList ? pending.filter((w) => w.lists?.includes(selectedList)) : pending),
    [pending, selectedList],
  );
  const visibleRecorded = useMemo(
    () => (selectedList ? recorded.filter((w) => w.lists?.includes(selectedList)) : recorded),
    [recorded, selectedList],
  );

  /** Synchronous entry into ensureMic — see the file comment. */
  const enterRecording = (startId: string | null, entry: BoothEntry) => {
    setMicError(null);
    ensureMic().then(
      () => setMode({ kind: "recording", startId, entry }),
      (err: unknown) => {
        const kind = err instanceof MicError ? err.kind : "unknown";
        setMicError(MIC_COPY[kind] ?? MIC_COPY.unknown);
      },
    );
  };

  const recordOne = (word: BoothWord) => {
    if (needsRedoConfirm(word.status)) {
      setConfirming(word);
      return;
    }
    enterRecording(word.id, "redo");
  };

  const exitToList = useCallback(() => {
    setMode({ kind: "overview" });
    void load();
  }, [load]);

  if (mode.kind === "recording") {
    return (
      <Recorder
        pending={visiblePending}
        recorded={visibleRecorded}
        captured={captured}
        markCaptured={markCaptured}
        uploader={uploader}
        uploads={uploads}
        startId={mode.startId}
        entry={mode.entry}
        onExit={exitToList}
      />
    );
  }

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

  return (
    <div className="rec">
      <header className="rec-head">
        <h1 className="rec-title">Recording booth</h1>
        <p className="rec-sub">
          Recording as: {speaker?.name ?? "—"} · {recorded.length} of {total} recorded
        </p>
      </header>

      {listIds.length > 0 && (
        <div className="rec-list-picker">
          <button
            className={`rec-pill${selectedList === null ? " rec-pill-active" : ""}`}
            onClick={() => setSelectedList(null)}
          >
            All
          </button>
          {listIds.map((id) => {
            const disabled = id.startsWith(DISABLED_LIST_PREFIX);
            return (
              <button
                key={id}
                className={`rec-pill${selectedList === id ? " rec-pill-active" : ""}`}
                disabled={disabled}
                title={disabled ? "Not being recorded right now" : undefined}
                onClick={() => setSelectedList(id)}
              >
                {listLabel(id)}
              </button>
            );
          })}
        </div>
      )}

      {visiblePending.length > 0 ? (
        <>
          <p className="rec-sub">
            Somewhere quiet, phone about a hand's width from your mouth. You'll see one word at a
            time — just say it, and it moves on by itself. The microphone only starts when you tap
            below.
          </p>
          <button className="rec-btn rec-btn-primary" onClick={() => enterRecording(null, "bulk")}>
            Start recording ({visiblePending.length} left)
          </button>
        </>
      ) : (
        <p className="rec-sub">
          {selectedList
            ? `Everything in ${listLabel(selectedList)} is recorded — thank you!`
            : "Everything is recorded — thank you!"}{" "}
          You can still re-record any word below.
        </p>
      )}

      {micError && <p className="rec-warn">{micError}</p>}

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

      {visiblePending.length > 0 && (
        <section className="rec-list">
          <h2 className="rec-list-head">To record ({visiblePending.length})</h2>
          {visiblePending.map((w) => (
            <WordRow key={w.id} word={w} captured={captured.has(w.id)} onPick={recordOne} />
          ))}
        </section>
      )}

      {visibleRecorded.length > 0 && (
        <section className="rec-list">
          <button
            className="rec-recorded-toggle"
            onClick={() => setShowRecorded((s) => !s)}
            aria-expanded={showRecorded}
          >
            {showRecorded ? "▾" : "▸"} Recorded ({visibleRecorded.length})
          </button>
          {showRecorded &&
            visibleRecorded.map((w) => (
              <WordRow key={w.id} word={w} captured={captured.has(w.id)} onPick={recordOne} />
            ))}
        </section>
      )}

      <div className="rec-footer">
        <button className="rec-btn" onClick={() => void load()}>
          Refresh list
        </button>
        <span className="rec-count">
          {uploads.pending > 0 && `${uploads.pending} uploading`}
          {uploads.pending > 0 && uploads.failed > 0 && " · "}
          {uploads.failed > 0 && `${uploads.failed} failed`}
        </span>
      </div>

      {confirming && (
        <ConfirmRedo
          word={confirming}
          onConfirm={() => {
            const word = confirming;
            setConfirming(null);
            enterRecording(word.id, "redo");
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function WordRow({
  word,
  captured,
  onPick,
}: {
  word: BoothWord;
  captured: boolean;
  onPick: (w: BoothWord) => void;
}) {
  return (
    <div className="rec-row">
      <span className="rec-row-word">
        <span className="rec-row-hanzi">{word.hanzi}</span> {word.pinyin}{" "}
        <span className="rec-tone">({word.tone})</span>
      </span>
      <span className={`rec-badge rec-badge-${captured ? "recorded" : word.status}`}>
        {captured && word.status === "pending" ? "uploading" : word.status}
      </span>
      <button className="rec-btn rec-row-btn" onClick={() => onPick(word)}>
        Record this one
      </button>
    </div>
  );
}
