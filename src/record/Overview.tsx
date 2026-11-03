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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureMic } from "../audio/session.ts";
import { MicError } from "../audio/mic.ts";
import { Recorder } from "./Recorder.tsx";
import { ConfirmRedo } from "./ConfirmRedo.tsx";
import { fetchBoothWords, statusFor, type BoothSpeaker, type BoothStyle, type BoothWord } from "./boothWords.ts";
import { loadProgress, saveProgress } from "./progress.ts";
import { needsRedoConfirm, type BoothEntry } from "./boothArming.ts";
import { orderPills } from "./pillOrder.ts";
import { Uploader, type UploadState } from "./upload.ts";
import {
  STATUS_COPY,
  STYLE_COPY,
  englishOf,
  filterWords,
  listProgress,
  minutesLeft,
  percentDone,
  timeLeftLabel,
  type ListProgress,
  type WordFilter,
} from "./boothPlan.ts";

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
  "seo-words": "Word pages",
  tocfl1: "TOCFL 1",
  tocfl2: "TOCFL 2",
  tocfl3: "TOCFL 3",
  hsk1: "HSK 1",
  hsk2: "HSK 2",
  hsk3: "HSK 3",
};
const LIST_ORDER = ["core-120", "tonepairs-v1", "seo-words", "tocfl1", "tocfl2", "tocfl3", "hsk1", "hsk2", "hsk3"];

