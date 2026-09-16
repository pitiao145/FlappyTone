/**
 * Minimal environment variable reader for Node dev scripts.
 *
 * Not dotenv: these scripts want a handful of variables, and adding a
 * dependency to a repo whose whole dependency list is five packages is a
 * worse trade than fifteen lines. Checks `process.env` first (so `vercel dev`
 * / a shell-sourced `.env.local` both work), then falls back to parsing
 * `.env.local` itself.
 */

import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url).pathname;

/**
 * Reads `name` from `process.env`, then from `.env.local`. Throws with a
 * clear message if neither has it — these are one-shot CLI scripts, so
 * throwing loudly is correct here (unlike `src/data/`, which must never
 * throw into a caller).
 */
export function envVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = `${root}.env.local`;
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`).exec(line);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${name} is not set. Put it in .env.local (get it with \`vercel env pull .env.local\`).`);
}
