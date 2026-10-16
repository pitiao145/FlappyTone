/**
 * Canvas colours, resolved from the CSS design tokens in `src/ui/tokens.css`.
 *
 * The canvas cannot use `var(--accent)` — it composites nearly everything with
 * a per-frame alpha, so it needs the components. This module reads the tokens
 * off `:root` once at startup and hands back `"r, g, b"` strings for
 * `rgba(...)` interpolation, so a re-brand is still one file (tokens.css) and
 * not a hunt through the renderer.
 *
 * Resolution happens lazily and behind a try/catch: the render tests run in a
 * DOM-less environment, and `npm run analyze` runs in Node. The literals below
 * are the shipped values and are what those paths get.
 */

export const FALLBACK = {
  surface: "247, 241, 227",
  backdrop: "238, 228, 204",
  accent: "28, 122, 99",
  good: "44, 143, 97",
  danger: "163, 52, 31",
  /** The demo / reference trace: warm, so it never reads as the player's own line. */
  demo: "168, 108, 32",
  /** The Chao guide grid. Recedes behind everything. */
  grid: "60, 52, 42",
  /** Ink at full strength, for canvas strokes that composite with alpha. */
  ink: "36, 29, 21",
  /** Gate outcome: "ok" (amber), deliberately outside the brand's colour language. */
  gateOk: "150, 118, 40",
  /** Gate outcome: "unheard" (neutral grey). */
  gateUnheard: "130, 122, 108",
  /** Gate edge glow when pinned at the top/bottom of the range. */
  gateGlow: "196, 140, 30",
  /** The Pip's beak. */
  beak: "200, 138, 60",
} as const;

type Token = keyof typeof FALLBACK;

export const CSS_VAR: Record<Token, string> = {
  surface: "--surface-rgb",
  backdrop: "--canvas-backdrop-rgb",
  accent: "--accent-rgb",
  good: "--good-rgb",
  danger: "--danger-rgb",
  demo: "--demo-rgb",
  grid: "--grid-rgb",
  ink: "--ink-rgb",
  gateOk: "--gate-ok-rgb",
  gateUnheard: "--gate-unheard-rgb",
  gateGlow: "--gate-glow-rgb",
  beak: "--beak-rgb",
};

let resolved: Record<Token, string> | null = null;

function resolve(): Record<Token, string> {
  if (resolved) return resolved;
  const out = { ...FALLBACK } as Record<Token, string>;
  try {
    const style = getComputedStyle(document.documentElement);
    for (const key of Object.keys(CSS_VAR) as Token[]) {
      const v = style.getPropertyValue(CSS_VAR[key]).trim();
      // A token that is missing or not a triple keeps the shipped literal —
      // a half-applied theme should degrade to the old look, not to black.
      if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v)) out[key] = v;
    }
  } catch {
    /* no DOM (tests, CLI): fallbacks stand */
  }
  resolved = out;
  return out;
}

/** `"r, g, b"` for the named token, for use inside a template `rgba(...)`. */
export function rgb(token: Token): string {
  return resolve()[token];
}

/** `rgba(r, g, b, a)` for the named token. */
export function rgba(token: Token, alpha: number): string {
  return `rgba(${resolve()[token]}, ${alpha})`;
}

/** The named token's components, for callers that interpolate between colours. */
export function rgbTuple(token: Token): [number, number, number] {
  const [r, g, b] = resolve()[token].split(",").map((n) => Number(n.trim()));
  return [r, g, b];
}

/** Opaque `rgb(r, g, b)` for the named token. */
export function solid(token: Token): string {
  return `rgb(${resolve()[token]})`;
}

/**
 * Drops the memoised values, so a theme change mid-session is picked up.
 * Nothing calls this in production yet; it exists so swapping tokens at
 * runtime is a one-liner rather than a reload.
 */
export function resetPalette(): void {
  resolved = null;
}

/**
 * The "pixel-flappy" game-canvas theme (brief 06): Taiwan pixel-art backdrop
 * and mountain walls. Opaque hex colours, mirrored as `--pf-*` in tokens.css.
 * Kept as literals rather than resolved from CSS: every colour here is baked
 * into an offscreen tile once, so there is no per-frame alpha to interpolate,
 * and the pure builders must run without a DOM (tests).
 */
export const PIXEL_FLAPPY = {
  sky: ["#86d0f2", "#9ad9f6", "#aee2f8", "#c3ebfa", "#d7f2fb"],
  /** Band lower edges, as fractions of H (the last band runs to the bottom). */
  skyStops: [0.198, 0.358, 0.507, 0.643],
  /** The theme's backdrop for the cue veil: the lowest sky band. */
  backdropRgb: "215, 242, 251",
  sun: "#fff3b8",
  cloud: "#ffffff",
  cloudShade: "#d8eef9",
  ridgeFar: "#a6d8e8",
  ridgeNear: "#86c4da",
  skyline: "#6fb0d8",
  window: "#d4f0fb",
  towerLit: "#5fa8d3",
  towerShade: "#4a8fbf",
  towerBelt: "#2f6f9f",
  lowland: "#a8dc72",
  lowlandEdge: "#8ccb55",
  tuft: "#6ab030",
  wallBase: "#2b6e2a",
  wallForest: "#1f5a24",
  /** Lit rim bands, nearest the channel first: d1, d2, d3–4, d5–6. */
  rim: ["#d3ee86", "#86cf47", "#58ae3a", "#3a8f30"],
  outline: "#1d3a17",
  outlineRgb: "29, 58, 23",
  grass: "#7cc23a",
  grassHi: "#a5de52",
  grassNotch: "#6ab030",
  sand: "#dccf8a",
} as const;

/**
 * The "Taroko" theme (brief 07): marble gorge, turquoise river, red shrine.
 * Mirrors `--tk-*` in tokens.css.
 */
export const TAROKO = {
  /** Sky gradient stops, as [fraction of H, colour]; flat below the last. */
  sky: [
    [0, "#8cc4e4"],
    [0.55, "#cfe7f0"],
    [0.85, "#eef3ec"],
  ] as ReadonlyArray<readonly [number, string]>,
  cloud: "#ffffff",
  peakFar: "#b4c5ce",
  peakNear: "#92a9b6",
  haze: "#eef3ec",
  hazeRgb: "238, 243, 236",
  bluff: "#7c786d",
  bluffCrest: "#5f9b4b",
  hall: "#8a2f22",
  post: "#a3341f",
  roof: "#c0392b",
  roofEdge: "#7a1f16",
  finial: "#e8b84a",
  riverTop: "#46c6ba",
  riverBottom: "#1c8f95",
  boulder: "#8b877a",
  /** Bottom wall gradient, 0.544H → H. */
  wallBottom: [
    [0, "#8d887a"],
    [0.5, "#5e5c53"],
    [1, "#3a3b36"],
  ] as ReadonlyArray<readonly [number, string]>,
  /** Top wall gradient, 0 → 0.519H. */
  wallTop: [
    [0, "#3a3b36"],
    [0.6, "#65625a"],
    [1, "#928d7f"],
  ] as ReadonlyArray<readonly [number, string]>,
  strataLight: "#ece6d6",
  strataDark: "#2c2b27",
  fringeDark: "#4d8a42",
  fringeLight: "#6aa352",
  outline: "#2a2925",
  outlineRgb: "42, 41, 37",
  rim: "#c9722a",
  gridLabel: "#f7f1e3",
  /** Cue veil colour. */
  veilRgb: "238, 243, 236",
} as const;
