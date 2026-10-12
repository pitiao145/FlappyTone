import { useEffect, useState } from "react";
import { inventoryNow, subscribeInventory } from "../audio/inventory.ts";
import type { Word } from "../game/words.ts";

/**
 * The live word inventory, following the catalog as it lands (bundled fallback
 * first, then the live fetch). `null` until there is something to count —
 * display code renders nothing rather than a wrong number.
 */
export function useInventoryWords(): Word[] | null {
  const [words, setWords] = useState<Word[] | null>(() => inventoryNow());
  useEffect(() => subscribeInventory(setWords), []);
  return words;
}
