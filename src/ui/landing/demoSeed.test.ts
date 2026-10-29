import { describe, expect, it } from "vitest";
import fallback from "../../data/wordsFallback.json";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import { wordsFromCatalog } from "../../game/words.ts";
import { SAY_WORDS } from "../../site/sayWords.ts";
import { EXAMPLE_CLIPS } from "../../site/exampleClips.ts";
import { HUB_EXAMPLE_IDS } from "../../site/pages/ChineseTones.tsx";
import { playableSeed, seededRound } from "./demoSeed.ts";

type Row = { id: string; min_tier: string; syllables: number; lists?: string[] };
const rows = (fallback as { rows: Row[] }).rows;
const words = wordsFromCatalog(rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));

/**
 * Mirrors workers/clips/src/routes/clip.ts for a guest ticket: `min_tier`
 * must be `free`, and the word is in a sampler list or in no `tocfl*` list.
 */
const WORKER_SAMPLERS = new Set(["sampler-beginner", "sampler-intermediate", "sampler-seo"]);
const guestFetches = (r: Row) =>
  r.min_tier === "free" &&
  ((r.lists ?? []).some((l) => WORKER_SAMPLERS.has(l)) || !(r.lists ?? []).some((l) => /^tocfl\d$/.test(l)));

/** Every word id a CTA on /say/* or /chinese-tones can seed the demo with. */
const SEO_IDS = [
  ...new Set([...SAY_WORDS.flatMap((w) => w.cards.map((c) => c.id)), ...HUB_EXAMPLE_IDS, ...Object.keys(EXAMPLE_CLIPS)]),
];

describe("demo seed words", () => {
  it.each(SEO_IDS)("%s is bundled, plays for a guest, and seeds only if the game can fly it", (id) => {
    const row = rows.find((r) => r.id === id);
    expect(row, `${id} missing from wordsFallback.json`).toBeDefined();
    expect(guestFetches(row!), `${id} ${row!.min_tier} ${(row!.lists ?? []).join(",")}`).toBe(true);
    const seed = playableSeed(words, id);
    if (row!.syllables === 1 || row!.syllables === 2) expect(seed?.id).toBe(id);
    else expect(seed).toBeNull();
  });

  it("seeds 謝謝 and skips the three-syllable phrases", () => {
    expect(playableSeed(words, "xiexie40")?.hanzi).toBe("謝謝");
    for (const id of ["duibuqi403", "bukeqi444", "meiguanxi210"]) expect(playableSeed(words, id)).toBeNull();
    expect(playableSeed(words, "not-a-word")).toBeNull();
    expect(playableSeed(words, null)).toBeNull();
  });

  it("flies the seed first, then the drawn words without repeating it", () => {
    const seed = playableSeed(words, "xiexie40")!;
    const drawn = words.filter((w) => w.syllables === 1).slice(0, 5);
    const round = seededRound(seed, [drawn[0], seed, ...drawn.slice(1)], 5);
    expect(round.map((w) => w.id)).toEqual([seed.id, ...drawn.slice(0, 4).map((w) => w.id)]);
    expect(seededRound(null, drawn, 5)).toEqual(drawn);
  });
});
