/**
 * TonyStory's timing and caption script, kept free of JSX so
 * `video/export-srt.ts` can read it with plain Node.
 */

export const STORY_FPS = 30;

/** Scene lengths in frames, in play order. */
export const S = { plane: 120, stall: 300, hero: 165, shapes: 240, game: 325, retry: 150, party: 120 };
export type SceneKey = keyof typeof S;
export const SCENE_ORDER: SceneKey[] = ["plane", "stall", "hero", "shapes", "game", "retry", "party"];
export const TONY_STORY_FRAMES = Object.values(S).reduce((a, b) => a + b, 0);

export function sceneStart(key: SceneKey): number {
  let at = 0;
  for (const k of SCENE_ORDER) {
    if (k === key) return at;
    at += S[k];
  }
  return at;
}

/**
 * Gameplay clip (demo/scenarios/tony-story.json), real time from clip second
 * GAME_START. Windows measured off the footage's own "listen…" / "your turn!"
 * chips and word-card changes (the timing file's cueAt is when the cue starts;
 * the card keeps showing the previous word until 8.5s):
 *   gate 1 (水果, spoken 2+3, shown as 水餃): listen 0.8–3.6, turn 3.6–5.2
 *   gate 2 (睡覺): listen 5.83–8.5, turn 8.5–9.9; card switches at 8.5, clears at 10.6
 */
export const GAME_START = 0.6;
export const GAME = { listen1: 0.8, turn1: 3.6, flown1: 5.2, listen2: 5.83, turn2: 8.5, flown2: 9.9, end: 10.83 };
export const gameFrame = (clipS: number) => Math.round((clipS - GAME_START) * STORY_FPS);

export interface Cap {
  text: string;
  from: number;
  to: number;
  y?: number;
  tone?: "ink" | "accent" | "highlight";
}

/** Every burned-in caption, in scene frames. Speech bubbles are art, not captions. */
export const CAPS: Record<SceneKey, Cap[]> = {
  plane: [{ text: "Meet Tony, he just arrived in Taiwan 🇹🇼", from: 12, to: S.plane, y: 300 }],
  stall: [
    { text: "Tony heads straight to the night market and asks for dumplings (at least, that's what he thinks he's asking)", from: 0, to: 125 },
    { text: "She heard: sleep 😴", from: 150, to: 225, y: 300, tone: "highlight" },
    { text: "…so he got a pillow.", from: 240, to: S.stall, y: 300 },
  ],
  hero: [{ text: "FlappyTone to the rescue!", from: 8, to: S.hero, y: 300, tone: "accent" }],
  shapes: [
    { text: "Same syllables. Different tones.", from: 10, to: 115 },
    { text: "水餃 is said 2 + 3 (written 3 + 3)", from: 150, to: 198, tone: "highlight" },
    { text: "Tones change the word!", from: 202, to: S.shapes, tone: "accent" },
  ],
  game: [
    // One caption at a time, under the word card: the bird flies the whole height below it.
    { text: "How FlappyTone works 👇", from: 0, to: gameFrame(GAME.listen1) + 4, y: 380 },
    { text: "🔊 1. Listen: a native speaker says the word", from: gameFrame(GAME.listen1) + 4, to: gameFrame(GAME.turn1), y: 380, tone: "highlight" },
    { text: "🎤 2. Tony says it back. His voice flies the bird along the tone", from: gameFrame(GAME.turn1), to: gameFrame(GAME.listen2), y: 380, tone: "accent" },
    { text: "🔊 Next word: 睡覺 shuìjiào (sleep). Listen first…", from: gameFrame(GAME.listen2), to: gameFrame(GAME.turn2), y: 380, tone: "highlight" },
    { text: "🎤 Tony's turn again", from: gameFrame(GAME.turn2), to: gameFrame(GAME.flown2) + 4, y: 380, tone: "accent" },
    { text: "Right tones = Perfect! ✓", from: gameFrame(GAME.flown2) + 4, to: S.game, y: 380, tone: "highlight" },
  ],
  retry: [],
  party: [],
};
