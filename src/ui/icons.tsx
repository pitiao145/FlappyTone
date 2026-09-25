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

/**
 * Footer "Connect" icons, Phosphor Regular, redrawn from the 24-unit paths in
 * `docs/_archive/redesign/footer-template.tsx` into this file's 256-unit convention
 * (same BOX/STROKE spread as every icon above) rather than pasted verbatim —
 * a 24-unit path in a 256 viewBox draws as a speck in the corner.
 */

/** Phosphor `ArrowSquareOut`-style external link glyph (web). */
export function WebIcon() {
  return (
    <svg {...BOX}>
      <polyline points="152,64 216,64 216,128" {...STROKE} />
      <line x1="216" y1="64" x2="112" y2="168" {...STROKE} />
      <path d="M184,136v64a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8h64" {...STROKE} />
    </svg>
  );
}

/** X (formerly Twitter) wordmark glyph — filled, not stroked, like the source. */
export function XIcon() {
  return (
    <svg {...BOX}>
      <path
        d="M197.58,20H235L146.71,110.7,251,236H169.75L106,157.15,33,236H0L94.72,138.44,0,20H83.25l57.6,72.19ZM183.15,214H206.6L69.05,42H44.13Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Phosphor `Coffee`, Regular. */
export function CoffeeIcon() {
  return (
    <svg {...BOX}>
      <path d="M184,88h16a40,40,0,0,1,0,80H180" {...STROKE} />
      <path d="M24,88H184v88a16,16,0,0,1-16,16H64a16,16,0,0,1-16-16V88a0,0,0,0,1,0,0Z" {...STROKE} />
      <line x1="72" y1="24" x2="72" y2="48" {...STROKE} />
      <line x1="112" y1="24" x2="112" y2="48" {...STROKE} />
      <line x1="152" y1="24" x2="152" y2="48" {...STROKE} />
    </svg>
  );
}

/** Phosphor `EnvelopeSimple`, Regular. */
export function MailIcon() {
  return (
    <svg {...BOX}>
      <rect x="24" y="56" width="208" height="144" rx="8" {...STROKE} />
      <polyline points="223.83,64.65 128,133.15 32.17,64.65" {...STROKE} />
    </svg>
  );
}

/** Phosphor `Export`, Regular — iOS Safari's Share glyph. */
export function ShareIcon() {
  return (
    <svg {...BOX}>
      <line x1="128" y1="24" x2="128" y2="152" {...STROKE} />
      <polyline points="88,64 128,24 168,64" {...STROKE} />
      <path d="M192,104h16a8,8,0,0,1,8,8v96a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V112a8,8,0,0,1,8-8H64" {...STROKE} />
    </svg>
  );
}

/** Phosphor `DotsThreeVertical`, Regular — Chrome's overflow menu glyph. */
export function DotsThreeVerticalIcon() {
  return (
    <svg {...BOX}>
      <circle cx="128" cy="128" r="16" fill="currentColor" />
      <circle cx="128" cy="60" r="16" fill="currentColor" />
      <circle cx="128" cy="196" r="16" fill="currentColor" />
    </svg>
  );
}

/** Phosphor `PlusSquare`, Regular — the "Add to Home Screen" / "Install app" glyph. */
export function PlusSquareIcon() {
  return (
    <svg {...BOX}>
      <rect x="40" y="40" width="176" height="176" rx="8" {...STROKE} />
      <line x1="88" y1="128" x2="168" y2="128" {...STROKE} />
      <line x1="128" y1="88" x2="128" y2="168" {...STROKE} />
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

/** Bold weight (stroke-width 24, not Regular's 16) — the silent-mode
 * screen's icons need to read clearly at the large size they're shown at. */
const STROKE_BOLD = { ...STROKE, strokeWidth: "24" } as const;

/** Phosphor `SpeakerHigh`, Bold — the silent-mode warning's volume glyph. */
export function SpeakerHighIcon() {
  return (
    <svg {...BOX}>
      <path
        d="M80,168H32a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H80l72-56V224Z"
        {...STROKE_BOLD}
      />
      <line x1="80" y1="88" x2="80" y2="168" {...STROKE_BOLD} />
      <path d="M192,106.85a32,32,0,0,1,0,42.3" {...STROKE_BOLD} />
      <path d="M221.67,80a72,72,0,0,1,0,96" {...STROKE_BOLD} />
    </svg>
  );
}

/** Phosphor `BellSimpleRinging`, Bold — the silent-mode warning's ring glyph. */
export function BellRingingIcon() {
  return (
    <svg {...BOX}>
      <line x1="96" y1="228" x2="160" y2="228" {...STROKE_BOLD} />
      <path d="M184,24a102.71,102.71,0,0,1,36.29,40" {...STROKE_BOLD} />
      <path d="M35.71,64A102.71,102.71,0,0,1,72,24" {...STROKE_BOLD} />
      <path
        d="M52,188a8,8,0,0,1-6.38-12.81C53.85,164.49,63.84,144.6,64,112a64,64,0,0,1,128,0c.16,32.6,10.15,52.49,18.35,63.19A8,8,0,0,1,204,188Z"
        {...STROKE_BOLD}
      />
    </svg>
  );
}

/** Phosphor `ArrowClockwise`, Regular. */
export function RestartIcon() {
  return (
    <svg {...BOX}>
      <path
        d="M232,72v64a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h44.69L164.11,88.19a80,80,0,1,0-1.7,111.63A8,8,0,1,1,173.53,211,96,96,0,1,1,175.9,76.24L216,116.7V72a8,8,0,0,1,16,0Z"
        fill="currentColor"
      />
    </svg>
  );
}
