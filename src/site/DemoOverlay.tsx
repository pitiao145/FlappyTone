/**
 * The landing page's Try it now demo in a dialog over a site page (brief 25).
 * Loaded only on a CTA tap (`DemoCta.tsx`), with the demo and its mic chunk
 * behind it, so no game code is in a page's initial load (hard rule 13).
 *
 * Full screen on phones, a large centred modal on wider screens. Close
 * button, Esc and a backdrop click all close it; closing unmounts the demo,
 * which stops the run and the mic. The demo writes nothing (no score, stats
 * or run count), as on the landing page.
 */
import { useEffect, useRef } from "react";
import { TryItNow } from "../ui/landing/TryItNow.tsx";
import { openModal } from "./modal.ts";
import "./demoOverlay.css";

export function DemoOverlay({
  page,
  seedId,
  level = "single",
  onClose,
}: {
  /** The route-table page it opened on; unset on the landing page. */
  page?: string;
  seedId: string | null;
  /** "pairs": start on the two-syllable round (the landing's Try Tone Pairs). */
  level?: "single" | "pairs";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    return d ? openModal(d, document) : undefined;
  }, []);

  /** Esc closes it natively; every close fires `close`, and the host unmounts us. */
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="demo-overlay"
      aria-label="Try FlappyTone: say the words to fly the bird"
      onClose={onClose}
      onClick={(e) => {
        // The dialog itself is only hit on the backdrop: the inner panel fills it.
        if (e.target === dialog.current) close();
      }}
    >
      <div className="demo-overlay-inner">
        <button type="button" className="demo-overlay-close" aria-label="Close the game" onClick={close}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <TryItNow surface="overlay" page={page} seedId={seedId} firstLevel={level} onClose={close} />
      </div>
    </dialog>
  );
}
