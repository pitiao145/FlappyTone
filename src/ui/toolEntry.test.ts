/**
 * Brief 52: the tone visualizer tool → signup → in-app Visualiser path.
 * The link the tool builds, its trip through signup, what /app opens on,
 * and the tool-user signup copy.
 */
import { describe, expect, it } from "vitest";
import { appHref } from "./appLink.ts";
import { keptParams, parkReturn, restoreReturn } from "../app/authGate.ts";
import { tierLimits } from "../game/tiers.ts";
import { TONE_REFS } from "../site/checker/toneRefs.ts";
import gameAppSrc from "../app/GameApp.tsx?raw";
import {
  arrivalTarget,
  splitExample,
  toolEntry,
  toolEntryProps,
  toolSignupCopy,
  TOOL_VISUALIZER_PATH,
} from "./toolEntry.ts";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const href = (tone: string, cta: string) => appHref("visualiser", TOOL_VISUALIZER_PATH, { tone, cta });
const searchOf = (h: string) => h.slice(h.indexOf("?"));

describe("the tool's signup link", () => {
  it("carries intent, src, tone and cta", () => {
    expect(href("3-3", "hear")).toBe("/app?intent=visualiser&src=/tools/tone-visualizer&tone=3-3&cta=hear");
  });

  it("appHref without extra params is unchanged", () => {
    expect(appHref("visualiser", "/chinese-tones")).toBe("/app?intent=visualiser&src=/chinese-tones");
    expect(appHref(undefined, undefined)).toBe("/app");
  });

  it("survives a password signup (the URL keeps it) and a magic link (parked, then restored)", () => {
    const q = searchOf(href("2-3", "result"));
    expect(new URLSearchParams(keptParams(q)).get("tone")).toBe("2-3");
    expect(new URLSearchParams(keptParams(q)).get("cta")).toBe("result");
    const store = memStorage();
    parkReturn(q, store, 1000);
    // The magic link / Google redirect comes back to bare /app.
    const back = restoreReturn("", store, 2000);
    expect(arrivalTarget(back)).toEqual({ id: "2-3", hanzi: "朋友", combo: [2, 3] });
    expect(toolEntryProps(back)).toEqual({ toolTarget: "2-3", toolCta: "result" });
  });
});

describe("arrivalTarget: what /app opens the Visualiser on", () => {
  it("a single tone, with its example word", () => {
    expect(arrivalTarget(searchOf(href("3", "hear")))).toEqual({ id: "3", hanzi: "馬", tone: 3 });
  });

  it("a tone pair", () => {
    expect(arrivalTarget(searchOf(href("3-3", "more")))).toEqual({ id: "3-3", hanzi: "你好", combo: [3, 3] });
  });

  it("every tool target resolves", () => {
    for (const r of TONE_REFS) expect(arrivalTarget(`?intent=visualiser&tone=${r.id}`)?.id).toBe(r.id);
  });

  it("a bad, unknown or missing tone falls back to the Visualiser home (null)", () => {
    for (const t of ["", "5", "3-5", "0-1", "abc", "%E9%A6%AC"]) {
      expect(arrivalTarget(`?intent=visualiser&tone=${t}`), t).toBeNull();
    }
    expect(arrivalTarget("?intent=visualiser")).toBeNull();
  });

  it("needs the visualiser intent", () => {
    expect(arrivalTarget("?tone=3")).toBeNull();
    expect(arrivalTarget("?intent=pairs&tone=3")).toBeNull();
  });

  it("GameApp reads it on mount, strips it, and hands it to the Visualiser", () => {
    expect(gameAppSrc).toMatch(/useState<ArrivalTarget \| null>\(\(\) => initialArrival\(\)\)/);
    expect(gameAppSrc).toContain('params.delete("tone");');
    expect(gameAppSrc).toContain('params.delete("cta");');
    expect(gameAppSrc).toMatch(/arrival=\{arrival\}\s*onArrivalUsed=\{\(\) => setArrival\(null\)\}/);
  });
});

describe("toolEntry: which auth screen", () => {
  it("tool + visualiser intent → the tool screen", () => {
    const e = toolEntry(searchOf(href("1", "hear")));
    expect(e?.ref?.id).toBe("1");
    expect(e?.cta).toBe("hear");
  });

  it("an unknown tone or cta keeps the tool screen without the word or a CTA headline", () => {
    expect(toolEntry(`?intent=visualiser&src=${TOOL_VISUALIZER_PATH}&tone=9&cta=zzz`)).toEqual({ ref: null, cta: null });
  });

  it("every other entry keeps today's screen (null)", () => {
    expect(toolEntry("")).toBeNull();
    expect(toolEntry("?intent=visualiser&src=/chinese-tones&tone=3")).toBeNull();
    expect(toolEntry(`?src=${TOOL_VISUALIZER_PATH}`)).toBeNull();
    expect(toolEntry(`?intent=pricing&src=${TOOL_VISUALIZER_PATH}`)).toBeNull();
    expect(toolEntry("?c=1200&n=Pierre")).toBeNull();
    expect(toolEntryProps("?c=1200")).toEqual({});
  });
});

describe("toolSignupCopy", () => {
  it("a headline per CTA, no game pitch", () => {
    const ref = TONE_REFS.find((r) => r.id === "3")!;
    const titles = (["hear", "result", "more", null] as const).map((cta) => toolSignupCopy({ ref, cta }).title);
    expect(titles).toEqual([
      "Hear it from a native speaker",
      "Nice one. Keep going",
      "More words for this tone",
      "More words for this tone",
    ]);
    for (const cta of ["hear", "result", "more", null] as const) {
      const c = toolSignupCopy({ ref, cta });
      expect(`${c.title} ${c.sub} ${c.perks.join(" ")}`).not.toMatch(/bird|fly|play|game/i);
    }
  });

  it("never promises the example word itself (a free list may not hold it)", () => {
    for (const ref of TONE_REFS) {
      expect(toolSignupCopy({ ref, cta: "hear" }).sub).not.toContain(splitExample(ref.example).hanzi);
    }
    expect(toolSignupCopy({ ref: TONE_REFS.find((r) => r.id === "3")!, cta: "hear" }).sub).toContain("third tone words");
  });

  it("three perks, read from the free tier's limits", () => {
    const { perks } = toolSignupCopy({ ref: null, cta: null });
    expect(perks).toHaveLength(3);
    const free = tierLimits().free;
    expect(perks[1]).toBe(`${free.wordsPerTone} practice words per tone, ${free.pairWordsPerCombo} per tone pair`);
  });
});

describe("splitExample", () => {
  it("splits pinyin from hanzi", () => {
    expect(splitExample("mǎ 馬")).toEqual({ pinyin: "mǎ", hanzi: "馬" });
    expect(splitExample("jīn tiān 今天")).toEqual({ pinyin: "jīn tiān", hanzi: "今天" });
  });
});
