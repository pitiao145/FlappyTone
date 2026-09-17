/**
 * `POST /raw?id=&session=` — the booth's take upload. Replaces
 * `api/upload.ts` (Task 13 removes that Vercel function once this is
 * proven); the validation here is a verbatim port of it — same id/session
 * regexes, same size cap, same fail-closed ordering (passcode → validation
 * → put → DB write).
 *
 * Two departures from `api/upload.ts`, both required by moving off Blob:
 *
 * 1. **The key includes an `id` that must already be a `words` row.**
 *    `api/upload.ts` let Jane upload a take for any id shape that matched
 *    the regex; nothing checked it against the word list. Here a stray id
 *    (typo, copy-paste from an old list) 404s instead of quietly filing an
 *    orphaned raw clip nothing will ever read back.
 * 2. **A successful put is followed by a DB write** (`status` →
 *    `"recorded"`, plus `raw_key`/`recorded_session`/`recorded_at`) so
 *    `/booth/words` can tell the booth what's left to record. If that write
 *    fails, the route 500s — the put already landed and is idempotent
 *    (`allowOverwrite`-equivalent: R2 `put` always overwrites), so the
 *    booth's uploader retrying is safe and correct, not a duplicate-upload
 *    risk.
 *
 * Since the voice roster, both the key and the row are scoped by the
 * speaker the passcode resolved to (`raw/{speaker}/{session}/{id}.wav`, and
 * an upsert onto `word_clips` with an explicit `(word_id, speaker_id)`
 * conflict target). There is no `?speaker=`: the route cannot be asked to
 * write as someone else. `session` and `id` are both bounded to characters
 * that contain neither `/` nor `.`, so even a hostile client cannot escape
 * its own prefix.
 */
import { isDenied, resolveSpeaker } from "../passcode.ts";
import { serviceDb } from "../db.ts";
import type { Env } from "../index.ts";

/** Word ids are `[a-z0-9]+` by `wordlist.test.ts`; sessions add dashes. */
const ID = /^[a-z0-9]{1,32}$/;
const SESSION = /^[a-z0-9-]{1,40}$/;

/** A citation syllable at 48kHz/16-bit is tens of KB. This is pure abuse defence. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function handleRaw(req: Request, env: Env): Promise<Response> {
  const resolved = resolveSpeaker(req, env);
  if (isDenied(resolved)) return resolved;
  const { speaker } = resolved;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const session = searchParams.get("session") ?? "";
  if (!ID.test(id)) return Response.json({ error: "Bad id." }, { status: 400 });
  if (!SESSION.test(session)) return Response.json({ error: "Bad session." }, { status: 400 });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return Response.json({ error: "Empty upload." }, { status: 400 });
  if (body.byteLength > MAX_BYTES) return Response.json({ error: "Too large." }, { status: 413 });

  const key = `raw/${speaker}/${session}/${id}.wav`;
  const db = serviceDb(env);

  // Checked before touching R2: Jane must not be able to upload a take for
  // a word that does not exist, and that means no object should land in
  // `RAW` for a bad id either, not just no DB row.
  const { data: existing, error: lookupError } = await db
    .from("words")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) {
    return Response.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "Unknown word id." }, { status: 404 });
  }

  await env.RAW.put(key, body, { httpMetadata: { contentType: "audio/wav" } });

  const recordedAt = new Date().toISOString();
  const { error } = await db
    .from("word_clips")
    .upsert(
      {
        word_id: id,
        speaker_id: speaker,
        status: "recorded",
        raw_key: key,
        recorded_session: session,
        recorded_at: recordedAt,
      },
      // Explicit, never an update keyed on `word_id` alone: the row this take
      // belongs to is (word, speaker), and a conflict target that forgot the
      // speaker would overwrite another voice's measurements.
      { onConflict: "word_id,speaker_id" },
    )
    .select("word_id")
    .maybeSingle();

  if (error) {
    // The put already landed; do not swallow this. A retry from the booth's
    // uploader is safe (R2 put overwrites) and is exactly what should happen.
    return Response.json({ error: "Recorded, but the database update failed." }, { status: 500 });
  }

  return Response.json({ ok: true, key });
}
