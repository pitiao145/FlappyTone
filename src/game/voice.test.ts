import { describe, it, expect } from "vitest";
import { resolveSpeaker, guessGender, type Speaker } from "./voice.ts";

const jane: Speaker = { id: "jane", name: "Jane", gender: "female", accent: "tw", isDefault: true, active: true };
const mark: Speaker = { id: "mark", name: "Mark", gender: "male", accent: "tw", isDefault: false, active: true };

describe("resolveSpeaker", () => {
  it("matches a stored preference on its axis", () => {
    expect(resolveSpeaker([jane, mark], { gender: "male" })?.id).toBe("mark");
  });

  it("falls back to the default when nobody active matches", () => {
    expect(resolveSpeaker([jane], { gender: "male" })?.id).toBe("jane");
  });

  it("falls back to the default when a speaker has been deactivated", () => {
    expect(resolveSpeaker([jane, { ...mark, active: false }], { gender: "male" })?.id).toBe("jane");
  });

  it("falls back to the default when the axis is ambiguous", () => {
    // Two active male speakers: a preference of {gender:'male'} does not name
    // one of them, and picking arbitrarily would make the voice a player hears
    // depend on row order.
    const second = { ...mark, id: "liang", name: "Liang" };
    expect(resolveSpeaker([jane, mark, second], { gender: "male" })?.id).toBe("jane");
  });

  it("uses the default when there is no preference", () => {
    expect(resolveSpeaker([jane, mark], null)?.id).toBe("jane");
  });

  it("never returns an inactive speaker, even the default", () => {
    expect(resolveSpeaker([{ ...jane, active: false }], null)).toBeNull();
  });

  it("returns null for an empty roster rather than throwing", () => {
    expect(resolveSpeaker([], { gender: "male" })).toBeNull();
  });
});

describe("guessGender", () => {
  it("reads a typical female centre as female", () => {
    expect(guessGender(200)).toBe("female");
  });

  it("reads a typical male centre as male", () => {
    expect(guessGender(115)).toBe("male");
  });

  it("splits at the tunable threshold", () => {
    expect(guessGender(159)).toBe("male");
    expect(guessGender(161)).toBe("female");
  });
});
