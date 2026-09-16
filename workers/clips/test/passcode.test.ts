import { describe, expect, it } from "vitest";
import { PASSCODE_HEADER, checkPasscode } from "../src/passcode.ts";

const req = (code?: string) =>
  new Request("https://clips.flappytone.com/booth/words", {
    method: "GET",
    headers: code === undefined ? {} : { [PASSCODE_HEADER]: code },
  });

describe("checkPasscode", () => {
  it("lets the right code through", () => {
    expect(checkPasscode(req("hunter2"), "hunter2")).toBeNull();
  });

  it("rejects a wrong code", () => {
    const res = checkPasscode(req("hunter3"), "hunter2");
    expect(res?.status).toBe(401);
  });

  it("rejects a missing header rather than defaulting to open", () => {
    expect(checkPasscode(req(), "hunter2")?.status).toBe(401);
  });

  it("fails closed when the deploy has no passcode configured", () => {
    expect(checkPasscode(req("anything"), undefined)?.status).toBe(503);
    expect(checkPasscode(req(""), undefined)?.status).toBe(503);
    expect(checkPasscode(req("anything"), "")?.status).toBe(503);
  });

  it("does not accept a prefix of the code (length-safe compare)", () => {
    expect(checkPasscode(req("hunter"), "hunter2")?.status).toBe(401);
    expect(checkPasscode(req("hunter22"), "hunter2")?.status).toBe(401);
  });
});
