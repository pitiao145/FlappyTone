/**
 * The /app login gate's pure parts (brief 24): who gets the game, which card
 * a visitor sees first, and how a challenge link survives the trip through
 * signup. No React and no Supabase here, so it tests without a DOM.
 *
 * Playing needs a permanent account. An anonymous Supabase session (a guest
 * who once joined the board) counts as signed out: it sees the auth screen,
 * and its local progress is adopted on signup (`adoptGuestProgress`, run by
 * `syncAccount`).
 */
import type { AccountStatus } from "../data/account.ts";

export type AuthCard = "signup" | "login";
export type AuthSource = "challenge" | "direct" | "lp_cta";

/** Only a permanent account plays. */
export function canPlay(status: AccountStatus): boolean {
  return status === "permanent";
}

/**
 * Where the visitor came from, for `auth_screen_viewed`. A challenge link
 * wins; `?src=` / `?intent=` are only ever set by site CTAs (see appLink.ts),
 * and a same-origin referrer is the landing page's own links.
 */
export function authSource(search: string, referrer: string, origin: string): AuthSource {
  const params = new URLSearchParams(search);
  if (params.has("c")) return "challenge";
  if (params.has("src") || params.has("intent")) return "lp_cta";
  try {
    if (referrer && new URL(referrer).origin === origin) return "lp_cta";
  } catch {
    /* a malformed referrer is just "direct" */
  }
  return "direct";
}

/**
 * The query params GameApp reads once on mount: the challenge (`c`, `n`), the
 * arrival intent and the attribution (`src`, `ref`, `word`, `weak`). A
 * password signup keeps them in the URL, since GameApp mounts in the same
 * page. A magic link comes back to bare `/app` (the redirect in account.ts),
 * so they are parked in storage and put back before GameApp mounts.
 */
const KEPT_PARAMS = ["c", "n", "intent", "src", "ref", "word", "weak"] as const;
const PARKED_KEY = "toneflap.authReturn.v1";
const PARKED_TTL_MS = 60 * 60 * 1000;

export function keptParams(search: string): string {
  const from = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of KEPT_PARAMS) {
    const v = from.get(k);
    if (v !== null) out.set(k, v);
  }
  return out.toString();
}

/** Parks the arrival params before a magic link is sent. */
export function parkReturn(search: string, storage: Storage | undefined, now = Date.now()): void {
  const kept = keptParams(search);
  try {
    if (kept) storage?.setItem(PARKED_KEY, JSON.stringify({ q: kept, at: now }));
    else storage?.removeItem(PARKED_KEY);
  } catch {
    /* blocked storage: the player lands on plain Play, nothing breaks */
  }
}

/**
 * The search string GameApp should mount with. The live URL wins when it
 * already carries params (a password signup, or a fresh link); otherwise a
 * parked, unexpired set is restored. The parked set is consumed either way.
 */
export function restoreReturn(search: string, storage: Storage | undefined, now = Date.now()): string {
  let parked: string | null = null;
  try {
    const raw = storage?.getItem(PARKED_KEY);
    storage?.removeItem(PARKED_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { q?: unknown; at?: unknown };
      if (typeof p.q === "string" && typeof p.at === "number" && now - p.at < PARKED_TTL_MS) parked = p.q;
    }
  } catch {
    /* unreadable: ignore */
  }
  if (keptParams(search)) return search;
  return parked ? `?${parked}` : search;
}

/**
 * True while AuthScreen's own password submit runs. That submit reloads the
 * page itself once it finishes (sync, consent, checkout), so AuthGate must
 * not. Any other sign-in seen on the auth screen (a magic link opened in
 * another tab, a session restored by the SDK) makes AuthGate reload.
 */
let ownSubmit = false;
export function setOwnSubmit(on: boolean): void {
  ownSubmit = on;
}
export function ownSubmitPending(): boolean {
  return ownSubmit;
}

/**
 * A sign-in that finishes on a later page load: the magic link in the code
 * email, or the Google round trip. Remembers how it started, so the load
 * that sees the new session can send `signup_completed` with the right
 * method and new-vs-login mode, and record the consent ticked before it.
 */
export type PendingMethod = "magic_link" | "google";
export interface PendingAuth {
  method: PendingMethod;
  /** Marketing consent ticked on the auth screen. */
  consent: boolean;
  /** The session was an anonymous guest: any success upgrades it, a new account. */
  wasAnonymous: boolean;
  /** When the email or redirect was sent (ms). */
  at: number;
}

const PENDING_KEY = "toneflap.authPending.v1";
/** Before brief 30: `{ card, at }`, read once so an in-flight link still counts. */
const LEGACY_MAGIC_KEY = "toneflap.magicPending.v1";

export function markAuthPending(p: Omit<PendingAuth, "at">, storage: Storage | undefined, now = Date.now()): void {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify({ ...p, at: now }));
  } catch {
    /* blocked storage: the completion event is just not sent */
  }
}

