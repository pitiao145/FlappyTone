/**
 * `resolveTier` is the one place tier logic can go wrong silently — a bad
 * truth table here means the wrong player sees the wrong limits. It's pure,
 * so it's tested directly, same reasoning as `mergeAggregates` in
 * `account.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import * as account from "./account.ts";
import * as entitlements from "./entitlements.ts";
import { getTier, refreshTier, resolveTier } from "./tier.ts";

describe("resolveTier", () => {
  it("hasAccess wins outright, regardless of status", () => {
    expect(resolveTier("signed-out", true)).toBe("pro");
    expect(resolveTier("anonymous", true)).toBe("pro");
    expect(resolveTier("permanent", true)).toBe("pro");
  });

  it("permanent without access is free", () => {
    expect(resolveTier("permanent", false)).toBe("free");
  });

  it("signed-out or anonymous without access is guest", () => {
    expect(resolveTier("signed-out", false)).toBe("guest");
    expect(resolveTier("anonymous", false)).toBe("guest");
  });
});

describe("refreshTier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("settles to guest when getAccount rejects", async () => {
    vi.spyOn(account, "getAccount").mockRejectedValue(new Error("network"));
    vi.spyOn(entitlements, "fetchHasAccess").mockResolvedValue(false);
    await refreshTier();
    expect(getTier()).toBe("guest");
  });

  it("settles to guest when fetchHasAccess rejects", async () => {
    vi.spyOn(account, "getAccount").mockResolvedValue({
      status: "permanent",
      userId: "u1",
      email: "a@b.com",
    });
    vi.spyOn(entitlements, "fetchHasAccess").mockRejectedValue(new Error("network"));
    await refreshTier();
    expect(getTier()).toBe("guest");
  });

  it("resolves normally when both succeed", async () => {
    vi.spyOn(account, "getAccount").mockResolvedValue({
      status: "permanent",
      userId: "u1",
      email: "a@b.com",
    });
    vi.spyOn(entitlements, "fetchHasAccess").mockResolvedValue(false);
    await refreshTier();
    expect(getTier()).toBe("free");
  });
});
