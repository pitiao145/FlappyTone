import { describe, expect, it } from "vitest";
import { queryMicPermission } from "./micPermission.ts";

const perms = (state: string) => ({ query: async () => ({ state }) });

describe("queryMicPermission", () => {
  it.each(["granted", "prompt", "denied"] as const)("passes %s through", async (state) => {
    expect(await queryMicPermission(perms(state))).toBe(state);
  });

  it("is unsupported when the API is missing", async () => {
    expect(await queryMicPermission(undefined)).toBe("unsupported");
    expect(await queryMicPermission({} as never)).toBe("unsupported");
  });

  it("is unsupported when query throws or rejects", async () => {
    const throws = {
      query: () => {
        throw new TypeError("microphone is not a valid PermissionName");
      },
    };
    const rejects = { query: () => Promise.reject(new TypeError("nope")) };
    expect(await queryMicPermission(throws)).toBe("unsupported");
    expect(await queryMicPermission(rejects)).toBe("unsupported");
  });

  it("is unsupported for an unknown state or a query that never settles", async () => {
    expect(await queryMicPermission(perms("weird"))).toBe("unsupported");
    const hangs = { query: () => new Promise<{ state: string }>(() => {}) };
    expect(await queryMicPermission(hangs, 10)).toBe("unsupported");
  });
});
