import { describe, expect, it } from "vitest";
import { PASSCODE_HEADER, resolveSpeaker } from "../src/passcode.ts";
import type { Env } from "../src/index.ts";

const req = (code?: string) =>
  new Request("https://clips.flappytone.com/booth/words", {
    method: "GET",
    headers: code === undefined ? {} : { [PASSCODE_HEADER]: code },
  });

const twoCodes = { RECORD_PASSCODES: '{"aaa":"jane","bbb":"mark"}' } as Env;

describe("resolveSpeaker", () => {
  it("resolves each code to its own speaker", () => {
    expect(resolveSpeaker(req("aaa"), twoCodes)).toEqual({ speaker: "jane" });
    expect(resolveSpeaker(req("bbb"), twoCodes)).toEqual({ speaker: "mark" });
  });

  it("401s an unknown code", () => {
    expect((resolveSpeaker(req("ccc"), twoCodes) as Response).status).toBe(401);
  });

  it("401s a missing header rather than defaulting to open", () => {
    expect((resolveSpeaker(req(), twoCodes) as Response).status).toBe(401);
  });

  it("does not accept a prefix of a code (length-safe compare)", () => {
    expect((resolveSpeaker(req("aa"), twoCodes) as Response).status).toBe(401);
    expect((resolveSpeaker(req("aaaa"), twoCodes) as Response).status).toBe(401);
  });

  it("503s on an unset or unparseable secret, never falls open", () => {
    expect((resolveSpeaker(req("aaa"), {} as Env) as Response).status).toBe(503);
    expect((resolveSpeaker(req("aaa"), { RECORD_PASSCODES: "{" } as Env) as Response).status).toBe(503);
    expect((resolveSpeaker(req("aaa"), { RECORD_PASSCODES: "" } as Env) as Response).status).toBe(503);
    expect((resolveSpeaker(req("aaa"), { RECORD_PASSCODES: "[]" } as Env) as Response).status).toBe(503);
  });

  it("rejects a speaker slug the DB could not hold", () => {
    const env = { RECORD_PASSCODES: '{"aaa":"NOT A SLUG"}' } as Env;
    expect((resolveSpeaker(req("aaa"), env) as Response).status).toBe(503);
    const nonString = { RECORD_PASSCODES: '{"aaa":7}' } as Env;
    expect((resolveSpeaker(req("aaa"), nonString) as Response).status).toBe(503);
  });

  it("checks every entry rather than returning on the first match", () => {
    // No early exit: response time must reveal neither how many codes exist
    // nor which prefix matched. Pinned structurally — the source contains no
    // `return`/`break` inside the comparison loop.
    const src = resolveSpeaker.toString();
    const start = src.indexOf("for (");
    const end = src.indexOf("if (found === null)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toMatch(/\b(return|break|continue)\b/);
  });
});
