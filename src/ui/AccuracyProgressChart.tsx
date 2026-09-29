import { useEffect, useRef } from "react";
import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

// Register only the pieces this one line chart needs, so Chart.js stays
// tree-shaken in the app bundle.
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

/**
 * The Progress tab's "Accuracy progress" chart: accuracy-% over time for one
 * tone or pair combo. Pro sees the real per-day series from `run_log`
 * (spec C); guest/free see MOCK placeholder data (`example`). Chart.js line
 * chart with gridlines, a faint area fill, and dot markers, styled to the
 * redesign's paper/ink palette.
 */

const INK_FAINT = "rgba(36, 29, 21, 0.12)";
const INK_MUTED = "#6b6151";
const PAPER = "#f7f1e3"; // --surface, the dot fill

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Props {
  /** What the series is, for the accessible label: "tone 2", "tones 3 + 2". */
  subject: string;
  /** Line colour, a `#rrggbb` hex. */
  color: string;
  labels: string[];
  data: number[];
  /** Placeholder data for the Pro teaser. */
  example?: boolean;
}

export function AccuracyProgressChart({ subject, color, labels, data, example }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: color,
            borderWidth: 3,
            fill: true,
            backgroundColor: hexToRgba(color, 0.12),
            tension: 0.25,
            pointRadius: 5,
            pointHoverRadius: 6,
            pointBackgroundColor: PAPER,
            pointBorderColor: color,
            pointBorderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (ctx) => `${Math.round(ctx.parsed.y ?? 0)}%` },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              color: INK_MUTED,
              font: { size: 12 },
              callback: (v) => `${v}`,
            },
            grid: { color: INK_FAINT },
            border: { display: false },
          },
          x: {
            ticks: { color: INK_MUTED, font: { size: 11 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [color, labels, data]);

  return (
    <div className="acc-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Accuracy over time for ${subject}${example ? " (example data)" : ""}`}
      />
    </div>
  );
}
