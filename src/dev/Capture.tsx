// Dev-only capture screen: records raw mic audio + per-frame pitch telemetry
// while clips are played into the laptop mic (e.g. from the phone soundboard),
// then downloads `<name>.wav` + `<name>.telemetry.json`. The WAV goes into
// fixtures/captures/ and feeds `npm run report`.
import { useEffect, useRef, useState } from "react";
import { setFrameSink, stopMic } from "../audio/session.ts";
import { DEFAULT_CONFIG, PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import speakers from "../../fixtures/captures/speakers.json";
import { decodeWav, encodeWav } from "./wav.ts";

const HOP_SIZE = 1024;
const READOUT_HZ = 10;

/**
 * f0Center per capture speaker, keyed by the filename prefix
 * (`chen_ma3.wav` → chen). Read from the same file `npm run report` uses, not
 * copied: a trace viewed through the wrong centre clamps flat against chao 1/5
 * and every shape reads as wrong, so the two must never disagree.
 */
const SPEAKER_CENTERS: Record<string, number> = speakers;

interface Props {
  onBack: () => void;
}

interface TracePoint {
  chao: number | null;
  smoothed: number;
  voiced: boolean;
}

interface TelemetryFrame extends PitchState {
  /** Seconds since recording start, at the end of the analysis window. */
  t: number;
}

function download(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Capture({ onBack }: Props) {
  const [name, setName] = useState("pierre_ma1");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<PitchState | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [traceF0, setTraceF0] = useState(115);
  const [trace, setTrace] = useState<{
    name: string;
    points: TracePoint[];
    hopS: number;
    f0Center: number;
    /** Fraction of voiced frames clamped against chao 1 or 5. */
    pinnedPct: number;
  } | null>(null);
  const traceCanvasRef = useRef<HTMLCanvasElement>(null);

  // Draws the full dot trace of an uploaded WAV: the trail with no time
  // pressure, so slow eyes can study what the game saw.
  useEffect(() => {
    const canvas = traceCanvasRef.current;
    if (!canvas || !trace) return;
    const { points } = trace;
    let first = points.findIndex((p) => p.voiced);
    if (first === -1) first = 0;
    let last = points.length - 1;
    while (last > first && !points[last].voiced) last--;
    const pad = 10;
    const start = Math.max(0, first - pad);
    const end = Math.min(points.length - 1, last + pad);
    const n = end - start + 1;

    const w = Math.max(300, n * 4);
    const h = 220;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
    const yOf = (chao: number) => h - ((chao - 1) / 4) * (h - 30) - 15;

    ctx.strokeStyle = "#333";
    ctx.fillStyle = "#666";
    ctx.font = "10px monospace";
    for (let c = 1; c <= 5; c++) {
      ctx.beginPath();
      ctx.moveTo(0, yOf(c));
      ctx.lineTo(w, yOf(c));
      ctx.stroke();
      ctx.fillText(String(c), 4, yOf(c) - 3);
    }

    const xOf = (i: number) => ((i - start) / (n - 1)) * (w - 20) + 10;
    // raw pitch: faint grey dots
    ctx.fillStyle = "#777";
    for (let i = start; i <= end; i++) {
      if (points[i].chao !== null) {
        ctx.fillRect(xOf(i) - 1, yOf(points[i].chao!) - 1, 2, 2);
      }
    }
    // the dot's path: blue line, broken where the game heard nothing
    ctx.strokeStyle = "#4ab3ff";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    let open = false;
    ctx.beginPath();
    for (let i = start; i <= end; i++) {
      if (!points[i].voiced) {
        open = false;
        continue;
      }
      const x = xOf(i);
      const y = yOf(points[i].smoothed);
      if (open) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      open = true;
    }
    ctx.stroke();
  }, [trace]);

  const chunksRef = useRef<Float32Array[]>([]);
  const telemetryRef = useRef<TelemetryFrame[]>([]);
  const sampleRateRef = useRef(0);
  const samplesRef = useRef(0);
  const liveRef = useRef<PitchState | null>(null);

  // Live readout at 10 Hz — never per frame.
  useEffect(() => {
    const timer = setInterval(() => {
      setLive(liveRef.current);
      if (sampleRateRef.current > 0) {
        setElapsed(samplesRef.current / sampleRateRef.current);
      }
    }, 1000 / READOUT_HZ);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => setFrameSink(null), []);

  const start = () => {
    chunksRef.current = [];
    telemetryRef.current = [];
    samplesRef.current = 0;
    setSaved(null);
    setRecording(true);
    let tracker: PitchTracker | null = null;
    // Frames overlap by 50%: keep the first whole, then only the new hop.
    let first = true;
    setFrameSink((frame, sampleRate) => {
      tracker ??= new PitchTracker({ sampleRate });
      sampleRateRef.current = sampleRate;
      chunksRef.current.push(first ? frame : frame.subarray(HOP_SIZE));
      first = false;
      samplesRef.current += chunksRef.current[chunksRef.current.length - 1].length;
      const state = tracker.push(frame);
      liveRef.current = state;
      telemetryRef.current.push({ ...state, t: samplesRef.current / sampleRate });
    });
  };

  const stop = () => {
    setFrameSink(null);
    setRecording(false);
    const sampleRate = sampleRateRef.current;
    if (!sampleRate || chunksRef.current.length === 0) return;

    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    const safe = name.trim().replace(/[^a-z0-9_-]/gi, "_") || "capture";
    const wav = encodeWav(samples, sampleRate);
    download(`${safe}.wav`, new Blob([wav.slice() as Uint8Array<ArrayBuffer>], { type: "audio/wav" }));
    download(
      `${safe}.telemetry.json`,
      new Blob(
        [
          JSON.stringify(
            {
              name: safe,
              sampleRate,
              config: DEFAULT_CONFIG,
              frames: telemetryRef.current,
            },
            null,
            1,
          ),
        ],
        { type: "application/json" },
      ),
    );
    setSaved(`${safe}.wav — move it to fixtures/captures/`);
  };

  const back = () => {
    setFrameSink(null);
    stopMic();
    onBack();
  };

  return (
    <div className="screen title-screen">
      <h1>Capture</h1>
      <p className="tagline">
        Play clips into this machine's mic; each take downloads a WAV +
        telemetry JSON for <code>npm run report</code>.
      </p>

      <label className="note">
        name (speaker_syllableTone, e.g. chen_ma3)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={recording}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>

      <div className="menu">
        {!recording ? (
          <button className="primary" onClick={start}>
            Record
          </button>
        ) : (
          <button className="primary" onClick={stop}>
            Stop &amp; save ({elapsed.toFixed(1)}s)
          </button>
        )}
        <button onClick={back}>Back</button>
      </div>

      {live && (
        <p className="note" style={{ fontVariantNumeric: "tabular-nums" }}>
          {live.voiced ? "voiced" : "—"} · f0 {live.f0?.toFixed(1) ?? "–"} Hz ·
          chao {live.voiced ? live.smoothedChao.toFixed(2) : "–"} · clarity{" "}
          {live.clarity.toFixed(2)} · rms {live.rms.toFixed(4)}
        </p>
      )}
      {saved && <p className="note">saved: {saved}</p>}

      <label className="note" style={{ marginTop: 24, display: "block" }}>
        show the dot trace of a WAV (f0Center{" "}
        <input
          type="number"
          value={traceF0}
          onChange={(e) => setTraceF0(Number(e.target.value))}
          style={{ width: 60 }}
        />{" "}
        Hz)
        <input
          type="file"
          accept=".wav"
          disabled={recording}
          style={{ display: "block", marginTop: 4 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.arrayBuffer().then((buf) => {
              const { samples, sampleRate } = decodeWav(new Uint8Array(buf));
              const speaker = file.name.split("_")[0];
              const f0Center = SPEAKER_CENTERS[speaker] ?? traceF0;
              if (SPEAKER_CENTERS[speaker]) setTraceF0(f0Center);
              const tracker = new PitchTracker({ sampleRate, f0Center });
              const points: TracePoint[] = [];
              let voiced = 0;
              let pinned = 0;
              for (let s = 0; s + 2048 <= samples.length; s += HOP_SIZE) {
                const st = tracker.push(samples.subarray(s, s + 2048));
                points.push({ chao: st.chao, smoothed: st.smoothedChao, voiced: st.voiced });
                if (st.voiced) {
                  voiced++;
                  if (st.chao! <= 1.05 || st.chao! >= 4.95) pinned++;
                }
              }
              setTrace({
                name: file.name,
                points,
                hopS: HOP_SIZE / sampleRate,
                f0Center,
                pinnedPct: voiced ? pinned / voiced : 0,
              });
            });
          }}
        />
      </label>

      {trace && (
        <div className="note">
          <p style={{ margin: "8px 0 4px" }}>
            {trace.name} @ {trace.f0Center} Hz — blue: the dot · grey: raw
            pitch · blank: unheard
          </p>
          {trace.pinnedPct > 0.4 && (
            <p style={{ margin: "0 0 4px", color: "#f80" }}>
              ⚠ {Math.round(trace.pinnedPct * 100)}% of the pitch is pinned at
              the top/bottom edge — f0Center is probably wrong for this
              speaker, so the shape is squashed flat.
            </p>
          )}
          <canvas
            ref={traceCanvasRef}
            style={{ width: "100%", background: "#111", borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
