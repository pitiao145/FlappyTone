/**
 * Brief 47 step 4, dev switch: in the Visualiser's pairs tab, draw each
 * finished attempt stretched in time so it ends where Jane's target ends.
 * Drawing only; scoring and tone accuracy never see it.
 *
 * On only when `localStorage["ft.stretchPairs"] === "1"`, and only in a dev
 * build: Visualiser.tsx calls this behind `import.meta.env.DEV` at the call
 * site (hard rule 7). Read when the Visualiser's frame effect starts, so
 * reopen the Visualiser after changing it.
 */
export const STRETCH_PAIRS_KEY = "ft.stretchPairs";

export function stretchPairsOn(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STRETCH_PAIRS_KEY) === "1";
  } catch {
    return false;
  }
}
