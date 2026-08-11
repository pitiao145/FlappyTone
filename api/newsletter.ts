/**
 * Subscribes an email to the FlappyTone Kit (ConvertKit) form.
 *
 * Same shape as easy-card-balance-checker's `/api/newsletter/subscribe`: the
 * client never sees `KIT_API_KEY`, it only POSTs an email here. Two Kit calls —
 * upsert the subscriber, then attach them to the form — because Kit's v4 API
 * splits those.
 */
import { json } from "./_passcode.js";

const KIT_API_BASE = "https://api.kit.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = process.env.SITE_URL || "https://flappytone.pierrebuilds.dev";

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

  return json(200, { ok: true });
}
