/**
 * Tap-to-hear for a route-table page's example words. Imported lazily on the
 * first tap (`import("./wordAudio.ts")`), so none of it is in a page's initial
 * chunk, and it never opens the microphone.
 *
 * Deliberately not `src/audio/`: site pages must not import it (CLAUDE.md,
 * "Three entries"), and this needs none of it — one guest play ticket from the
 * clips Worker, then one clip per tap, played through a plain `<audio>`. One
 * request per tap from a person is far under the Worker's rate limit, so it
 * does not need `clipQueue`'s pacing. A guest ticket is enough: every word is
 * `min_tier='free'`. Every failure is silent (resolves `false`).
 */

const BASE =
  (import.meta.env.VITE_CLIPS_BASE_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  ) || null;
const SPEAKER = "jane";

let ticket: Promise<string | null> | null = null;
const urls = new Map<string, Promise<string | null>>();
let playing: HTMLAudioElement | null = null;

function getTicket(): Promise<string | null> {
  ticket ??= fetch(`${BASE}/token`, { method: "POST" })
    .then((r) => (r.ok ? r.json() : null))
    .then((b: { token?: unknown } | null) =>
      typeof b?.token === "string" ? b.token : null,
    )
    .catch(() => null)
    .then((t) => {
      if (!t) ticket = null; // retry on the next tap
      return t;
    });
  return ticket;
}

export type ClipStyle = "textbook" | "natural";

/** A blob URL for the word's clip, fetched once; `null` on any failure. */
export function clipUrl(
  id: string,
  style: ClipStyle = "textbook",
): Promise<string | null> {
  const key = `${style}:${id}`;
  let p = urls.get(key);
  if (!p) {
    p = getTicket()
      .then((t) =>
        t
          ? fetch(
              `${BASE}/clip/${SPEAKER}/${encodeURIComponent(id)}${style === "natural" ? "?style=natural" : ""}`,
              {
                headers: { Authorization: `Bearer ${t}` },
              },
            )
          : null,
      )
      .then((r) => (r && r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urls.set(key, p);
    // A failure is not cached: the next tap tries again.
    void p.then((u) => {
      if (!u) urls.delete(key);
    });
  }
  return p;
}

/** Plays the word's clip (textbook unless asked). Resolves when it ends; `false` on any failure. */
export async function playWord(
  id: string,
  style: ClipStyle = "textbook",
): Promise<boolean> {
  if (!BASE) return false;
  const url = await clipUrl(id, style);
  if (!url) return false;
  try {
    playing?.pause();
    const audio = new Audio(url);
    playing = audio;
    await audio.play();
    await new Promise<void>((done) => {
      audio.onended = () => done();
      audio.onpause = () => done();
      audio.onerror = () => done();
    });
    return true;
  } catch {
    return false;
  }
}
