/**
 * The in-run control icons — Phosphor Icons, Regular weight (MIT licensed).
 *
 * Pasted as inline SVG rather than pulled from `@phosphor-icons/react`: three
 * icons do not justify a dependency, and inlining keeps them in the same
 * bundle as everything else.
 *
 * They are stroked, not filled, and inherit `currentColor` and their size from
 * the button. Phosphor's own `width`/`height` attributes are dropped for that
 * reason, as is the transparent 256x256 `<rect>` it wraps every export in —
 * it has no fill and no stroke, so it draws nothing.
 *
 * `stroke-width` is in the 256-unit viewBox: at the 20px these render at, the
 * shipped 16 draws as 1.25px.
 */

const BOX = { viewBox: "0 0 256 256", "aria-hidden": true, focusable: false };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "16",
} as const;

/** Phosphor `Pause`, Regular. */
export function PauseIcon() {
  return (
    <svg {...BOX}>
      <rect x="152" y="40" width="56" height="176" rx="8" {...STROKE} />
      <rect x="48" y="40" width="56" height="176" rx="8" {...STROKE} />
    </svg>
  );
}

/**
 * A play triangle drawn to match — same viewBox, same stroke weight and joins,
 * and the same 40–216 vertical extent as the pause bars, so the two sit level.
 *
 * Not a Phosphor export: `Play` was not among the icons supplied. Swap in the
 * real one if the family resemblance is not close enough.
 */
export function PlayIcon() {
  return (
    <svg {...BOX}>
      <path d="M72,48,216,128,72,208Z" {...STROKE} />
    </svg>
  );
}

/**
 * Phosphor `Heart`, Regular (outline) and Bold-ish fill for the filled state.
 *
 * `filled` swaps the fill-only heart in for the stroked outline — both share
 * the same path so the two line up exactly when one replaces the other.
 */
export function HeartIcon({ filled }: { filled: boolean }) {
  const path =
    "M128,224.15c-3.94,0-7.75-1.53-10.62-4.29L46.14,151.4a76.05,76.05,0,0,1-24-72.32A76.62,76.62,0,0,1,80.31,25a75.31,75.31,0,0,1,47.69,17,75.31,75.31,0,0,1,47.69-17,76.62,76.62,0,0,1,58.17,54.08,76.05,76.05,0,0,1-24,72.32l-71.24,68.46A15.16,15.16,0,0,1,128,224.15Z";
  return (
    <svg {...BOX}>
      <path d={path} {...(filled ? { fill: "currentColor" } : STROKE)} />
    </svg>
  );
}

/** Phosphor `Gear`, Regular. */
export function GearIcon() {
  return (
    <svg {...BOX}>
      <circle cx="128" cy="128" r="40" {...STROKE} />
      <path
        d="M41.43,178.09A99.14,99.14,0,0,1,31.36,153.8l16.78-21a81.59,81.59,0,0,1,0-9.64l-16.77-21a99.43,99.43,0,0,1,10.05-24.3l26.71-3a81,81,0,0,1,6.81-6.81l3-26.7A99.14,99.14,0,0,1,102.2,31.36l21,16.78a81.59,81.59,0,0,1,9.64,0l21-16.77a99.43,99.43,0,0,1,24.3,10.05l3,26.71a81,81,0,0,1,6.81,6.81l26.7,3a99.14,99.14,0,0,1,10.07,24.29l-16.78,21a81.59,81.59,0,0,1,0,9.64l16.77,21a99.43,99.43,0,0,1-10,24.3l-26.71,3a81,81,0,0,1-6.81,6.81l-3,26.7a99.14,99.14,0,0,1-24.29,10.07l-21-16.78a81.59,81.59,0,0,1-9.64,0l-21,16.77a99.43,99.43,0,0,1-24.3-10l-3-26.71a81,81,0,0,1-6.81-6.81Z"
        {...STROKE}
      />
    </svg>
  );
}
