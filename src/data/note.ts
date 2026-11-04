/**
 * The note-from-Pierre card's server calls (`api/note.ts`, migration 0033),
 * and when the Play home may ask for it.
 *
 * The server decides who qualifies (free account, recent counted runs, never
 * sent, "Not now" at most once then 3 days). The client only decides *when to
 * ask*: on the Play home, after a finished run or TONEder round in this page
 * load, at most once per finish, and never again in this load once the card
 * was answered.
 *
 * Same contract as the rest of `src/data/`: never throws. A failure answers
 * "don't show" or `false`.
 */
import { getSupabase, warn } from "./supabase.ts";

export const NOTE_MAX_CHARS = 1000;

export type NoteContext = Record<string, string | number | boolean | null>;

/** Per page load: a finish arms the next Play-home check; an answer ends it. */
const state = { armed: false, answered: false };

/** A run or TONEder round finished: the next Play home may ask. */
export function armNote(): void {
  state.armed = true;
}

/** True once per arming, and never after the card was answered this load. */
export function takeNoteCheck(): boolean {
  if (!state.armed || state.answered) return false;
  state.armed = false;
  return true;
}

/** "Send" or "Not now" was tapped: no more checks this load. */
export function markNoteAnswered(): void {
  state.answered = true;
}

/** Tests only. */
export function resetNoteState(): void {
  state.armed = false;
  state.answered = false;
}

async function post(body: unknown): Promise<Response | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return await fetch("/api/note", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    warn("note", "request threw", err);
    return null;
  }
}

export async function checkNote(): Promise<boolean> {
  const res = await post({ action: "check" });
  if (!res?.ok) return false;
  try {
    return (await res.json())?.show === true;
  } catch {
    return false;
  }
}

export async function sendNote(message: string, wantsChat: boolean, context: NoteContext): Promise<boolean> {
  const text = message.trim().slice(0, NOTE_MAX_CHARS);
  if (!text) return false;
  const res = await post({ action: "send", message: text, wantsChat, context });
  if (res && !res.ok) warn("note", `send failed: ${res.status}`);
  return res?.ok === true;
}

export async function dismissNote(context: NoteContext): Promise<boolean> {
  const res = await post({ action: "dismiss", context });
  return res?.ok === true;
}

/** The signed-in account's email, for the "I'll email you" line. */
export async function accountEmail(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.email ?? null;
  } catch {
    return null;
  }
}
