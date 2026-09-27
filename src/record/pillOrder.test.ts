import { describe, expect, it } from "vitest";
import { orderPills } from "./pillOrder.ts";

const LIST_ORDER = ["core-120", "tocfl1", "tocfl2", "hsk1"];
const isDisabled = (id: string) => id.startsWith("hsk");

describe("orderPills", () => {
  it("orders pending, then done, then disabled — pending, then done (green), then disabled", () => {
    const pending = new Map([
      ["core-120:textbook", 0], // done
      ["core-120:natural", 5], // pending
      ["tocfl1:textbook", 3], // pending
      ["tocfl1:natural", 0], // done
      ["hsk1:textbook", 9], // disabled, ignores pending count
      ["hsk1:natural", 0], // disabled
    ]);
    const pills = orderPills(
      ["core-120", "tocfl1", "hsk1"],
      LIST_ORDER,
      (listId, style) => pending.get(`${listId}:${style}`) ?? 0,
      isDisabled,
    );

    // Pending bucket first, in list order: core-120 natural, tocfl1 textbook.
    expect(pills.slice(0, 2)).toEqual([
      { listId: "core-120", style: "natural" },
      { listId: "tocfl1", style: "textbook" },
    ]);
    // Done (green) bucket next, in list order: core-120 textbook, tocfl1 natural.
    expect(pills.slice(2, 4)).toEqual([
      { listId: "core-120", style: "textbook" },
      { listId: "tocfl1", style: "natural" },
    ]);
    // Disabled last, both styles, regardless of pending count.
    expect(pills.slice(4)).toEqual([
      { listId: "hsk1", style: "textbook" },
      { listId: "hsk1", style: "natural" },
    ]);
  });

  it("keeps a list's two style pills apart when their completeness differs", () => {
    const pending = new Map([
      ["tocfl2:textbook", 0],
      ["tocfl2:natural", 4],
    ]);
    const pills = orderPills(
      ["tocfl2"],
      LIST_ORDER,
      (listId, style) => pending.get(`${listId}:${style}`) ?? 0,
      isDisabled,
    );
    // natural (pending) sorts before textbook (done), even though they share
    // a list — each pill's own status decides its bucket, not the list's.
    expect(pills).toEqual([
      { listId: "tocfl2", style: "natural" },
      { listId: "tocfl2", style: "textbook" },
    ]);
  });

  it("falls back to alphabetical order for a list not in listOrder", () => {
    const pills = orderPills(["zeta", "alpha"], LIST_ORDER, () => 1, isDisabled);
    expect(pills.map((p) => p.listId)).toEqual(["alpha", "alpha", "zeta", "zeta"]);
  });
});
