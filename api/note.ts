/**
 * Sole writer of the "note from Pierre" card (migration 0033): a sent note is
 * a `feedback` row with `source = 'note'`; a "Not now" adds to the player's
 * `profiles.note_dismissals` (`note_dismiss()`).
 *
 * Same shape as `api/shapes.ts` — service-role key, JWT-verified `user_id`.
 * The browser may insert widget feedback, but not the note columns (0033's
 * column grant). The client may not decide: who the
 * player is, whether they qualify (`note_eligible()`, from `counted_runs` and
 * `entitlements`), or which email is stored (the session's, and only when the
 * player ticked "happy to chat").
 *
 * Body `{action: "check"}` answers `{show}`. `{action: "send", message,
 * wantsChat, context}` and `{action: "dismiss"}` write, and only while the
 * player still qualifies, so a stale tab cannot add rows.
 *
 * Targeted notes (migration 0035, brief 36): Pierre writes a note for chosen
 * accounts (`pierre_notes`, `pierre_note_targets`, by hand in SQL). `check`
 * first claims one (`note_claim_targeted()`, once in total across its
 * accounts) and answers `{show: true, note: {peek, body, question}}`.
 * `send`/`dismiss` carry `kind` ("targeted" | "generic", default generic):
 * which card the player answered. Targeted → only `note_answer_targeted()`
 * (the note this account was shown; the client never sends a note id).
 * Generic → only the 0033 path. The two never fall into each other, so a
 * stale targeted card cannot be saved as a generic reply. They are separate
 * notes: a targeted note does not change whether the generic one shows.
 * The note text is plain text; the client renders it as text, never as HTML.
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

export type TargetedNote = { peek: string; body: string; question: string };

export type NoteKind = "targeted" | "generic";

export type NoteAction =
  | { action: "check" }
  | { action: "send"; kind: NoteKind; message: string; wantsChat: boolean; context: Record<string, unknown> }
  | { action: "dismiss"; kind: NoteKind; context: Record<string, unknown> };

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
  // Missing = generic: what every client sent before 0035.
  const kind = b.kind === undefined ? "generic" : b.kind;
  if (kind !== "targeted" && kind !== "generic") return null;
  if (b.action === "dismiss") return { action: "dismiss", kind, context };
  if (b.action !== "send") return null;
  if (typeof b.message !== "string") return null;
  const message = b.message.trim();
  if (!message || message.length > NOTE_MAX_CHARS) return null;
  if (typeof b.wantsChat !== "boolean") return null;
  return { action: "send", kind, message, wantsChat: b.wantsChat, context };
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

  if (parsed.action === "check") {
    const { data: claimed, error: claimError } = await supabase.rpc("note_claim_targeted", { p_user: user.id });
    if (claimError) {
      console.error("[note] note_claim_targeted failed", claimError);
      return json(502, { error: "Could not check notes." });
    }
    const row = Array.isArray(claimed) ? claimed[0] : null;
    if (row) {
      const note: TargetedNote = { peek: row.peek, body: row.body, question: row.question };
      return json(200, { show: true, note });
    }
  } else if (parsed.kind === "targeted") {
    const sending = parsed.action === "send";
    const reply = parsed.action === "send" ? parsed : null;
    const { data: answered, error: answerError } = await supabase.rpc("note_answer_targeted", {
      p_user: user.id,
      p_message: reply ? reply.message : null,
      p_wants_chat: reply ? reply.wantsChat : false,
      p_contact_email: reply?.wantsChat ? (user.email ?? null) : null,
      p_user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      p_context: parsed.context,
    });
    if (answerError) {
      console.error("[note] note_answer_targeted failed", answerError);
      return json(502, { error: sending ? "Could not save the note." : "Could not save that." });
    }
    return answered === true ? json(200, { ok: true }) : json(409, { error: "This note is no longer open." });
  }

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

  if (parsed.action === "dismiss") {
    const { error } = await supabase.rpc("note_dismiss", { p_user: user.id });
    if (error) {
      console.error("[note] note_dismiss failed", error);
      return json(502, { error: "Could not save that." });
    }
    return json(200, { ok: true });
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    source: "note",
    message: parsed.message,
    wants_chat: parsed.wantsChat,
    contact_email: parsed.wantsChat ? (user.email ?? null) : null,
    // note_eligible() only passes free accounts on the Play home.
    screen: "play",
    tier: "free",
    user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    app_context: parsed.context,
  });
  if (error) {
    console.error("[note] insert failed", error);
    return json(502, { error: "Could not save the note." });
  }
  return json(200, { ok: true });
}
