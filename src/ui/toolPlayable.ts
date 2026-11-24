import type { Word } from "../game/words.ts";

/**
 * Brief 53: on the tool page only the first word of the list on screen plays
 * its sound; every other word selects and draws its shape, sound locked.
 */
export function playsInTool(w: Word, onScreen: readonly Word[]): boolean {
  return w.id === onScreen[0]?.id;
}
