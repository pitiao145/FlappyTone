import { beforeEach, describe, expect, it } from "vitest";
import { armNote, markNoteAnswered, resetNoteState, takeNoteCheck } from "./note.ts";

describe("note show-once logic", () => {
  beforeEach(() => resetNoteState());

  it("never asks before a run or round finished", () => {
    expect(takeNoteCheck()).toBe(false);
  });

  it("asks once per finish", () => {
    armNote();
    expect(takeNoteCheck()).toBe(true);
    expect(takeNoteCheck()).toBe(false);
  });

  it("asks again after the next finish when the card was only seen", () => {
    armNote();
    takeNoteCheck();
    armNote();
    expect(takeNoteCheck()).toBe(true);
  });

  it("never asks again in this load once answered", () => {
    armNote();
    takeNoteCheck();
    markNoteAnswered();
    armNote();
    expect(takeNoteCheck()).toBe(false);
  });
});
