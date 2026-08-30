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
import type { Tone } from "../game/gates.ts";
import { TONE_LINE_COLOR } from "./toneColors.ts";

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
 * tone. A Pro teaser — the series is MOCK placeholder data (see
 * `mockAccuracySeries` in Progress.tsx); no per-run tone-accuracy history is
 * persisted yet. Chart.js line chart with gridlines, a faint area fill, and
 * dot markers, styled to the redesign's paper/ink palette.
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
  tone: Tone;
  labels: string[];
  data: number[];
}

export function AccuracyProgressChart({ tone, labels, data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const color = TONE_LINE_COLOR[tone];

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
  }, [tone, labels, data]);

  return (
    <div className="acc-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Accuracy over time for tone ${tone} (example data)`}
      />
    </div>
  );
}
