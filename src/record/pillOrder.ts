/**
 * Ordering and colour for the booth's list picker, pulled out as a pure
 * function for the same reason `boothArming.ts` was: the rule is easy to get
 * subtly wrong inline (which bucket a disabled list's pill lands in, whether
 * ties keep the catalog's own list order), and a pure function is what makes
 * that testable without mounting `Overview.tsx`.
 *
 * The picker's pills are (list × style) since migration 0024 gave a
 * recording a style — each list id gets a "textbook" and a "natural" pill,
 * and each is ordered independently: a list can be done in one style and
 * still have words pending in the other.
 */
import type { BoothStyle } from "./boothWords.ts";

export interface Pill {
  listId: string;
  style: BoothStyle;
}

const STYLES: BoothStyle[] = ["textbook", "natural"];

/**
 * Three buckets, in display order: pending work, fully recorded ("green"),
 * disabled. A disabled list's pill is always bucket 2 regardless of its
 * pending count — CLAUDE.md/DECISIONS.md's `hsk*` lists are shown but not
 * being worked, so their completeness is not the point.
 */
function bucket(pill: Pill, pendingCount: number, isDisabledList: (listId: string) => boolean): 0 | 1 | 2 {
  if (isDisabledList(pill.listId)) return 2;
  return pendingCount > 0 ? 0 : 1;
}

/**
 * Orders every (list × style) pill: pending first (in `listOrder`'s order),
 * then fully recorded, then disabled lists last in both styles. Ties within
 * a bucket keep `listOrder`'s order, textbook before natural for the same
 * list — `Array.prototype.sort` is stable, so this only has to compare
 * buckets.
 */
export function orderPills(
  listIds: Iterable<string>,
  listOrder: string[],
  pendingCountFor: (listId: string, style: BoothStyle) => number,
  isDisabledList: (listId: string) => boolean,
): Pill[] {
  const sortedListIds = [...listIds].sort((a, b) => {
    const ia = listOrder.indexOf(a);
    const ib = listOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const pills: Pill[] = [];
  for (const listId of sortedListIds) for (const style of STYLES) pills.push({ listId, style });

  return pills
    .map((pill) => ({ pill, bucket: bucket(pill, pendingCountFor(pill.listId, pill.style), isDisabledList) }))
    .sort((a, b) => a.bucket - b.bucket)
    .map((x) => x.pill);
}
