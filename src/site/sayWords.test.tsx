import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fallback from "../data/wordsFallback.json";
import { hasSimplified, simplifiedIn } from "../dev/simplified.ts";
import { SAY_SLUGS } from "../analytics/session.ts";
import { SAY_CLIPS, SAY_CLIPS_SPOKEN } from "./sayClips.ts";
import { SAY_WORDS } from "./sayWords.ts";
import { SAY_ROUTES, routeFor } from "./routes.ts";
import { SITE_PAGES } from "./pages.tsx";
import { sitemapXml, llmsTxt } from "./siteFiles.ts";
import { makeWordPageReporter, sayPath } from "./pages/SayWord.tsx";
import { parsePinyin, toZhuyin } from "./zhuyin.ts";

type Row = {
  id: string;
  hanzi: string;
  pinyin: string;
  status: string;
  lists?: string[];
  polyline: unknown;
  onset_s: number;
  duration_s: number;
  clip_s: number;
};
const rows = (fallback as { rows: Row[] }).rows;
const row = (id: string) => rows.find((r) => r.id === id);

/** Mirrors workers/clips/src/routes/clip.ts' SAMPLER_LIST_IDS and level gate. */
const WORKER_SAMPLERS = new Set([
  "sampler-beginner",
  "sampler-intermediate",
  "sampler-seo",
]);
const guestPlayable = (lists: string[]) =>
  lists.some((l) => WORKER_SAMPLERS.has(l)) ||
  !lists.some((l) => /^tocfl\d$/.test(l));

const cardIds = [...new Set(SAY_WORDS.flatMap((w) => w.cards.map((c) => c.id)))];

describe("say word data ↔ catalog", () => {
  it("every recording is a published catalog word with matching hanzi/pinyin", () => {
    for (const w of SAY_WORDS) {
      for (const c of w.cards) {
        const r = row(c.id);
        expect(r?.status, c.id).toBe("published");
        expect(r?.hanzi, c.id).toBe(c.hanzi);
        expect(r?.pinyin, c.id).toBe(c.pinyin);
      }
    }
  });

  it("a one-card page's headword is the recorded word", () => {
    for (const w of SAY_WORDS.filter((w) => w.cards.length === 1)) {
      expect(row(w.cards[0].id)?.hanzi, w.slug).toBe(w.hanzi);
      expect(row(w.cards[0].id)?.pinyin, w.slug).toBe(w.pinyin);
    }
  });

  it("every recording plays for a guest ticket", () => {
    for (const id of cardIds) {
      const lists = row(id)?.lists ?? [];
      expect(guestPlayable(lists), `${id} ${lists.join(",")}`).toBe(true);
    }
  });

  it("the copied clip data matches the catalog", () => {
    expect(Object.keys(SAY_CLIPS).sort()).toEqual([...cardIds].sort());
    for (const [id, c] of Object.entries(SAY_CLIPS)) {
      const r = row(id)!;
      expect(c).toEqual({
        polyline: r.polyline,
        onsetS: r.onset_s,
        durationS: r.duration_s,
        clipS: r.clip_s,
      });
    }
  });

  it("spoken clips belong to page recordings and look sane", () => {
    for (const [id, c] of Object.entries(SAY_CLIPS_SPOKEN)) {
      expect(cardIds, id).toContain(id);
      expect(c.durationS).toBeGreaterThan(0);
      expect(c.clipS).toBeGreaterThan(c.durationS);
    }
  });

  it("all hanzi on the pages is Traditional", () => {
    for (const w of SAY_WORDS) {
      const text = JSON.stringify(w);
      expect(hasSimplified(text), `${w.slug}: ${simplifiedIn(text)}`).toBe(false);
    }
  });

  it("every pinyin parses fully, so 注音 is derived", () => {
    for (const w of SAY_WORDS) {
      const all = [w.pinyin, w.said ?? "", ...w.uses.map((u) => u.pinyin)];
      for (const p of all.filter(Boolean)) {
        const parts = parsePinyin(p.replace(/[，,]/g, " "));
        const junk = parts.filter((x) => "text" in x && x.text.trim());
        expect(junk, `${w.slug}: ${p}`).toEqual([]);
      }
      expect(toZhuyin(w.pinyin)).not.toBe("");
    }
  });

  it("siblings exist and are not the page itself", () => {
    const slugs = new Set(SAY_WORDS.map((w) => w.slug));
    for (const w of SAY_WORDS) {
      expect(w.siblings.length).toBeGreaterThanOrEqual(2);
      for (const s of w.siblings) {
        expect(slugs.has(s), `${w.slug} → ${s}`).toBe(true);
        expect(s).not.toBe(w.slug);
      }
    }
  });
});

describe("say routes", () => {
  it("one route, one page and one analytics slug per word, same order", () => {
    expect(SAY_WORDS.map((w) => w.slug)).toEqual([...SAY_SLUGS]);
    expect(SAY_ROUTES.map((r) => r.path)).toEqual(
      SAY_WORDS.map((w) => sayPath(w.slug)),
    );
    for (const r of SAY_ROUTES) {
      expect(r.pageType).toBe("word");
      expect(routeFor(r.path)).toBe(r);
      expect(SITE_PAGES[r.path], r.path).toBeDefined();
    }
    expect(routeFor("/say")?.pageType).toBe("hub");
    expect(SITE_PAGES["/say"]).toBeDefined();
  });

  it("every word page and the index are in the sitemap and llms.txt", () => {
    const sm = sitemapXml();
    const llms = llmsTxt();
    for (const p of ["/say", ...SAY_ROUTES.map((r) => r.path)]) {
      expect(sm, p).toContain(`https://flappytone.com${p}<`);
      expect(llms, p).toContain(`https://flappytone.com${p})`);
    }
  });

  it("each page renders one H1, and its FAQ JSON-LD matches the rendered FAQ", () => {
    for (const w of SAY_WORDS) {
      const path = sayPath(w.slug);
      const def = SITE_PAGES[path];
      const html = renderToStaticMarkup(<def.Page />);
      expect(html.match(/<h1[\s>]/g)?.length, path).toBe(1);
      const ld = def.jsonLd!(routeFor(path)!);
      const faq = ld.find(
        (o) => (o as { "@type": string })["@type"] === "FAQPage",
      ) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
      expect(faq.mainEntity.map((q) => q.name)).toEqual(w.faq.map((f) => f.q));
      for (const q of faq.mainEntity) {
        expect(html).toContain(escape(q.name));
        expect(html).toContain(escape(q.acceptedAnswer.text));
      }
      expect(html).toContain(`/tools/tone-visualizer?tone=${w.toneTarget}`);
      expect(html).not.toContain("word=");
    }
  });
});

describe("word_page_action", () => {
  it("sends each action once, with the page's slug only", () => {
    const sent: unknown[] = [];
    const r = makeWordPageReporter("hello", (e) => sent.push(e));
    r("listen");
    r("listen");
    r("see_it");
    expect(sent).toEqual([
      { type: "word_page_action", slug: "hello", action: "listen" },
      { type: "word_page_action", slug: "hello", action: "see_it" },
    ]);
  });

  it("a throwing sender never breaks the page", () => {
    const r = makeWordPageReporter("yuan", () => {
      throw new Error("x");
    });
    expect(() => r("practise_tone")).not.toThrow();
  });
});

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
