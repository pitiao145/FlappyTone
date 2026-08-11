/**
 * `palette.ts`'s FALLBACK is what tests and `npm run analyze` render with —
 * anything with no DOM never sees `:root`. If a `-rgb` token in tokens.css
 * changes (a re-brand) and FALLBACK isn't updated to match, those paths
 * silently keep rendering the old palette. This pins every `-rgb` token in
 * tokens.css to its FALLBACK counterpart so that drift fails loudly.
 *
 * Both files are parsed as plain text rather than imported as modules:
 * palette.ts touches `document`/`getComputedStyle`, which needs the DOM
 * project's lib, while reading a file needs node:fs, which needs the node
 * project's types — the two don't mix in one tsconfig (see CLAUDE.md's note
 * on Node-only CLI scripts). Parsing text sidesteps the conflict entirely.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(__dirname, "../ui/tokens.css"), "utf-8");
const paletteTs = readFileSync(join(__dirname, "./palette.ts"), "utf-8");

const rgbTokenPattern = /(--[a-z0-9-]+-rgb):\s*([^;]+);/gi;
const tokensInCss = new Map<string, string>();
for (const match of tokensCss.matchAll(rgbTokenPattern)) {
  const [, name, value] = match;
  tokensInCss.set(name, value.trim());
}

// FALLBACK entries: `key: "r, g, b",` inside the `const FALLBACK = { ... }` object.
const fallbackBlock = paletteTs.slice(
  paletteTs.indexOf("FALLBACK = {"),
  paletteTs.indexOf("} as const;"),
);
const fallbackEntryPattern = /(\w+):\s*"([\d]+,\s*[\d]+,\s*[\d]+)"/g;
const fallback = new Map<string, string>();
for (const match of fallbackBlock.matchAll(fallbackEntryPattern)) {
  const [, key, value] = match;
  fallback.set(key, value.trim());
}

// CSS_VAR entries: `key: "--some-rgb",` inside the `CSS_VAR: Record<...> = { ... }` object.
const cssVarBlock = paletteTs.slice(
  paletteTs.indexOf("CSS_VAR: Record<Token, string> = {"),
  paletteTs.indexOf("};", paletteTs.indexOf("CSS_VAR: Record<Token, string> = {")),
);
const cssVarEntryPattern = /(\w+):\s*"(--[a-z0-9-]+)"/g;
const cssVar = new Map<string, string>();
for (const match of cssVarBlock.matchAll(cssVarEntryPattern)) {
  const [, key, value] = match;
  cssVar.set(key, value.trim());
}

describe("palette FALLBACK matches tokens.css", () => {
  it("finds at least one -rgb token in tokens.css", () => {
    expect(tokensInCss.size).toBeGreaterThan(0);
  });

  it("finds FALLBACK and CSS_VAR entries in palette.ts", () => {
    expect(fallback.size).toBeGreaterThan(0);
    expect(cssVar.size).toBeGreaterThan(0);
    expect(fallback.size).toBe(cssVar.size);
  });

  for (const [key, varName] of cssVar) {
    it(`${key} (${varName}) matches tokens.css`, () => {
      const cssValue = tokensInCss.get(varName);
      expect(cssValue, `${varName} not found in tokens.css`).toBeDefined();
      expect(fallback.get(key)).toBe(cssValue);
    });
  }

  it("every -rgb token in tokens.css has a FALLBACK/CSS_VAR entry", () => {
    const mappedVars = new Set(cssVar.values());
    for (const cssVarName of tokensInCss.keys()) {
      expect(mappedVars.has(cssVarName), `${cssVarName} has no palette.ts entry`).toBe(true);
    }
  });
});
