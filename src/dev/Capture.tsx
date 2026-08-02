// Dev-only capture screen: records raw mic audio + per-frame pitch telemetry
// while clips are played into the laptop mic (e.g. from the phone soundboard),
// then downloads `<name>.wav` + `<name>.telemetry.json`. The WAV goes into
// fixtures/captures/ and feeds `npm run report`.
import { useEffect, useRef, useState } from "react";
import { setFrameSink, stopMic } from "../audio/session.ts";
import { DEFAULT_CONFIG, PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { decodeWav, encodeWav } from "./wav.ts";

const HOP_SIZE = 1024;
const READOUT_HZ = 10;

interface Props {
  onBack: () => void;
  /** Navigates to a game run driven by the given recording instead of the mic. */
  onReplay: (samples: Float32Array, sampleRate: number) => void;
  /** Replay needs calibration settings to exist (the game screen requires them). */
  replayEnabled: boolean;
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

export function Capture({ onBack, onReplay, replayEnabled }: Props) {
  const [name, setName] = useState("pierre_ma1");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<PitchState | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
        replay a WAV into the game (dot flies from the recording)
        <input
          type="file"
          accept=".wav"
          disabled={recording || !replayEnabled}
          style={{ display: "block", marginTop: 4 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.arrayBuffer().then((buf) => {
              const { samples, sampleRate } = decodeWav(new Uint8Array(buf));
              stopMic();
              onReplay(samples, sampleRate);
            });
          }}
        />
        {!replayEnabled && <span> (calibrate first)</span>}
      </label>
    </div>
  );
}
