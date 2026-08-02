// Dev-only phone soundboard: a grid of tiles, one per native clip in
// public/clips/, opened on a phone (https://<laptop-ip>:5173/?soundboard) and
// pointed at the laptop mic. Tap a tile → the clip plays through the phone
// speaker → the laptop's Capture screen records it.
import { useEffect, useRef, useState } from "react";

interface ManifestEntry {
  id: string;
  speaker: string;
  syllable: string;
  tone: number;
  file: string;
}

const TONE_MARKS = ["ˉ", "ˊ", "ˇ", "ˋ"];

export function Soundboard() {
  const [clips, setClips] = useState<ManifestEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}clips/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setClips)
      .catch((e: unknown) => setError(`Couldn't load clips manifest: ${String(e)} — run npm run fetch-clips`));
  }, []);

  const play = (clip: ManifestEntry) => {
    audioRef.current?.pause();
    const audio = new Audio(`${import.meta.env.BASE_URL}clips/${clip.file}`);
    audioRef.current = audio;
    setPlaying(clip.id);
    audio.onended = () => setPlaying((p) => (p === clip.id ? null : p));
    void audio.play().catch((e: unknown) => setError(String(e)));
  };

  const speakers = [...new Set(clips.map((c) => c.speaker))];

  return (
    <div style={{ padding: 16, minHeight: "100vh", color: "#eee", background: "#141414" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>ToneFlap soundboard</h1>
      <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 16px" }}>
        Point this phone at the laptop mic, hit Record on the laptop's Capture
        screen, then tap tiles. Name captures speaker_syllableTone.
      </p>
      {error && <p style={{ color: "#f66" }}>{error}</p>}
      {speakers.map((speaker) => (
        <section key={speaker}>
          <h2 style={{ fontSize: 15, margin: "16px 0 8px", opacity: 0.8 }}>
            {speaker === "chen" ? "chen (male)" : speaker === "tan" ? "tan (female)" : speaker}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))",
              gap: 8,
            }}
          >
            {clips
              .filter((c) => c.speaker === speaker)
              .map((clip) => (
                <button
                  key={clip.id}
                  onClick={() => play(clip)}
                  style={{
                    padding: "14px 4px",
                    fontSize: 16,
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: playing === clip.id ? "#2e7d32" : "#222",
                    color: "#eee",
                  }}
                >
                  {clip.syllable}
                  {TONE_MARKS[clip.tone - 1]}
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{clip.tone}</div>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
