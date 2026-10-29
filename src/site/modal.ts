/**
 * Opens a `<dialog>` as a modal for the demo overlay: the browser's modal
 * dialog traps focus and closes on Esc; this adds the page scroll lock and
 * puts focus back on the control that opened it. No React, so it is tested
 * with stand-ins (`modal.test.ts`).
 */

export interface ModalDialog {
  readonly open: boolean;
  showModal(): void;
}

export interface ModalDocument {
  /** `document.activeElement`: anything with a `focus()` gets focus back. */
  readonly activeElement: unknown;
  readonly documentElement: { style: { overflow: string } };
}

/**
 * Shows `dialog`. The returned function gives the page its scroll back and
 * focus back to the opener (safe to call twice). It does not close the
 * dialog: the host unmounts it on the dialog's `close` event, and React
 * StrictMode's double effect run must not fire one.
 */
export function openModal(dialog: ModalDialog, doc: ModalDocument): () => void {
  const opener = doc.activeElement as { focus?: () => void } | null;
  const root = doc.documentElement.style;
  const overflow = root.overflow;
  root.overflow = "hidden";
  if (!dialog.open) dialog.showModal();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    root.overflow = overflow;
    opener?.focus?.();
  };
}
