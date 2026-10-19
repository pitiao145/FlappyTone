import { describe, expect, it } from "vitest";
import fallback from "../data/wordsFallback.json";
import { EXAMPLE_CLIPS } from "./exampleClips.ts";
import { HUB_EXAMPLE_IDS } from "./pages/ChineseTones.tsx";

type Row = {
  id: string;
  status: string;
  lists?: string[];
  polyline: unknown;
  onset_s: number;
  duration_s: number;
  clip_s: number;
};
const rows = (fallback as { rows: Row[] }).rows;

describe("hub example clips", () => {
  it("every example word has a published recording", () => {
    for (const id of HUB_EXAMPLE_IDS) {
      expect(rows.find((r) => r.id === id)?.status, id).toBe("published");
    }
  });

  it("the copied clip data matches the catalog", () => {
    expect(Object.keys(EXAMPLE_CLIPS).sort()).toEqual(
      [...HUB_EXAMPLE_IDS].sort(),
    );
    for (const [id, c] of Object.entries(EXAMPLE_CLIPS)) {
      const r = rows.find((x) => x.id === id)!;
      expect(c).toEqual({
        polyline: r.polyline,
        onsetS: r.onset_s,
        durationS: r.duration_s,
        clipS: r.clip_s,
      });
    }
  });

  it("every example word plays for a guest ticket (Worker's TOCFL level gate)", () => {
    // Mirrors workers/clips/src/routes/clip.ts: a guest gets a word only if it
    // is in a sampler list or in no tocfl* list. 山/茶/水/看 failed this once.
    for (const id of HUB_EXAMPLE_IDS) {
      const lists = rows.find((r) => r.id === id)?.lists ?? [];
      const sampler = lists.some((l: string) => l.startsWith("sampler-"));
      const leveled = lists.some((l: string) => /^tocfl\d$/.test(l));
      expect(sampler || !leveled, `${id} ${lists.join(",")}`).toBe(true);
    }
  });
});
