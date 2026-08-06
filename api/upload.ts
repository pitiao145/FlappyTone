/**
 * Receives one recorded take and files it in Blob storage.
 *
 * Key is `recordings/<session>/<id>.wav`. Both parts are validated against a
 * strict character class rather than sanitised: these values come from the
 * browser, they end up in a storage path, and quietly rewriting a bad one would
 * file a clip under a name that does not match the word she said.
 *
 * Re-recording a word overwrites its blob — `addRandomSuffix: false` is what
 * makes the id the durable identity of the clip, all the way to the manifest.
 *
 * Private, not public. These are recordings of a named person's voice, and a
 * public blob is readable by anyone who ever comes across its URL. The cut
 * clips in `public/ref/` do ship publicly with the game — that is the point of
 * making them — but the raw session takes are hers, and there is no reason for
 * them to be fetchable without our token.
 */
import { put } from "@vercel/blob";
import { checkPasscode, json } from "./_passcode.js";

/** Word ids are `[a-z0-9]+` by `wordlist.test.ts`; sessions add dashes. */
const ID = /^[a-z0-9]{1,32}$/;
const SESSION = /^[a-z0-9-]{1,40}$/;

/** A citation syllable at 48kHz/16-bit is tens of KB. This is pure abuse defence. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  const session = searchParams.get("session") ?? "";
  if (!ID.test(id)) return json(400, { error: "Bad id." });
  if (!SESSION.test(session)) return json(400, { error: "Bad session." });

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json(400, { error: "Empty upload." });
  if (body.byteLength > MAX_BYTES) return json(413, { error: "Too large." });

  const blob = await put(`recordings/${session}/${id}.wav`, body, {
    access: "private",
    contentType: "audio/wav",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // The pathname, not the URL: a private blob's URL is not usable on its own,
  // and the pathname is what `pull-recordings` reads back with.
  return json(200, { ok: true, pathname: blob.pathname });
}
