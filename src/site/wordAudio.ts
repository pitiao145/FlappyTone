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
let finish: (() => void) | null = null;

/**
 * The app's TONEder sets this to the game's own ticket (`src/audio/clipToken.ts`),
 * so a signed-in player gets the words their tier may play. Site pages never
 * set it and stay on a guest ticket.
 */
let provider: (() => Promise<string | null>) | null = null;

export function setTicketProvider(p: (() => Promise<string | null>) | null): void {
  provider = p;
}

function getTicket(): Promise<string | null> {
  if (provider) return provider().catch(() => null);
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

/**
 * One shared element: iOS Safari lets an element play without a tap once it
 * has played inside one, so `unlockAudio()` (called inside a tap) lets later
 * clips start after a fetch.
 */
function element(): HTMLAudioElement {
  playing ??= new Audio();
  return playing;
}

/** A silent play inside a tap, so clips can start later without one (iOS). */
export function unlockAudio(): void {
  try {
    const a = element();
    a.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    void a.play().catch(() => {});
  } catch {
    // Nothing to unlock.
  }
}

/** Stops the clip playing now, if any. */
export function stopWord(): void {
  try {
    playing?.pause();
  } catch {
    // Already stopped.
  }
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
    const audio = element();
    finish?.(); // a clip still playing resolves now
    audio.pause();
    audio.src = url;
    // A pause only ends this clip once it has started: the previous clip's
    // pause event can still be queued.
    let started = false;
    const ended = new Promise<void>((done) => {
      finish = () => {
        finish = null;
        done();
      };
      const end = finish;
      audio.onplaying = () => {
        started = true;
      };
      audio.onended = end;
      audio.onerror = end;
      audio.onpause = () => {
        if (started) end();
      };
    });
    await audio.play();
    await ended;
    return true;
  } catch {
    return false;
  }
}
