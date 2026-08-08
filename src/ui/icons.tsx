/**
 * The in-run control icons.
 *
 * Drawn rather than typed: the pause button used to be the glyph `‖`, which is
 * a double vertical line at text weight — at 13px on a phone, over a moving
 * corridor, it read as a rendering artefact rather than a control. These are
 * sized by their container and inherit `currentColor`.
 *
 * `stroke-width` is in the 24-unit viewBox, so a 24px-wide icon draws at the
 * stated pixel weight and scales with the button.
 */

const BOX = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false };

/** Two solid bars. Solid, not stroked — a pause mark is a pair of shapes. */
export function PauseIcon() {
  return (
    <svg {...BOX} fill="currentColor">
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.25" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.25" />
    </svg>
  );
}

/** A solid right-pointing triangle, optically centred (nudged right of true). */
export function PlayIcon() {
  return (
    <svg {...BOX} fill="currentColor">
      <path d="M8 5.2a1 1 0 0 1 1.53-.85l9 6.8a1 1 0 0 1 0 1.7l-9 6.8A1 1 0 0 1 8 18.8Z" />
    </svg>
  );
}

/**
 * A six-tooth gear. Six rather than eight: at 20px the teeth of an eight-tooth
 * gear merge into a circle, and a circle is not a settings icon.
 */
export function GearIcon() {
  return (
    <svg
      {...BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v3M12 18.4v3M20.1 7.3l-2.6 1.5M6.5 15.2l-2.6 1.5M20.1 16.7l-2.6-1.5M6.5 8.8 3.9 7.3" />
    </svg>
  );
}
