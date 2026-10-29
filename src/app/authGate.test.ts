import { describe, expect, it } from "vitest";
import {
  authSource,
  canPlay,
  challengeLine,
  consumeMagicLink,
  friendlyAuthError,
  keptParams,
  markMagicLinkSent,
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

describe("magic link completion", () => {
  it("remembers which card sent it, once", () => {
    const s = memStorage();
    markMagicLinkSent("login", s, 0);
    expect(consumeMagicLink(s, 5)).toBe("login");
    expect(consumeMagicLink(s, 6)).toBe(null);
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
