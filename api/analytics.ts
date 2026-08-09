/**
 * Receives one play session and files it in Blob storage.
 *
 * Key is `analytics/<yyyy-mm-dd>/<sessionId>.json`. **The date comes from the
 * server clock, not the payload** — a device with a wrong clock would otherwise
 * scatter its sessions across years, and the client's `startedAt` is inside the
 * file anyway if the real time matters.
 *
 * Overwriting is the design, not a concession. The client re-PUTs the whole
 * session on every flush, so the session id is the durable identity of the file
 * the way a word id is for a clip in `upload.ts`. That is what lets a retry be
 * a plain repeat with no dedupe logic on either side.
 *
 * ## Why there is no passcode
 *
 * `upload.ts` is guarded because exactly one person uses `/record`. This
 * endpoint is posted to by every player, so a shared secret would have to ship
 * in the client bundle, where it is not a secret. The defence is instead to
 * make a junk write cheap to reject and impossible to make interesting: a hard
 * size cap, ids that must match a strict character class before they touch a
 * storage path, and a schema that rejects anything it does not recognise.
 *
 * ## The structural privacy guard
 *
 * Every event must be a **flat object of primitives**. No nested objects, no
 * arrays. The client's type union already forbids sending a pitch trace or an
 * audio buffer; this makes it true of anything that reaches the bucket, even if
 * a future client change or a hand-rolled POST tries otherwise. If you ever
 * need a nested field, that is the moment to re-read what this endpoint
 * promises not to store.
 */
import { put } from "@vercel/blob";
import { json } from "./_passcode.js";

/** Matches the ids `src/analytics/store.ts` mints. Validated, never sanitised. */
const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A session at the client's own 2000-event ceiling is ~80KB. This is abuse defence. */
const MAX_BYTES = 128 * 1024;
const MAX_EVENTS = 2000;

/** Top-level keys the payload may carry. Anything else is rejected outright. */
const ALLOWED_KEYS = new Set([
  "v",
  "sessionId",
  "playerId",
  "startedAt",
  "startedAtMs",
  "device",
  "calibration",
  "events",
  "truncated",
]);

const CALIBRATION_KEYS = new Set([
  "f0Center",
  "rangeSemitones",
  "rangeDownSemitones",
  "noiseFloor",
]);

/** Buckets `deviceBucket()` can produce. A device string outside this is a fingerprint attempt. */
const DEVICE = /^(ios|android|desktop)\/(safari|chrome|firefox|edge|other)$/;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length === 0) return json(400, { error: "Empty." });
  if (raw.length > MAX_BYTES) return json(413, { error: "Too large." });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "Bad JSON." });
  }

  const bad = validate(body);
  if (bad) return json(400, { error: bad });
  const session = body as SessionPayload;

  // Server clock: see the header note.
  const day = new Date().toISOString().slice(0, 10);

  await put(`analytics/${day}/${session.sessionId}.json`, raw, {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return json(200, { ok: true });
}

interface SessionPayload {
  sessionId: string;
  playerId: string;
  events: unknown[];
}

/**
 * Returns an error string, or null when the payload is acceptable.
 *
 * Exported for `_analytics.test.ts`. This is the security boundary of a public,
 * unauthenticated endpoint, so it is tested directly rather than only through
 * the handler, which would need Blob credentials to reach.
 */
export function validate(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "Not an object.";
  }
  const rec = body as Record<string, unknown>;

  for (const key of Object.keys(rec)) {
    if (!ALLOWED_KEYS.has(key)) return `Unexpected field: ${key}`;
  }

  if (typeof rec.sessionId !== "string" || !ID.test(rec.sessionId)) {
    return "Bad sessionId.";
  }
  if (typeof rec.playerId !== "string" || !ID.test(rec.playerId)) {
    return "Bad playerId.";
  }
  if (typeof rec.device !== "string" || !DEVICE.test(rec.device)) {
    return "Bad device.";
  }
  if (typeof rec.startedAt !== "string" || rec.startedAt.length > 40) {
    return "Bad startedAt.";
  }

  if (rec.calibration !== null && rec.calibration !== undefined) {
    if (typeof rec.calibration !== "object" || Array.isArray(rec.calibration)) {
      return "Bad calibration.";
    }
    for (const [k, v] of Object.entries(rec.calibration as Record<string, unknown>)) {
      if (!CALIBRATION_KEYS.has(k)) return `Unexpected calibration field: ${k}`;
      if (typeof v !== "number" || !Number.isFinite(v)) return "Bad calibration value.";
    }
  }

  if (!Array.isArray(rec.events)) return "Bad events.";
  if (rec.events.length > MAX_EVENTS) return "Too many events.";

  for (const event of rec.events) {
    const flat = isFlatPrimitiveObject(event);
    if (flat) return flat;
  }

  return null;
}

/**
 * The structural guard described in the header: an event is a flat bag of
 * primitives. A nested object or an array is how bulk data — a contour, a
 * buffer — would arrive, so the shape is refused rather than the field names
 * being blocklisted one at a time.
 */
function isFlatPrimitiveObject(event: unknown): string | null {
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return "Event is not an object.";
  }
  const entries = Object.entries(event as Record<string, unknown>);
  if (entries.length > 20) return "Event has too many fields.";
  if (typeof (event as Record<string, unknown>).type !== "string") {
    return "Event has no type.";
  }
  for (const [k, v] of entries) {
    if (k.length > 24) return "Event field name too long.";
    const t = typeof v;
    if (t === "number") {
      if (!Number.isFinite(v as number)) return "Event has a non-finite number.";
      continue;
    }
    if (t === "boolean") continue;
    if (t === "string") {
      // Long enough for any enum value the client sends, short enough that the
      // field cannot be used to smuggle a blob of text.
      if ((v as string).length > 32) return "Event string too long.";
      continue;
    }
    return "Event field is not a primitive.";
  }
  return null;
}