const STYLES: BoothStyle[] = ["textbook", "natural"];

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
  // Every word, both styles' status carried on each — see boothWords.ts.
  // A confirmed upload flips one style's field in place, in one update.
  const [words, setWords] = useState<BoothWord[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "overview" });
  const [filter, setFilter] = useState<WordFilter>("todo");
  // The word whose details panel is open, if any.
  const [details, setDetails] = useState<BoothWord | null>(null);
  // `null` = every list. Reset on every fresh load (see `load` below) so a
  // stale filter from a previous passcode/session can't hide words silently.
  const [selectedList, setSelectedList] = useState<string | null>(null);
  // Which pill's style is active — "textbook" until a pill says otherwise.
  // Persists across selecting "All" (its scope is "all lists, current
  // style"), so choosing "All" after a natural pill still shows natural.
  const [selectedStyle, setSelectedStyle] = useState<BoothStyle>("textbook");
  const [micError, setMicError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ word: BoothWord; style: BoothStyle } | null>(null);
  const [uploads, setUploads] = useState<UploadState>({ byId: {}, pending: 0, failed: 0 });

  /** Captured this session but not yet acknowledged by the server. */
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const markCaptured = useCallback((id: string) => {
    setCaptured((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Which style a captured take belongs to — read by `markConfirmed` at
  // confirmation time via the ref rather than closed-over state, since the
  // active pill can change between entering the recording screen and the
  // upload actually confirming.
  const uploadStyleRef = useRef<BoothStyle>(selectedStyle);
  uploadStyleRef.current = selectedStyle;

  /**
   * A confirmed upload flips one word's ONE style's status to "recorded" in
   * place — no refetch, and the other style's status is untouched.
   */
  const markConfirmed = useCallback((id: string) => {
    const style = uploadStyleRef.current;
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, [style]: "recorded" } : w)));
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
      setWords(fetched.words);
      setSelectedList(null);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
      setLoadState("error");
    }
  }, [passcode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch on mount; state is set by the async load
    void load();
  }, [load]);

  // The active pill's split, derived from every word's per-style status —
  // "pending"/"recorded" below is a status for `selectedStyle`, not the
  // other style's.
  const statusForActive = useCallback((w: BoothWord) => statusFor(w, selectedStyle), [selectedStyle]);
  // "All" means every word being worked right now: a word that lives only in
  // disabled (HSK) lists is excluded, so the totals match the enabled pills.
  const workable = useMemo(
    () => words.filter((w) => !(w.lists?.length && w.lists.every((l) => l.startsWith(DISABLED_LIST_PREFIX)))),
    [words],
  );
  const pending = useMemo(() => workable.filter((w) => statusForActive(w) === "pending"), [workable, statusForActive]);
  const recorded = useMemo(
    () => workable.filter((w) => statusForActive(w) !== "pending"),
    [workable, statusForActive],
  );

  const listIds = useMemo(() => {
    const ids = new Set<string>();
    // `w.lists` defensively defaulted: the deployed Worker only started
    // sending it once `/booth/words` shipped this field, and a stale
    // deploy (or an older client mid-rollout) must degrade to "no picker",
    // never crash the whole screen.
    // Only lists someone records from. Sampler lists (and any future derived
    // list) are subsets of these, and HSK is not being recorded, so neither
    // earns a picker entry.
    for (const w of words)
      for (const l of w.lists ?? []) if (LIST_ORDER.includes(l) && !l.startsWith(DISABLED_LIST_PREFIX)) ids.add(l);
    return ids;
  }, [words]);

  const pills = useMemo(
    () =>
      orderPills(
        listIds,
        LIST_ORDER,
        (listId, style) => words.filter((w) => w.lists?.includes(listId) && statusFor(w, style) === "pending").length,
        (listId) => listId.startsWith(DISABLED_LIST_PREFIX),
      ),
    [listIds, words],
  );

  // Chunks for the active style, pending lists first (pillOrder.ts).
  const chunks = useMemo(
    () =>
      pills
        .filter((p) => p.style === selectedStyle)
        .map((p) => ({ listId: p.listId, progress: listProgress(words, p.listId, selectedStyle) })),
    [pills, words, selectedStyle],
  );

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

  /**
   * Record one word in one style, from the details panel. Lands paused
   * (`entry: "redo"`), and a published take asks first — boothArming.ts.
   * The style is switched here, synchronously, so the upload is tagged with
   * the style the button named (`uploadStyleRef` reads it at confirm time).
   */
  const recordOne = (word: BoothWord, style: BoothStyle) => {
    setDetails(null);
    setSelectedStyle(style);
    if (needsRedoConfirm(statusFor(word, style))) {
      setConfirming({ word, style });
      return;
    }
    enterRecording(word.id, "redo");
  };

  /** A list's CTA: select it, then the bulk pass (the one path that arms on arrival). */
  const recordList = (listId: string | null) => {
    setSelectedList(listId);
    enterRecording(null, "bulk");
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
        style={selectedStyle}
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

  const scope: ListProgress = listProgress(workable, selectedList, selectedStyle);
  const scopeName = selectedList ? (LIST_LABELS[selectedList] ?? selectedList) : "All lists";
  const visibleWords = filterWords([...visiblePending, ...visibleRecorded], filter, selectedStyle);

  return (
    <div className="rec rec-wide">
      <header className="rec-head">
        <h1 className="rec-title">Recording booth</h1>
        <p className="rec-sub">Recording as {speaker?.name ?? "—"}</p>
      </header>

      <section className="rec-summary" aria-label="Progress">
        <p className="rec-summary-scope">
          {scopeName} · {STYLE_COPY[selectedStyle].name}
        </p>
        <p className="rec-summary-count">
          <strong>{scope.done}</strong> of {scope.total} done
        </p>
        <ProgressBar progress={scope} />
        <p className="rec-sub">
          {timeLeftLabel(scope.pending)}. Every take saves by itself. You can stop anytime and
          nothing is lost.
        </p>
      </section>

      <div className="rec-style-toggle" role="radiogroup" aria-label="Speaking style">
        {STYLES.map((st) => {
          const p = listProgress(workable, selectedList, st);
          return (
            <button
              key={st}
              role="radio"
              aria-checked={selectedStyle === st}
              className={"rec-style-btn" + (selectedStyle === st ? " rec-style-btn-active" : "")}
              onClick={() => setSelectedStyle(st)}
            >
              <span className="rec-style-name">{STYLE_COPY[st].name}</span>
              <span className="rec-style-hint">{STYLE_COPY[st].reminder}</span>
              <span className="rec-style-count">
                {p.done} of {p.total} done
              </span>
            </button>
          );
        })}
      </div>

      {micError && <p className="rec-warn">{micError}</p>}

      {uploads.failed > 0 && (
        <div className="rec-alert">
          <p className="rec-warn">
            {uploads.failed} didn't reach the server. Nothing is lost while this page stays open.
          </p>
          <button className="rec-btn" onClick={() => uploader.retryFailed()}>
            Try those again
          </button>
        </div>
      )}

      {chunks.length > 0 && (
        <section className="rec-chunks" aria-label="Word lists">
          <h2 className="rec-list-head">Pick a list</h2>
          <div className="rec-chunk-grid">
            {chunks.map(({ listId, progress }) => {
              const label = LIST_LABELS[listId] ?? listId;
              const done = progress.pending === 0;
              const active = selectedList === listId;
              return (
                <div
                  key={listId}
                  className={
                    "rec-chunk" + (active ? " rec-chunk-active" : "") + (done ? " rec-chunk-done" : "")
                  }
                >
                  <button className="rec-chunk-head" onClick={() => setSelectedList(active ? null : listId)}>
                    <span className="rec-chunk-name">
                      {done && <span aria-hidden="true">✓ </span>}
                      {label}
                    </span>
                    <span className="rec-chunk-count">
                      {progress.done} of {progress.total}
                    </span>
                  </button>
                  <ProgressBar progress={progress} />
                  {done ? (
                    <p className="rec-chunk-note">All done. Thank you!</p>
                  ) : (
                    <button className="rec-btn rec-btn-primary rec-chunk-cta" onClick={() => recordList(listId)}>
                      Record {label} (~{minutesLeft(progress.pending)} min)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedList !== null && (
            <button className="rec-link" onClick={() => setSelectedList(null)}>
              Show all lists
            </button>
          )}
        </section>
      )}

      {chunks.length === 0 && visiblePending.length > 0 && (
        <button className="rec-btn rec-btn-primary" onClick={() => recordList(null)}>
          Start recording ({visiblePending.length} left, ~{minutesLeft(visiblePending.length)} min)
        </button>
      )}

      <p className="rec-sub rec-tip">
        Somewhere quiet, phone about a hand's width from your mouth. The microphone only starts
        when you tap a Record button.
      </p>

      <section className="rec-words" aria-label="Words">
        <div className="rec-words-head">
          <h2 className="rec-list-head">
            Words in {scopeName} ({STYLE_COPY[selectedStyle].name})
          </h2>
          <div className="rec-filter" role="radiogroup" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["todo", "To record"],
                ["done", "Done"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                className={"rec-filter-btn" + (filter === f ? " rec-filter-btn-active" : "")}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="rec-legend">
          <span className="rec-badge rec-badge-recorded">recorded</span> {STATUS_COPY.recorded.explain}{" "}
          <span className="rec-badge rec-badge-published">published</span> {STATUS_COPY.published.explain}
        </p>

        {visibleWords.length === 0 ? (
          <p className="rec-sub">
            {filter === "todo" ? "Nothing left to record here. Thank you!" : "No words here yet."}
          </p>
        ) : (
          <div className="rec-card-grid">
            {visibleWords.map((w) => (
              <WordCard key={w.id} word={w} captured={captured.has(w.id)} activeStyle={selectedStyle} onOpen={setDetails} />
            ))}
          </div>
        )}
      </section>

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

      {details && (
        <WordDetails
          word={details}
          captured={captured.has(details.id)}
          activeStyle={selectedStyle}
          listLabel={(id) => LIST_LABELS[id] ?? id}
          onRecord={recordOne}
          onClose={() => setDetails(null)}
        />
      )}

      {confirming && (
        <ConfirmRedo
          word={confirming.word}
          onConfirm={() => {
            const { word } = confirming;
            setConfirming(null);
            enterRecording(word.id, "redo");
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function ProgressBar({ progress }: { progress: ListProgress }) {
  const pct = percentDone(progress);
  return (
    <div
      className="rec-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
    >
      <div className="rec-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The status a chip shows: a take captured this session but not yet confirmed reads "uploading". */
function chipStatus(word: BoothWord, style: BoothStyle, captured: boolean, activeStyle: BoothStyle) {
  const status = statusFor(word, style);
  const uploading = captured && style === activeStyle && status === "pending";
  return { status, uploading };
}

function StatusChip({ word, style, captured, activeStyle }: {
  word: BoothWord;
  style: BoothStyle;
  captured: boolean;
  activeStyle: BoothStyle;
}) {
  const { status, uploading } = chipStatus(word, style, captured, activeStyle);
  return (
    <span
      className={`rec-badge rec-badge-${uploading ? "recorded" : status}`}
      title={uploading ? "Uploading…" : STATUS_COPY[status].explain}
    >
      {STYLE_COPY[style].name}: {uploading ? "uploading" : STATUS_COPY[status].chip}
    </span>
  );
}

function WordCard({
  word,
  captured,
  activeStyle,
  onOpen,
}: {
  word: BoothWord;
  captured: boolean;
  activeStyle: BoothStyle;
  onOpen: (w: BoothWord) => void;
}) {
  return (
    <button className="rec-card" onClick={() => onOpen(word)}>
      <span className="rec-card-hanzi">{word.hanzi}</span>
      <span className="rec-card-pinyin">{word.pinyin}</span>
      <span className="rec-card-english">{englishOf(word)}</span>
      <span className="rec-card-chips">
        {STYLES.map((st) => (
          <StatusChip key={st} word={word} style={st} captured={captured} activeStyle={activeStyle} />
        ))}
      </span>
    </button>
  );
}

/** Tap a card: everything about one word, and a record button per style. */
function WordDetails({
  word,
  captured,
  activeStyle,
  listLabel,
  onRecord,
  onClose,
}: {
  word: BoothWord;
  captured: boolean;
  activeStyle: BoothStyle;
  listLabel: (id: string) => string;
  onRecord: (w: BoothWord, style: BoothStyle) => void;
  onClose: () => void;
}) {
  return (
    <div className="rec-confirm" role="dialog" aria-modal="true" aria-label={`${word.pinyin} details`} onClick={onClose}>
      <div className="rec-confirm-card rec-details" onClick={(e) => e.stopPropagation()}>
        <p className="rec-confirm-word">{word.hanzi}</p>
        <p className="rec-details-pinyin">
          {word.pinyin} <span className="rec-tone">· tone {word.tone}</span>
        </p>
        <p className="rec-details-english">{englishOf(word)}</p>
        {word.lists && word.lists.length > 0 && (
          <p className="rec-sub">In: {word.lists.map(listLabel).join(", ")}</p>
        )}
        {STYLES.map((st) => {
          const status = statusFor(word, st);
          return (
            <div className="rec-details-style" key={st}>
              <div className="rec-details-style-text">
                <StatusChip word={word} style={st} captured={captured} activeStyle={activeStyle} />
                <span className="rec-sub">{STATUS_COPY[status].explain}</span>
              </div>
              <button
                className={"rec-btn" + (status === "pending" ? " rec-btn-primary" : "")}
                onClick={() => onRecord(word, st)}
              >
                {status === "pending" ? "Record" : "Re-record"} {STYLE_COPY[st].name.toLowerCase()}
              </button>
            </div>
          );
        })}
        <button className="rec-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
