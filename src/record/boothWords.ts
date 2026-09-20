/**
 * The booth's word list, read from the clips Worker.
 *
 * Unlike `src/data/` (which never throws into a caller, because a dead
 * network there degrades a *player's* game to "no board today"), this module
 * DOES throw. The booth is not a player surface — it is Jane's one working
 * tool, and a stale or empty list silently rendered as "nothing to record"
 * would cost a whole session before anyone noticed. `Overview.tsx` catches
 * the throw and shows an error with a Retry button instead.
 */

export type Tone = 1 | 2 | 3 | 4;
export type BoothWordStatus = "pending" | "recorded" | "published";

export interface BoothWord {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: Tone;
  status: BoothWordStatus;
  /**
   * This word's list memberships (`hsk1`, `tocfl2`, `core-120`, …) — lets
   * `Overview.tsx` group/grey by list without a second round trip. Optional:
   * a deployed Worker predating this field, or a rollout where the client
   * updates first, must degrade to "no picker," never crash the booth.
   */
  lists?: string[];
}

/**
 * The Worker's origin. The booth cannot run without it — there is no
 * fallback list to fall back to (the bundled `WORDS` array this used to read
 * was removed from `wordlist.ts` in Task 13, Sep 2026; this module never
 * touched it even before that).
 */
export const RECORD_BASE_URL: string = (
  (import.meta.env.VITE_CLIPS_BASE_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

/**
 * Every call site that hits the Worker directly (`RecordApp`'s passcode
 * check, `Uploader`'s take upload) must guard `RECORD_BASE_URL` the same way
 * `fetchBoothWords` always has — an unset `VITE_CLIPS_BASE_URL` must never
 * silently become a same-origin request to `/auth` or `/raw`, which 404s in
 * a way that reads exactly like a real server error.
 */
export function requireRecordBaseUrl(): string {
  if (!RECORD_BASE_URL) {
    throw new Error("Recording isn't configured — tell Pierre.");
  }
  return RECORD_BASE_URL;
}

/**
 * Whose voice this booth session is recording.
 *
 * Resolved by the Worker from the passcode — there is no way for the booth to
 * ask to be someone else, and no local constant to drift out of date. This
 * replaces the old hardcoded `BOOTH_VOICE`, which was correct only while there
 * was exactly one recorder.
 */
export interface BoothSpeaker {
  id: string;
  name: string;
}

export interface BoothWordsResponse {
  speaker: BoothSpeaker;
  pending: BoothWord[];
  recorded: BoothWord[];
}

/**
 * Fetches the pending/recorded split from `GET /booth/words`.
 *
 * Throws on anything short of a clean 200 with the expected shape — a wrong
 * passcode throws with a message the UI can show verbatim, everything else
 * throws a generic message. There is no silent-empty-list path here.
 */
export async function fetchBoothWords(
  passcode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BoothWordsResponse> {
  const baseUrl = requireRecordBaseUrl();

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/booth/words`, {
      headers: { "x-record-passcode": passcode },
    });
  } catch {
    throw new Error("Couldn't reach the server. Are you online?");
  }

  if (res.status === 401) {
    throw new Error("Wrong code.");
  }
  if (res.status === 503) {
    throw new Error("Recording isn't switched on yet. Tell Pierre — it's his end, not yours.");
  }
  if (!res.ok) {
    throw new Error(`Something broke on the server (${res.status}). Not your fault — tell Pierre.`);
  }

  const body = (await res.json()) as Partial<BoothWordsResponse>;
  const speaker = body.speaker;
  // A missing speaker throws like any other unexpected shape. Recording a
  // whole session as the wrong voice is worse than an error screen, and the
  // booth is not a player surface — it can afford to stop.
  if (
    !speaker ||
    typeof speaker.id !== "string" ||
    typeof speaker.name !== "string" ||
    !Array.isArray(body.pending) ||
    !Array.isArray(body.recorded)
  ) {
    throw new Error("The server sent back something unexpected.");
  }
  return { speaker, pending: body.pending, recorded: body.recorded };
}
