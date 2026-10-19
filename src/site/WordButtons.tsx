/**
 * "Listen" and "See it" for a route-table page's words. Both load their code
 * on the tap (`wordAudio.ts`, `WordViewer.tsx`), so neither is in a page's
 * initial chunk, and neither opens the microphone.
 */

import { useState } from "react";
import type { ExampleClip } from "./exampleClips.ts";
import type { ViewerWord } from "./WordViewer.tsx";

export function PlayButton({
  id,
  label,
  onPlay,
  style = "textbook",
  text = "Listen",
}: {
  id: string;
  label: string;
  /** Which recording: standard (textbook) or spoken (natural). */
  style?: "textbook" | "natural";
  /** The button's visible label. */
  text?: string;
  /** Called on each tap, before the clip loads (analytics). */
  onPlay?: () => void;
}) {
  const [state, setState] = useState<"idle" | "playing" | "failed">("idle");
  return (
    <button
      type="button"
      className="site-play"
      data-state={state}
      aria-label={`Play ${label}`}
      onClick={() => {
        onPlay?.();
        setState("playing");
        // Lazy: no audio code in the page's initial chunk, and never the mic.
        import("./wordAudio.ts")
          .then((m) => m.playWord(id, style))
          .then((ok) => setState(ok ? "idle" : "failed"))
          .catch(() => setState("failed"));
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {state === "playing" ? (
          <path d="M4 9h3l5-4v14l-5-4H4zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
        ) : (
          <path d="M8 5v14l11-7z" />
        )}
      </svg>
      <span>{state === "failed" ? "No audio" : text}</span>
    </button>
  );
}

type Viewer = typeof import("./WordViewer.tsx");

export function SeeButton({
  word,
  clip,
  from,
  onOpen,
}: {
  word: ViewerWord;
  /** The word's measured clip; defaults to the hub's `EXAMPLE_CLIPS`. */
  clip?: ExampleClip;
  /** The page path, for the viewer's "Try it" link (`?src=`). */
  from?: string;
  onOpen?: () => void;
}) {
  const [mod, setMod] = useState<Viewer | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="site-play site-see"
        aria-label={`See the pitch of ${word.hanzi} ${word.pinyin}`}
        onClick={() => {
          onOpen?.();
          // Lazy: the viewer (and its audio) loads on this tap only.
          import("./WordViewer.tsx")
            .then((m) => {
              setMod(m);
              setOpen(true);
            })
            .catch(() => {});
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 14c3 0 4-6 8-6s4 8 10 8" />
        </svg>
        <span>See it</span>
      </button>
      {open && mod && (
        <mod.WordViewer
          word={word}
          clip={clip}
          from={from}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
