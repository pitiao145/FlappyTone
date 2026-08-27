/**
 * Subscribes an email to the FlappyTone Kit (ConvertKit) form.
 *
 * Same shape as easy-card-balance-checker's `/api/newsletter/subscribe`: the
 * client never sees `KIT_API_KEY`, it only POSTs an email (and which form it
 * came from) here. Two required Kit calls — upsert the subscriber, then
 * attach them to the form — because Kit's v4 API splits those, plus two
 * optional ones to tag the subscriber by source; see `KIT_TAG_NAME_BY_SOURCE`
 * below. Tag *names*, not ids: `POST /v4/tags` is idempotent (returns the
 * existing tag if the name is already taken), so the env var can hold a
 * human-readable name like "FT-roadmap-signup" instead of a numeric id you'd
 * have to go find in the Kit dashboard first.
 */
import { json } from "./_passcode.js";

const KIT_API_BASE = "https://api.kit.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = process.env.SITE_URL || "https://flappytone.pierrebuilds.dev";

/**
 * Which form a signup came from, tagged in Kit so each source (ComingSoon's
 * roadmap section, Landing's #mobile, the app's EarlyBird modal) shows up as
 * a separate segment rather than one undifferentiated list. Optional per
 * source: a source with no matching env var just isn't tagged, it still
 * subscribes.
 */
const KIT_TAG_NAME_BY_SOURCE: Record<string, string | undefined> = {
  coming_soon: process.env.KIT_TAG_ID_COMING_SOON,
  mobile: process.env.KIT_TAG_ID_MOBILE,
  earlybird: process.env.KIT_TAG_ID_EARLYBIRD,
};

interface KitErrorBody {
  errors?: string[];
}

async function kitRequest(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: KitErrorBody | null }> {
  const res = await fetch(`${KIT_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Kit-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  let data: KitErrorBody | null;
  try {
    data = (await res.json()) as KitErrorBody;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/** Resolves a tag name to its Kit id, creating the tag if it doesn't exist
 * yet. Returns null (rather than throwing) on any failure — tagging is
 * best-effort and must never block a signup that otherwise succeeded. */
async function resolveTagId(name: string, apiKey: string): Promise<string | null> {
  const res = await kitRequest("/v4/tags", apiKey, { name });
  const id = (res.data as { tag?: { id?: number | string } } | null)?.tag?.id;
  if (!res.ok || id == null) {
    console.error(`[newsletter] Could not resolve Kit tag "${name}"`, res.data);
    return null;
  }
  return String(id);
}

function kitErrorMessage(data: KitErrorBody | null, fallback: string): string {
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.join(" ");
  }
  return fallback;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const email =
    typeof (body as Record<string, unknown>)?.email === "string"
      ? ((body as Record<string, unknown>).email as string).trim()
      : "";
  if (!email || !EMAIL_PATTERN.test(email)) {
    return json(400, { error: "Please enter a valid email address." });
  }
  const source =
    typeof (body as Record<string, unknown>)?.source === "string"
      ? ((body as Record<string, unknown>).source as string)
      : undefined;

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) {
    console.error("[newsletter] Missing KIT_API_KEY and/or KIT_FORM_ID env vars");
    return json(503, { error: "Newsletter signup is temporarily unavailable." });
  }

  const create = await kitRequest("/v4/subscribers", apiKey, {
    email_address: email,
    state: "active",
  });
  if (!create.ok) {
    const message = kitErrorMessage(create.data, "Could not subscribe. Please try again.");
    return json(create.status === 422 ? 422 : 502, { error: message });
  }

  const addToForm = await kitRequest(`/v4/forms/${formId}/subscribers`, apiKey, {
    email_address: email,
    referrer: `${SITE_URL}/`,
  });
  if (!addToForm.ok) {
    const message = kitErrorMessage(addToForm.data, "Could not subscribe. Please try again.");
    return json(addToForm.status === 422 ? 422 : 502, { error: message });
  }

  // Best-effort: the subscription above already succeeded, so a tagging
  // failure (or an unconfigured source) shouldn't fail the request or block
  // the success response the form is waiting on.
  const tagName = source ? KIT_TAG_NAME_BY_SOURCE[source] : undefined;
  if (tagName) {
    const tagId = await resolveTagId(tagName, apiKey);
    if (tagId) {
      const tag = await kitRequest(`/v4/tags/${tagId}/subscribers`, apiKey, {
        email_address: email,
      });
      if (!tag.ok) {
        console.error(`[newsletter] Failed to tag subscriber for source "${source}"`, tag.data);
      }
    }
  }

  return json(200, { ok: true });
}
