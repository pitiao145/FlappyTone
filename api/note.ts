/**
 * Sole writer of `feedback_notes` (migration 0033): the "note from Pierre"
 * card shown to engaged free players.
 *
 * Same shape as `api/shapes.ts` — service-role key, JWT-verified `user_id`,
 * no client write policy on the table. The client may not decide: who the
 * player is, whether they qualify (`note_eligible()`, from `counted_runs` and
 * `entitlements`), or which email is stored (the session's, and only when the
 * player ticked "happy to chat").
 *
 * Body `{action: "check"}` answers `{show}`. `{action: "send", message,
 * wantsChat, context}` and `{action: "dismiss", context}` write one row, and
 * only while the player still qualifies, so a stale tab cannot add rows.
 */
import { createClient } from "@supabase/supabase-js";
import { json } from "./_json.js";

/** Play days and counted runs in the last 14 days. Pierre, 2026-11-04. */
export const NOTE_MIN_DAYS = 2;
export const NOTE_MIN_RUNS = 10;
export const NOTE_MAX_CHARS = 1000;
const MAX_CONTEXT_KEYS = 10;
const MAX_CONTEXT_STRING = 80;
const KEY_RE = /^[a-zA-Z_]{1,30}$/;

export type NoteAction =
  | { action: "check" }
  | { action: "send"; message: string; wantsChat: boolean; context: Record<string, unknown> }
  | { action: "dismiss"; context: Record<string, unknown> };

/** Flat, small, scalar-only: what `app_context` may hold. Null when it is not. */
export function parseContext(raw: unknown): Record<string, string | number | boolean | null> | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_CONTEXT_KEYS) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of entries) {
    if (!KEY_RE.test(k)) return null;
    if (typeof v === "string") {
      if (v.length > MAX_CONTEXT_STRING) return null;
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) return null;
    } else if (typeof v !== "boolean" && v !== null) {
      return null;
    }
    out[k] = v as string | number | boolean | null;
  }
  return out;
}

/** The validated action, or null when any part of the body is wrong. */
export function parseNoteBody(raw: unknown): NoteAction | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.action === "check") return { action: "check" };
  const context = parseContext(b.context);
  if (!context) return null;
  if (b.action === "dismiss") return { action: "dismiss", context };
  if (b.action !== "send") return null;
  if (typeof b.message !== "string") return null;
  const message = b.message.trim();
  if (!message || message.length > NOTE_MAX_CHARS) return null;
  if (typeof b.wantsChat !== "boolean") return null;
  return { action: "send", message, wantsChat: b.wantsChat, context };
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[note] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars");
    return json(503, { error: "Notes are temporarily unavailable." });
  }

  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return json(401, { error: "Missing or malformed Authorization header." });
  const token = match[1];

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }
  const parsed = parseNoteBody(body);
  if (!parsed) return json(400, { error: "Invalid note." });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "Invalid or expired session." });
  if (user.is_anonymous) return json(403, { error: "Notes need an account." });

  const { data: eligible, error: eligibleError } = await supabase.rpc("note_eligible", {
    p_user: user.id,
    p_min_days: NOTE_MIN_DAYS,
    p_min_runs: NOTE_MIN_RUNS,
  });
  if (eligibleError) {
    console.error("[note] note_eligible failed", eligibleError);
    return json(502, { error: "Could not check notes." });
  }
  if (parsed.action === "check") return json(200, { show: eligible === true });
  if (eligible !== true) return json(409, { error: "This note is no longer open." });

  const row: Record<string, unknown> =
    parsed.action === "send"
      ? {
          user_id: user.id,
          message: parsed.message,
          wants_chat: parsed.wantsChat,
          contact_email: parsed.wantsChat ? (user.email ?? null) : null,
          app_context: parsed.context,
        }
      : {
          user_id: user.id,
          dismissed_at: new Date().toISOString(),
          app_context: parsed.context,
        };
  const { error } = await supabase.from("feedback_notes").insert(row);
  if (error) {
    console.error("[note] insert failed", error);
    return json(502, { error: "Could not save the note." });
  }
  return json(200, { ok: true });
}
