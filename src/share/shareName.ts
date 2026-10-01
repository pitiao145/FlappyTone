/**
 * The optional name a player puts on a share ("Pierre scored 1,425"), carried
 * in the share link as `?n=` and read back on the landing side. Typed by the
 * player, so it lives only in their own localStorage, the share card and the
 * link they choose to send — it never enters an analytics event
 * (src/analytics/session.ts promises nothing the player typed is sent).
 */

export const SHARE_NAME_MAX = 20;

const NAME_KEY = "toneflap.shareName.v1";

/** Trim, drop control characters, collapse whitespace, cap length. Empty → "". */
export function cleanShareName(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, SHARE_NAME_MAX)
      .trim()
  );
}

/** The `?n=<name>` of a share link, cleaned, or null when absent/empty. */
export function parseChallengeName(search: string): string | null {
  const raw = new URLSearchParams(search).get("n");
  if (raw === null) return null;
  const name = cleanShareName(raw);
  return name === "" ? null : name;
}

/** The last name this player shared under, so a second share is one tap. Never throws. */
export function loadShareName(): string {
  try {
    return cleanShareName(localStorage.getItem(NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveShareName(name: string): void {
  try {
    if (name === "") localStorage.removeItem(NAME_KEY);
    else localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private window / blocked storage — the name just isn't remembered */
  }
}
