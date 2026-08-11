import { useEffect, useRef } from "react";
import { TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";
import { loadReduceMotion } from "../game/settings.ts";
import { ContourSpark } from "./ContourSpark.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

/** Native pixel size of the recorded clip — sets the box's aspect ratio. */
const CLIP_WIDTH = 862;
const CLIP_HEIGHT = 1520;

/**
 * The landing page's "see it" panel: a real recorded run — mostly clean tone
 * corridors, one wall collision near the end — looping on mute.
 *
 * Deliberately **mute and mic-free**: the `<video>` has no audio track at
 * all, and this module must not import from `src/audio/` or construct an
 * `AudioContext`. Someone deciding whether this is for them should be able
 * to watch the mechanic before granting anything.
 */
export function DemoLoop({
  width = 300,
  height = Math.round((300 * CLIP_HEIGHT) / CLIP_WIDTH),
}: {
  width?: number;
  height?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Read once per mount: this decides between playback and a static figure,
  // and flipping between them mid-view would be its own motion.
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) return;
    const video = videoRef.current;
    if (!video) return;

    // A backgrounded tab should not be burning cycles decoding decoration.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  // Reduced motion: the same information, standing still.
  if (reduced) {
    return (
      <div className="demo-static">
        {TONES.map((tone) => (
          <figure key={tone}>
            <ContourSpark tone={tone} width={80} height={44} />
            <figcaption>
              {TONE_INFO[tone].pinyin} {TONE_INFO[tone].hanzi}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <video
      className="demo-canvas"
      ref={videoRef}
      width={width}
      height={height}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-label="A recorded run of the game: the bird tracing each tone's corridor, mostly clean with one wall collision near the end."
    >
      <source src="/hero/hero-flappytone.webm" type="video/webm" />
      <source src="/hero/hero-flappytone.mp4" type="video/mp4" />
    </video>
  );
}

/** The player's explicit choice if they have one, else the OS setting. */
function prefersReduced(): boolean {
  const saved = loadReduceMotion();
  if (saved !== null) return saved;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
