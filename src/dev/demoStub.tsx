/**
 * `DemoLoop`'s stand-in for the build-time render, wired in by an alias in
 * `src/dev/prerender.ts`. The real one is a `requestAnimationFrame` loop over a
 * canvas: there is nothing for it to draw in Node, and pulling it in would drag
 * the renderer and the game's gate geometry into a render that should be markup
 * and nothing else.
 *
 * It reserves the same box the canvas will occupy — same max-width, same 420:280
 * ratio, same border — so React swapping the live demo in shifts nothing below
 * it.
 */
export function DemoLoop({
  width = 420,
  height = 280,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="demo-canvas demo-placeholder"
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label="A dot tracing the pitch shape of each of the four Mandarin tones through a matching corridor."
    />
  );
}