/** The still-fresh pending sign-in, consumed on read. */
export function consumeAuthPending(storage: Storage | undefined, now = Date.now()): PendingAuth | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    const legacy = storage?.getItem(LEGACY_MAGIC_KEY);
    storage?.removeItem(PENDING_KEY);
    storage?.removeItem(LEGACY_MAGIC_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PendingAuth>;
      if (
        (p.method === "magic_link" || p.method === "google") &&
        typeof p.at === "number" &&
        now - p.at < PARKED_TTL_MS
      ) {
        return { method: p.method, consent: p.consent === true, wasAnonymous: p.wasAnonymous === true, at: p.at };
      }
    }
    if (legacy) {
      const p = JSON.parse(legacy) as { card?: unknown; at?: unknown };
      if (typeof p.at === "number" && now - p.at < PARKED_TTL_MS) {
        return { method: "magic_link", consent: false, wasAnonymous: false, at: p.at };
      }
    }
  } catch {
    /* unreadable: ignore */
  }
  return null;
}

/**
 * New account or login, for `signup_completed.mode`. An anonymous guest that
 * finishes any sign-in became a permanent account: "signup". Otherwise the
 * auth row is new when it was created after the code/redirect was sent
 * (`signInWithOtp` creates it at send time, Google at the callback); a few
 * seconds of slack covers clock skew. The analytics report still counts new
 * accounts from Supabase `created_at` (`new_account`).
 */
export function authMode(
  createdAt: string | null,
  sentAt: number,
  wasAnonymous: boolean,
): AuthCard {
  if (wasAnonymous) return "signup";
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && t >= sentAt - 10_000 ? "signup" : "login";
}

/** `auth_code_failed.reason`. */
export type CodeFailReason = "expired" | "invalid" | "rate_limited" | "network";

/**
 * Supabase answers a wrong and an expired code with the same `otp_expired`
 * code, so the age of the code decides: older than the hour a code lives is
 * "expired", anything younger is "invalid".
 */
export function codeFailReason(code: string | undefined, reason: string, sentAt: number, now = Date.now()): CodeFailReason {
  const r = reason.toLowerCase();
  if (code?.startsWith("over_") || r.includes("rate limit") || r.includes("too many")) return "rate_limited";
  if (r.includes("network") || r.includes("fetch") || r.includes("no supabase client")) return "network";
  if (now - sentAt >= 60 * 60 * 1000) return "expired";
  return "invalid";
}

/**
 * An OAuth error sent back to `/app` in the URL (`#error_code=…` or
 * `?error_code=…`), e.g. `identity_already_exists` when Google already
 * belongs to another account. Null when there is none.
 */
export function oauthErrorFromUrl(search: string, hash: string): { code: string; description: string } | null {
  for (const part of [hash.replace(/^#/, ""), search.replace(/^\?/, "")]) {
    const p = new URLSearchParams(part);
    const code = p.get("error_code") ?? p.get("error");
    if (code) return { code, description: p.get("error_description") ?? "" };
  }
  return null;
}

/** The challenge headline line: "{name} scored {score}. Sign up free to beat it." */
export function challengeLine(score: number, name: string | null): string {
  return `${name ?? "Someone"} scored ${score}. Sign up free to beat it.`;
}

/**
 * Supabase's error text, turned into what a player can act on. `existing`
 * means "this email already has an account", so the card offers login.
 */
export function friendlyAuthError(reason: string, code?: string): { text: string; existing: boolean } {
  const r = reason.toLowerCase();
  if (code === "identity_already_exists" || r.includes("identity is already linked")) {
    return { text: "This Google account already has a FlappyTone account.", existing: true };
  }
  if (code === "otp_expired" || r.includes("token has expired or is invalid")) {
    return { text: "That code didn't work. Check it, or send a new code.", existing: false };
  }
  if (code === "code_too_short") return { text: "Enter the 6-digit code from the email.", existing: false };
  if (code === "email_exists") return { text: "This email already has an account.", existing: true };
  if (r.includes("already registered") || r.includes("already been registered") || r.includes("already exists")) {
    return { text: "This email already has an account.", existing: true };
  }
  if (r.includes("invalid login credentials")) {
    return { text: "That email and password don't match. Try again, or reset your password.", existing: false };
  }
  if (r.includes("network") || r.includes("fetch") || r.includes("no supabase client")) {
    return { text: "We couldn't reach the server. Check your connection and try again.", existing: false };
  }
  if (code?.startsWith("over_") || r.includes("rate limit") || r.includes("too many")) {
    return { text: "Too many tries. Wait a minute, then try again.", existing: false };
  }
  return { text: reason.charAt(0).toUpperCase() + reason.slice(1), existing: false };
}

/**
 * The tone test's weak pair (`?weak=2-3`, set by its round-result link, brief
 * 25) as the signup subtitle: "Your weak spot is 2nd vs 3rd. Sign up free to
 * train it." Null for anything else.
 */
export function weakPairLine(search: string): string | null {
  const ORD = ["", "1st", "2nd", "3rd", "4th"];
  const m = new URLSearchParams(search).get("weak")?.match(/^([1-4])-([1-4])$/);
  if (!m || m[1] >= m[2]) return null;
  return `Your weak spot is ${ORD[+m[1]]} vs ${ORD[+m[2]]}. Sign up free to train it.`;
}
