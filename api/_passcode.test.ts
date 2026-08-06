import { afterEach, describe, expect, it } from "vitest";
import { PASSCODE_HEADER, checkPasscode } from "./_passcode.ts";

const req = (code?: string) =>
  new Request("https://example.test/api/upload", {
    method: "POST",
    headers: code === undefined ? {} : { [PASSCODE_HEADER]: code },
  });

afterEach(() => {
  delete process.env.RECORD_PASSCODE;
});

describe("checkPasscode", () => {
  it("lets the right code through", () => {
    process.env.RECORD_PASSCODE = "hunter2";
    expect(checkPasscode(req("hunter2"))).toBeNull();
  });

  it("rejects a wrong code", async () => {
    process.env.RECORD_PASSCODE = "hunter2";
    const res = checkPasscode(req("hunter3"));
    expect(res?.status).toBe(401);
  });

  it("rejects a missing header rather than defaulting to open", () => {
    process.env.RECORD_PASSCODE = "hunter2";
    expect(checkPasscode(req())?.status).toBe(401);
  });

  it("fails closed when the deploy has no passcode configured", () => {
    // The dangerous case: an unset env var must lock the door, not remove it.
    expect(checkPasscode(req("anything"))?.status).toBe(503);
    expect(checkPasscode(req(""))?.status).toBe(503);
  });

  it("does not accept a prefix of the code", () => {
    process.env.RECORD_PASSCODE = "hunter2";
    expect(checkPasscode(req("hunter"))?.status).toBe(401);
    expect(checkPasscode(req("hunter22"))?.status).toBe(401);
  });
});
