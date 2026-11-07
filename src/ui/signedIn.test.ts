import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSignedInSession } from "./signedIn.ts";

function stubStorage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  vi.stubGlobal("localStorage", {
    get length() {
      return keys.length;
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => entries[k] ?? null,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("hasSignedInSession", () => {
  it("is true for a permanent user's supabase-js session", () => {
    stubStorage({ "sb-abcd-auth-token": JSON.stringify({ user: { id: "u1", is_anonymous: false } }) });
    expect(hasSignedInSession()).toBe(true);
  });

  it("is false for an anonymous session, no session, or other keys", () => {
    stubStorage({ "sb-abcd-auth-token": JSON.stringify({ user: { id: "u1", is_anonymous: true } }) });
    expect(hasSignedInSession()).toBe(false);
    stubStorage({ "flappytone.settings": JSON.stringify({ user: { id: "x" } }) });
    expect(hasSignedInSession()).toBe(false);
    stubStorage({});
    expect(hasSignedInSession()).toBe(false);
  });

  it("never throws: bad JSON or no storage reads as signed out", () => {
    stubStorage({ "sb-abcd-auth-token": "{not json" });
    expect(hasSignedInSession()).toBe(false);
    vi.stubGlobal("localStorage", undefined);
    expect(hasSignedInSession()).toBe(false);
  });
});
