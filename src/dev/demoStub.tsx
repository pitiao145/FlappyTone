/**
 * `DemoLoop` and `VisualiserDemoLoop`'s stand-in for the build-time render,
 * wired in by an alias in `src/dev/prerender.ts`. The real ones are `<video>`
 * elements playing a recorded clip: there is nothing for them to play in
 * Node, and pulling one in would drag browser media APIs into a render that
 * should be markup and nothing else.
 *
 * Each reserves the same box its video will occupy — same max-width, same
 * ratio (the clip's native pixel size), same border — so React swapping the
 * live demo in shifts nothing below it.
 */
export function DemoLoop({
  width = 300,
  height = Math.round((300 * 1520) / 862),
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

/** Stand-in for `VisualiserDemoLoop` — 894:1788, the visualiser clip's native size. */
export function VisualiserDemoLoop({
  width = 300,
  height = Math.round((300 * 1788) / 894),
}: {
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="demo-canvas demo-placeholder"
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label="A recorded run of the visualiser: repeated attempts at a tone stacking on the target contour."
    />
  );
}
