/**
 * Brief 53: the tool page's Visualiser. It shows the free tier's lists whatever
 * the tier prop says, only the first word on screen plays, and the app's own
 * Visualiser (no `tool` prop) is unchanged.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogFromFallback } from "../data/words.ts";
import { visualiserListWords, visualiserPairWords } from "../game/poolCounts.ts";
import { tierLimits } from "../game/tiers.ts";
import { availableToneCombos, wordsOfCombo, wordsOfTone } from "../game/words.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { playsInTool } from "./toolPlayable.ts";
import { Visualiser, type ToolMode } from "./Visualiser.tsx";
import visualiserSrc from "./Visualiser.tsx?raw";

const SETTINGS: CalibrationSettings = { f0Center: 130, noiseFloor: 3e-4, rangeSemitones: 3, rangeDownSemitones: 4 };
const TOOL: ToolMode = { cta: { href: "/app?intent=visualiser", label: "Sign up free to hear every word" } };

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

const render = (props: Partial<Parameters<typeof Visualiser>[0]>) =>
  renderToStaticMarkup(
    <Visualiser settings={SETTINGS} tier="guest" canvasWidth={360} canvasHeight={600} {...props} />,
  );

describe("tool mode: the free tier's lists, one word playing per tone and pair", () => {
  const all = catalogFromFallback();
  const free = tierLimits().free;
  const list = visualiserListWords(all, "free", [1], "textbook");
  const pairs = visualiserPairWords(all, "free", [1], "textbook");

  it("exactly the first word of each tone plays", () => {
    for (const t of [1, 2, 3, 4] as const) {
      const onScreen = wordsOfTone(list, t, free.wordsPerTone);
      expect(onScreen.length, `tone ${t}`).toBeGreaterThan(0);
      expect(onScreen.filter((w) => playsInTool(w, onScreen)).map((w) => w.id)).toEqual([onScreen[0].id]);
    }
  });

  it("exactly the first word of each tone pair plays", () => {
    for (const c of availableToneCombos(pairs)) {
      const onScreen = wordsOfCombo(pairs, c, free.pairWordsPerCombo);
      expect(onScreen.filter((w) => playsInTool(w, onScreen))).toHaveLength(onScreen.length > 0 ? 1 : 0);
    }
  });

  it("reads the free tier whatever tier it is given, and keeps the account out", () => {
    // A guest in the app sees "By tone" locked; the tool shows it open.
    expect(render({ tier: "guest" })).toContain("By tone 🔒");
    expect(render({ tier: "guest", tool: TOOL })).not.toContain("By tone 🔒");
    expect(visualiserSrc).toContain('const tier: Tier = tool ? "free" : accountTier;');
    expect(visualiserSrc).not.toMatch(/from "\.\.\/data\/tier\.ts"/);
  });

  it("shows the locked-sound note and hides the word-list picker", () => {
    const out = render({ tier: "free", tool: TOOL });
    expect(out).toContain("vis-tool-note");
    expect(out).toContain("Sign up free to hear every word");
    expect(out).not.toContain("Word lists");
  });

  it("a locked word selects and draws, plays nothing and shows the note", () => {
    // No DOM here: the tap path is pinned on the source.
    expect(visualiserSrc).toMatch(
      /setSelectedWord\(word\);\s*\/\/ Tool mode: the shape draws, the sound stays locked \(brief 53\)\.\s*if \(!soundPlays\(word\)\) \{\s*setSoundLocked\(true\);\s*tool\?\.onLockedSound\?\.\(\);\s*return;/,
    );
  });
});

describe("the app's Visualiser (no tool prop) is unchanged", () => {
  it("keeps the word-list picker and has no tool note", () => {
    const out = render({ tier: "free" });
    expect(out).toContain("Word lists");
    expect(out).not.toContain("vis-tool-note");
  });
});
