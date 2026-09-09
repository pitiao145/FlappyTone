import { describe, expect, it } from "vitest";
import { bumpSessionVersion, getSessionVersion, subscribeSessionVersion } from "./sessionVersion.ts";

describe("sessionVersion", () => {
  it("increments on every bump", () => {
    const start = getSessionVersion();
    bumpSessionVersion();
    expect(getSessionVersion()).toBe(start + 1);
    bumpSessionVersion();
    expect(getSessionVersion()).toBe(start + 2);
  });

  it("notifies subscribed listeners on bump", () => {
    let calls = 0;
    const unsubscribe = subscribeSessionVersion(() => {
      calls++;
    });
    bumpSessionVersion();
    bumpSessionVersion();
    expect(calls).toBe(2);
    unsubscribe();
    bumpSessionVersion();
    expect(calls).toBe(2);
  });

  it("supports multiple independent listeners", () => {
    let a = 0;
    let b = 0;
    const unsubA = subscribeSessionVersion(() => a++);
    const unsubB = subscribeSessionVersion(() => b++);
    bumpSessionVersion();
    expect(a).toBe(1);
    expect(b).toBe(1);
    unsubA();
    bumpSessionVersion();
    expect(a).toBe(1);
    expect(b).toBe(2);
    unsubB();
  });
});
