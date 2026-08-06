/**
 * Guards the two things about `api/` that the rest of the repo's conventions
 * get wrong.
 *
 * First: **every `.ts` file directly under `api/` becomes a public endpoint**
 * unless its name starts with `_`. This file is called `_imports.test.ts` for
 * that reason — as `imports.test.ts` it was built into a deployed function at
 * `/api/imports.test`, and `_passcode.test.ts` escaped only by the accident of
 * the name it already had.
 *
 * Second:
 *
 * Everywhere else here, relative imports carry a `.ts` extension — the app and
 * node tsconfigs both set `allowImportingTsExtensions`. Vercel does not compile
 * `api/` with those settings. It uses its own, emits `_passcode.js`, and leaves
 * the specifier saying `./_passcode.ts`, so the deployed function throws
 * ERR_MODULE_NOT_FOUND on its first request and every call returns
 * FUNCTION_INVOCATION_FAILED.
 *
 * That failure is invisible locally: `vercel build` prints the TS5097 error and
 * still reports "Build completed successfully". It cost a deploy to find, and
 * the symptom was the login saying the passcode was wrong.
 *
 * `.js` is the correct specifier: TypeScript resolves it back to the `.ts`
 * source, and it matches what Vercel actually emits.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const all = readdirSync("api").filter((f) => f.endsWith(".ts"));
const files = all.filter((f) => !f.endsWith(".test.ts"));

describe("api/ deploy surface", () => {
  it("has functions to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("keeps test files out of the deployed routes", () => {
    // A test file here without the underscore ships as a public endpoint.
    const routed = all.filter((f) => f.endsWith(".test.ts") && !f.startsWith("_"));
    expect(routed).toEqual([]);
  });

  it("only exposes the endpoints we meant to expose", () => {
    expect(files.filter((f) => !f.startsWith("_")).sort()).toEqual(["auth.ts", "upload.ts"]);
  });
});

describe("api/ imports", () => {

  it.each(files)("%s imports relatives with .js, never .ts", (file) => {
    const source = readFileSync(`api/${file}`, "utf8");
    const specifiers = [...source.matchAll(/from\s+["'](\.[^"']*)["']/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      expect(specifier.endsWith(".ts"), `${file} imports "${specifier}"`).toBe(false);
      expect(specifier.endsWith(".js"), `${file} imports "${specifier}"`).toBe(true);
    }
  });
});
