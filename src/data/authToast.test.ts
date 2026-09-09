import { describe, expect, it } from "vitest";
import { AUTH_TOAST_TEXT, fireAuthToast, subscribeAuthToast, type AuthToastKind } from "./authToast.ts";

describe("authToast", () => {
  it("delivers the fired kind to a subscribed listener", () => {
    const received: AuthToastKind[] = [];
    const unsubscribe = subscribeAuthToast((kind) => received.push(kind));
    fireAuthToast("signed-in");
    fireAuthToast("signed-out");
    expect(received).toEqual(["signed-in", "signed-out"]);
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    const received: AuthToastKind[] = [];
    const unsubscribe = subscribeAuthToast((kind) => received.push(kind));
    unsubscribe();
    fireAuthToast("signed-in");
    expect(received).toEqual([]);
  });

  it("supports multiple independent listeners", () => {
    const a: AuthToastKind[] = [];
    const b: AuthToastKind[] = [];
    const unsubA = subscribeAuthToast((kind) => a.push(kind));
    const unsubB = subscribeAuthToast((kind) => b.push(kind));
    fireAuthToast("signed-out");
    expect(a).toEqual(["signed-out"]);
    expect(b).toEqual(["signed-out"]);
    unsubA();
    unsubB();
  });

  it("has plain, direct copy for both kinds", () => {
    expect(AUTH_TOAST_TEXT["signed-in"]).toBe("Signed in.");
    expect(AUTH_TOAST_TEXT["signed-out"]).toBe("Signed out.");
  });
});
