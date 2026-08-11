/**
 * `DemoLoop`'s stand-in for the build-time render, wired in by an alias in
 * `src/dev/prerender.ts`. The real one is a `<video>` playing a recorded
 * clip: there is nothing for it to play in Node, and pulling it in would
 * drag browser media APIs into a render that should be markup and nothing
 * else.
 *
 * It reserves the same box the video will occupy — same max-width, same
 * 862:1520 ratio (the clip's native pixel size), same border — so React
 * swapping the live demo in shifts nothing below it.
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
