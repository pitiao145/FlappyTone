/**
 * Keeps `public/dev-fixtures/` out of `dist/`.
 *
 * Vite copies `public/` verbatim, which is exactly what makes the directory a
 * usable dev-server source for the tone-pair fixture audio — and exactly what
 * would otherwise ship 1.3MB of a private recording session to every visitor.
 * Hard rule 7 is about what reaches `dist/`, and static assets are as much a
 * part of that as a bundled component.
 *
 * Deleting after the copy rather than teaching Vite not to copy: `publicDir`
 * is all-or-nothing, and moving the audio elsewhere would cost a dev-server
 * middleware to serve it from. One `rm` at `closeBundle` is the smaller thing.
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function dropDevFixtures(): Plugin {
  let outDir = "dist";
  return {
    name: "flappytone-drop-dev-fixtures",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      rmSync(resolve(outDir, "dev-fixtures"), { recursive: true, force: true });
    },
  };
}
