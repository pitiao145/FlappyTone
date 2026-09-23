/**
 * The inventory's speaker handoff.
 *
 * The stale-publish guard in `loadInventory` is the one piece of ordering
 * logic in the voice feature, and it is exactly where a regression is
 * invisible: a slow fetch for the previous speaker resolving *after* another
 * speaker's catalog was adopted, and overwriting it, looks precisely like the
 * game working — the player simply hears the other voice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Word } from "../game/words.ts";

const fetchCatalog = vi.fn<(opts: { speaker: string }) => Promise<Word[]>>();

vi.mock("../data/words.ts", () => ({
  fetchCatalog: (opts: { speaker: string }) => fetchCatalog(opts),
  // No cache and no bundled rows in these tests, so `inventoryNow()` starts
  // null — what a first-ever visit looked like before the bundled seed, and
  // still the right isolation here: these tests are about the speaker
  // handoff, not about what the seed contains.
  catalogFromCache: () => null,
  catalogFromFallback: () => [],
}));

const word = (id: string, speakerId: string): Word =>
  ({ id, speakerId }) as unknown as Word;

type Inventory = typeof import("./inventory.ts");

/** A fresh module instance, since the inventory is a module singleton. */
async function freshInventory(): Promise<Inventory> {
  vi.resetModules();
  return import("./inventory.ts");
}

beforeEach(() => {
  fetchCatalog.mockReset();
});

describe("adoptInventory", () => {
  it("moves the speaker and the words together", async () => {
    const inv = await freshInventory();
    expect(inv.inventorySpeaker()).toBe("jane");
    const mark = [word("ma1", "mark")];
    inv.adoptInventory("mark", mark);
    expect(inv.inventorySpeaker()).toBe("mark");
    expect(inv.inventoryNow()).toEqual(mark);
    // The adopted catalog is the answer `loadInventory` gives too — no second
    // fetch for words already in hand.
    await expect(inv.loadInventory()).resolves.toEqual(mark);
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("reports the speaker the words actually came from, not the requested id", async () => {
    const inv = await freshInventory();
    // A fetch for "mark" degrading to the bundled fallback (or any other
    // stand-in) returns Jane-stamped rows. The recorded speaker must follow
    // the words, not the id that was asked for.
    const janeRows = [word("ma1", "jane")];
    inv.adoptInventory("mark", janeRows);
    expect(inv.inventorySpeaker()).toBe("jane");
  });
});

describe("subscribeInventory", () => {
  it("notifies listeners on an adopt, and stops on unsubscribe", async () => {
    const inv = await freshInventory();
    const seen: string[] = [];
    const off = inv.subscribeInventory((words) => seen.push(words[0]?.speakerId ?? ""));
    inv.adoptInventory("mark", [word("ma1", "mark")]);
    off();
    inv.adoptInventory("jane", [word("ma1", "jane")]);
    expect(seen).toEqual(["mark"]);
  });

  it("notifies on a late fetch, which is how a live run picks up its pool", async () => {
    const inv = await freshInventory();
    const jane = [word("ma1", "jane")];
    fetchCatalog.mockResolvedValue(jane);
    const seen: Word[][] = [];
    inv.subscribeInventory((w) => seen.push(w));
    await inv.loadInventory();
    expect(seen).toEqual([jane]);
  });
});

describe("loadInventory's stale-publish guard", () => {
  it("does not let a fetch for the previous speaker overwrite an adopted catalog", async () => {
    const inv = await freshInventory();
    let releaseJane: (w: Word[]) => void = () => undefined;
    const jane = [word("ma1", "jane")];
    fetchCatalog.mockReturnValue(
      new Promise<Word[]>((resolve) => {
        releaseJane = resolve;
      }),
    );

    // A fetch for the default speaker is in flight...
    const pending = inv.loadInventory();
    const mark = [word("ma1", "mark")];
    // ...and the resolved preference lands first.
    inv.adoptInventory("mark", mark);
    const seen: Word[][] = [];
    inv.subscribeInventory((w) => seen.push(w));
    // Only now does the earlier fetch come back.
    releaseJane(jane);
    await pending;

    expect(inv.inventorySpeaker()).toBe("mark");
    expect(inv.inventoryNow()).toEqual(mark);
    // Subscribers mount after the adopt: they should receive the adopted
    // catalog immediately so a late-mounted run picks up the current pool.
    expect(seen).toEqual([mark]);
  });
});

/**
 * The synchronous seed — the fix for "gate 1 is always a placeholder 'ma' and
 * always synthetic" on a cold load.
 *
 * Asserted through a SEPARATE mock, because the suite above deliberately
 * mocks the bundle away to isolate the speaker handoff. What matters here is
 * only the order of preference: cache, else bundle, and never null when
 * either has rows.
 */
describe("the synchronous seed", () => {
  const seeded = async (cacheRows: Word[] | null, bundleRows: Word[]) => {
    vi.resetModules();
    vi.doMock("../data/words.ts", () => ({
      fetchCatalog: () => new Promise<Word[]>(() => {}), // never lands
      catalogFromCache: () => cacheRows,
      catalogFromFallback: () => bundleRows,
    }));
    return (await import("./inventory.ts")).inventoryNow();
  };

  it("falls back to the bundled catalog when the cache is empty", async () => {
    const bundle = [word("ma1b", "jane")];
    expect(await seeded(null, bundle)).toEqual(bundle);
  });

  it("prefers the cache, which is this speaker's own and fresher", async () => {
    const cache = [word("cached", "jane")];
    expect(await seeded(cache, [word("bundled", "jane")])).toEqual(cache);
  });

  it("answers before any fetch resolves, which is the whole point", async () => {
    // `fetchCatalog` above never settles, so a non-null answer here can only
    // have come from the seed — this is exactly the cold-load case where the
    // Run is constructed before the network has said anything.
    expect(await seeded(null, [word("ma1b", "jane")])).not.toBeNull();
  });
});
