import { useEffect, useRef, useState } from "react";
import type { FreeAttempt } from "../game/freeAttempts.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { rgba } from "../render/palette.ts";
import { BACKDROP, chaoToY, drawChaoGrid } from "../render/scene.ts";
import { scrollSegments } from "../render/visualiser.ts";

/**
 * Free mode's recent attempts: a large portrait preview of the selected one
 * on the left (with the chao grid, so heights can be read), and the latest
 * attempts as small thumbnails stacked on the right, newest on top. Each
 * shape is scaled to fit its box, so the whole word is visible even if it
 * scrolled off the main line.
 */
export function AttemptThumbs(props: {
  attempts: readonly FreeAttempt[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const selected = props.attempts.find((a) => a.id === props.selectedId) ?? null;
  const newestFirst = [...props.attempts].reverse();
  return (
    <div className="vis-attempts">
      <div className="vis-attempt-preview">
        {selected && <AttemptCanvas attempt={selected} grid />}
      </div>
      <div className="vis-attempt-list" aria-label="Recent attempts">
        {newestFirst.map((a, i) => (
          <button
            key={a.id}
            className={a.id === props.selectedId ? "vis-attempt active" : "vis-attempt"}
            onClick={() => props.onSelect(a.id)}
            aria-label={i === 0 ? "Latest attempt" : `Attempt ${i + 1} from latest`}
            aria-pressed={a.id === props.selectedId}
          >
            <AttemptCanvas attempt={a} grid={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One attempt, drawn at its box's real CSS size (times DPR) and never
 * stretched by CSS — stretching a small bitmap is what made it blurry.
 */
function AttemptCanvas({ attempt, grid }: { attempt: FreeAttempt; grid: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }),
    );
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const { w, h } = size;
    if (!canvas || w === 0 || h === 0) return;
    const ctx = scaleForDpr(canvas, w, h);
    if (!ctx) return;
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, w, h);
    if (grid) {
      drawChaoGrid(ctx, w, h);
    } else {
      // Just the rest line (chao 3), for a sense of high and low.
      ctx.strokeStyle = rgba("accent", 0.14);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const restY = Math.round(chaoToY(3, h)) + 0.5;
      ctx.moveTo(0, restY);
      ctx.lineTo(w, restY);
      ctx.stroke();
    }

    const pts = attempt.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!first || !last) return;
    // The grid's labels sit on the left edge; keep the line clear of them.
    const left = grid ? 28 : 8;
    const right = 8;
    const spanMs = Math.max(1, last.atMs - first.atMs);
    // The same chao scale as the main canvas (chaoToY), so heights compare.
    const segs = scrollSegments(pts, last.atMs, (w - left - right) / spanMs, w - right, h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const seg of segs) {
      const bridge = seg.kind === "bridge";
      ctx.setLineDash(bridge ? [3, 5] : []);
      ctx.strokeStyle = rgba("accent", bridge ? 0.4 : 1);
      ctx.lineWidth = (bridge ? 1.25 : 2.25) * (grid ? 1.4 : 1);
      ctx.beginPath();
      seg.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }, [attempt, grid, size]);
  return <canvas ref={ref} />;
}
