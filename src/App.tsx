import { useCallback, useRef, useState } from "react";
import { MicError, startMic, type MicSession } from "./audio/mic";
import { DevPanel } from "./dev/DevPanel";
import { handleFrame, startLoop } from "./game/loop";
import "./App.css";

type Phase = "idle" | "starting" | "running" | "error";

const ERROR_COPY: Record<string, string> = {
  "permission-denied":
    "Microphone access was denied. Allow the mic in your browser's site settings and reload.",
  "no-microphone": "No microphone found. Plug one in and reload.",
  "no-audioworklet":
    "This browser doesn't support AudioWorklet. Try a recent Chrome, Firefox or Safari.",
  unknown: "Couldn't start the microphone.",
};

const CANVAS_W = 420;
const CANVAS_H = Math.round((420 * 16) / 9);

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKind, setErrorKind] = useState<string>("unknown");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<MicSession | null>(null);

  const start = useCallback(async () => {
    setPhase("starting");
    try {
      // startMic must be called inside this gesture handler (iOS Safari)
      sessionRef.current = await startMic(handleFrame);
      if (canvasRef.current) startLoop(canvasRef.current);
      setPhase("running");
    } catch (err) {
      setErrorKind(err instanceof MicError ? err.kind : "unknown");
      setPhase("error");
    }
  }, []);

  return (
    <div className="app">
      <div className="stage">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
        {phase !== "running" && (
          <div className="overlay">
            {phase === "error" ? (
              <p className="error">{ERROR_COPY[errorKind]}</p>
            ) : (
              <>
                <p>Needs a microphone and a quiet room.</p>
                <button onClick={start} disabled={phase === "starting"}>
                  {phase === "starting" ? "Starting…" : "Tap to start"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <DevPanel />
    </div>
  );
}
