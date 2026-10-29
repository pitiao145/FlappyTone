import { describe, expect, it } from "vitest";
import { openModal } from "./modal.ts";

function fakes() {
  const log: string[] = [];
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
      log.push("show");
    },
  };
  const opener = { focus: () => log.push("focus opener") };
  const doc = { activeElement: opener, documentElement: { style: { overflow: "auto" } } };
  return { log, dialog, doc };
}

describe("openModal", () => {
  it("shows the dialog and locks page scroll", () => {
    const { log, dialog, doc } = fakes();
    openModal(dialog, doc);
    expect(dialog.open).toBe(true);
    expect(doc.documentElement.style.overflow).toBe("hidden");
    expect(log).toEqual(["show"]);
  });

  it("on close, restores scroll and returns focus to the trigger, once", () => {
    const { log, dialog, doc } = fakes();
    const undo = openModal(dialog, doc);
    undo();
    undo();
    expect(doc.documentElement.style.overflow).toBe("auto");
    expect(log).toEqual(["show", "focus opener"]);
  });
});
