import { describe, expect, it } from "vitest";
import {
  authSource,
  canPlay,
  challengeLine,
  authMode,
  codeFailReason,
  consumeAuthPending,
  friendlyAuthError,
  keptParams,
  markAuthPending,
  oauthErrorFromUrl,
  parkReturn,
  restoreReturn,
} from "./authGate.ts";
import { parseChallengeScore } from "./GameApp.tsx";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("canPlay (the /app gate)", () => {
  it("signed out sees the auth screen", () => {
    expect(canPlay("signed-out")).toBe(false);
  });
  it("an anonymous session counts as signed out", () => {
    expect(canPlay("anonymous")).toBe(false);
  });
  it("a permanent account gets the game", () => {
    expect(canPlay("permanent")).toBe(true);
  });
});

describe("authSource", () => {
  const origin = "https://flappytone.com";
  it("a challenge link wins", () => {
    expect(authSource("?c=120&src=/x", `${origin}/`, origin)).toBe("challenge");
  });
  it("site CTA params and same-origin referrers are lp_cta", () => {
    expect(authSource("?intent=pricing", "", origin)).toBe("lp_cta");
    expect(authSource("?src=/chinese-tones", "", origin)).toBe("lp_cta");
    expect(authSource("", `${origin}/`, origin)).toBe("lp_cta");
  });
  it("anything else is direct", () => {
    expect(authSource("", "", origin)).toBe("direct");
    expect(authSource("", "https://google.com/", origin)).toBe("direct");
    expect(authSource("", "not a url", origin)).toBe("direct");
  });
});

describe("challenge params survive signup", () => {
  it("a password signup keeps the live URL, so GameApp reads the challenge on mount", () => {
    const s = memStorage();
    expect(restoreReturn("?c=420&n=Mei", s)).toBe("?c=420&n=Mei");
    expect(parseChallengeScore(restoreReturn("?c=420&n=Mei", s))).toBe(420);
  });

  it("a magic link returns to bare /app and gets the parked challenge back", () => {
    const s = memStorage();
    parkReturn("?c=420&n=Mei&junk=1", s, 1000);
    const search = restoreReturn("", s, 2000);
    expect(parseChallengeScore(search)).toBe(420);
    expect(new URLSearchParams(search).get("n")).toBe("Mei");
    expect(new URLSearchParams(search).has("junk")).toBe(false);
  });

  it("the parked set is used once and expires after an hour", () => {
    const s = memStorage();
    parkReturn("?c=420", s, 0);
    expect(restoreReturn("", s, 61 * 60 * 1000)).toBe("");
    parkReturn("?c=420", s, 0);
    restoreReturn("", s, 10);
    expect(restoreReturn("", s, 20)).toBe("");
  });

  it("keeps only the params GameApp reads", () => {
    expect(keptParams("?c=1&n=A&intent=pricing&x=2")).toBe("c=1&n=A&intent=pricing");
  });
});

describe("pending sign-in (magic link, Google)", () => {
  it("remembers how it started, once", () => {
    const s = memStorage();
    markAuthPending({ method: "google", consent: true, wasAnonymous: false }, s, 0);
    expect(consumeAuthPending(s, 5)).toEqual({ method: "google", consent: true, wasAnonymous: false, at: 0 });
    expect(consumeAuthPending(s, 6)).toBe(null);
  });

  it("drops a marker older than an hour", () => {
    const s = memStorage();
    markAuthPending({ method: "magic_link", consent: false, wasAnonymous: false }, s, 0);
    expect(consumeAuthPending(s, 60 * 60 * 1000)).toBe(null);
  });

  it("still counts a magic link sent before brief 30", () => {
    const s = memStorage();
    s.setItem("toneflap.magicPending.v1", JSON.stringify({ card: "login", at: 0 }));
    expect(consumeAuthPending(s, 5)?.method).toBe("magic_link");
  });
});

describe("authMode (new account vs login)", () => {
  const sent = Date.parse("2026-11-07T10:00:00Z");
  it("a guest upgrade is always a new account", () => {
    expect(authMode("2026-01-01T00:00:00Z", sent, true)).toBe("signup");
  });
  it("a row created after the code was sent is new", () => {
    expect(authMode("2026-11-07T10:00:01Z", sent, false)).toBe("signup");
  });
  it("an older row is a login", () => {
    expect(authMode("2026-10-01T00:00:00Z", sent, false)).toBe("login");
    expect(authMode(null, sent, false)).toBe("login");
  });
});

describe("codeFailReason", () => {
  it("splits Supabase's one otp_expired code by the code's age", () => {
    expect(codeFailReason("otp_expired", "Token has expired or is invalid", 0, 60_000)).toBe("invalid");
    expect(codeFailReason("otp_expired", "Token has expired or is invalid", 0, 2 * 60 * 60 * 1000)).toBe("expired");
  });
  it("names rate limits and network failures", () => {
    expect(codeFailReason("over_email_send_rate_limit", "x", 0, 1)).toBe("rate_limited");
    expect(codeFailReason(undefined, "network error", 0, 1)).toBe("network");
  });
});

describe("oauthErrorFromUrl", () => {
  it("reads the error Supabase puts in the hash or the query", () => {
    expect(oauthErrorFromUrl("", "#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked")).toEqual({
      code: "identity_already_exists",
      description: "Identity is already linked",
    });
    expect(oauthErrorFromUrl("?error=access_denied", "")).toEqual({ code: "access_denied", description: "" });
    expect(oauthErrorFromUrl("?c=300", "")).toBe(null);
  });
});

describe("copy", () => {
  it("names the challenger, or says Someone", () => {
    expect(challengeLine(300, "Mei")).toBe("Mei scored 300. Sign up free to beat it.");
    expect(challengeLine(300, null)).toBe("Someone scored 300. Sign up free to beat it.");
  });
  it("offers login for an existing email", () => {
    expect(friendlyAuthError("User already registered").existing).toBe(true);
    expect(friendlyAuthError("Invalid login credentials").existing).toBe(false);
  });
});
