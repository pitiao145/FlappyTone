// Brief 39 bench — shared helpers. Dev-only, offline, never imported by the app.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { decodeWav } from "../wav.ts";

export const WIN = 2048;
export const HOP = 1024;

export function loadWav(path) {
  return decodeWav(readFileSync(path));
}
export function listWavs(dir, recursive = false) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (recursive) out.push(...listWavs(p, true)); }
    else if (name.endsWith(".wav")) out.push(p);
  }
  return out;
}
export function rms(x, a = 0, b = x.length) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
export function frameRms(x, win = WIN, hop = HOP) {
  const out = [];
  for (let s = 0; s + win <= x.length; s += hop) out.push(rms(x, s, s + win));
  return out;
}
export function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
}
export const med = (a) => pct(a, 50);
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const db = (r) => 20 * Math.log10(Math.max(r, 1e-9));
export const st = (f, ref) => 12 * Math.log2(f / ref);
export function fmt(x, d = 2, w = 0) {
  const s = Number.isFinite(x) ? x.toFixed(d) : "—";
  return s.padStart(w);
}
