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
  surface: "16, 13, 14",
  backdrop: "18, 15, 16",
  accent: "62, 168, 143",
  good: "95, 194, 152",
  danger: "226, 84, 61",
  /** The demo / reference trace: warm, so it never reads as the player's own line. */
  demo: "235, 208, 170",
  /** The Chao guide grid. Recedes behind everything. */
  grid: "143, 133, 121",
  /** Ink at full strength, for canvas strokes that composite with alpha. */
  ink: "245, 241, 234",
  /** Gate outcome: "ok" (amber), deliberately outside the brand's colour language. */
  gateOk: "210, 200, 140",
  /** Gate outcome: "unheard" (neutral grey). */
  gateUnheard: "180, 180, 190",
  /** Gate edge glow when pinned at the top/bottom of the range. */
  gateGlow: "255, 220, 120",
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
