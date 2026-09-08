/**
 * Lemon Squeezy webhook — the only writer of `entitlements`.
 *
 * Same shape as api/score.ts: service-role key, never trusts the client for
 * the value that matters. Here that value is "who paid" — Lemon Squeezy signs
 * every delivery with HMAC-SHA256 (hex) of the RAW request body in the
 * `X-Signature` header (docs.lemonsqueezy.com/help/webhooks/signing-requests).
 * Verifying that signature, with a timing-safe comparison, BEFORE parsing or
 * trusting a single byte of the body is the single most important thing in
 * this file: an unverified webhook is a public "make me Pro" button, since
 * anyone could POST a fake order_created here otherwise.
 *
 * The buyer's identity comes only from `meta.custom_data.user_id` — the value
 * the checkout link passed through (see checkout `custom` field docs). NEVER
 * the order/subscription email: a buyer can type any email at checkout, and
 * granting access by matching it would let someone pay once and unlock a
 * different account by typing its owner's email.
 */
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual, createHmac } from "node:crypto";
import { json } from "./_passcode.js";

// Vercel functions written with this Web-Fetch `(request: Request)` shape
// (same as score.ts/run.ts) are never JSON-body-parsed for you — that
// auto-parsing only applies to the legacy `(req, res)` Node handler shape.
// `request.text()` below always gets the exact bytes Lemon Squeezy signed.

const GRANT_EVENTS = new Set(["order_created", "subscription_created"]);
const REVOKE_EVENTS = new Set([
  "order_refunded",
  "subscription_expired",
  "subscription_cancelled",
  "subscription_payment_refunded",
]);

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("[webhook-ls] Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and/or LEMONSQUEEZY_WEBHOOK_SECRET");
    return json(503, { error: "Payment webhook is temporarily unavailable." });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  // Signature verification comes first, before parsing or trusting anything
  // in the body. Do not move this below the JSON.parse below.
  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.error("[webhook-ls] Invalid signature");
    return json(401, { error: "Invalid signature." });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const meta = (payload as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
  const eventName = typeof meta?.event_name === "string" ? meta.event_name : undefined;
  if (!eventName) {
    return json(400, { error: "Missing meta.event_name." });
  }

  if (!GRANT_EVENTS.has(eventName) && !REVOKE_EVENTS.has(eventName)) {
    // Unknown/unhandled event type: acknowledge with 200 so Lemon Squeezy
    // does not retry forever, but log it so a new event type doesn't go
    // unnoticed.
    console.log(`[webhook-ls] Ignoring unhandled event type "${eventName}"`);
    return json(200, { ok: true, ignored: eventName });
  }

  const customData = meta?.custom_data as Record<string, unknown> | undefined;
  const userId = typeof customData?.user_id === "string" ? customData.user_id : undefined;
  if (!userId) {
    // Never fall back to an email in the payload for identity — see file
    // header. A missing user_id means the checkout link's custom data is
    // misconfigured, and if this was a real order, money has already
    // changed hands without anyone being entitled. Log loudly.
    console.error(`[webhook-ls] "${eventName}" arrived with no meta.custom_data.user_id — checkout link is misconfigured`, {
      eventName,
    });
    return json(400, { error: "Missing meta.custom_data.user_id." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const hasAccess = GRANT_EVENTS.has(eventName);

  // Idempotent by construction: this writes the absolute state
  // (has_access = true/false), never toggles or increments, so a replayed
  // or out-of-order delivery of the same event is harmless.
  const { error } = await supabase.from("entitlements").upsert(
    {
      user_id: userId,
      has_access: hasAccess,
      source: "lemonsqueezy",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[webhook-ls] Failed to upsert entitlement", error);
    return json(502, { error: "Could not record entitlement. Please retry." });
  }

  return json(200, { ok: true, eventName, userId, hasAccess });
}
