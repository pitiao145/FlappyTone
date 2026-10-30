/**
 * PartyStory's timing and caption script, kept free of JSX (same shape as
 * tonyStoryScript.ts).
 */

import type { Cap } from "./tonyStoryScript.ts";

export const PARTY_FPS = 30;

/** Scene lengths in frames, in play order: ≈55s in all, slow enough to read every line. */
export const P = { hook: 105, bored: 150, call: 180, mishear: 210, glowup: 105, reveal: 210, rescue: 105, game: 219, queueParty: 240, cta: 120 };
export type PartyScene = keyof typeof P;
export const PARTY_ORDER: PartyScene[] = ["hook", "bored", "call", "mishear", "glowup", "reveal", "rescue", "game", "queueParty", "cta"];
export const PARTY_STORY_FRAMES = Object.values(P).reduce((a, b) => a + b, 0);

/**
 * Gameplay clip (demo/scenarios/tony-paidui.json, no listen cue, no audio,
 * gap 1), real time from clip second PGAME_START. Measured off the footage:
 * gate 1 (學校, 2+4, shown as 排隊) is flown 1.6–2.67 and the card switches to
 * gate 2 at 2.67 (= its resolvedAt); gate 2 (對面, 4+4, shown as 派對) is
 * flown 5.0–6.43, when the card clears.
 */
export const PGAME_START = 0.3;
export const PGAME = { fly1: 1.6, done1: 2.667, card2: 2.667, fly2: 5.0, done2: 6.433 };
export const pGameFrame = (clipS: number) => Math.round((clipS - PGAME_START) * PARTY_FPS);

/** Every burned-in caption, in scene frames. */
export const PCAPS: Record<PartyScene, Cap[]> = {
  hook: [],
  bored: [
    { text: "Meet Toney 👋", from: 6, to: 70, y: 300 },
    { text: "He's bored… so he calls his friend Kai 📞", from: 70, to: P.bored },
  ],
  call: [],
  mishear: [{ text: "派對?! Send me the location!! 📍", from: 140, to: P.mishear, tone: "highlight" }],
  glowup: [{ text: "Toney got ready.", from: 2, to: P.glowup }],
  reveal: [
    { text: "Toney arrives, ready to party 🎉", from: 2, to: 40 },
    { text: "But his friends weren't partying…", from: 46, to: 120 },
    { text: "…they were queuing for 雞排 🍗", from: 120, to: P.reveal, tone: "highlight" },
  ],
  rescue: [{ text: "páiduì ↗ = line up · pàiduì ↘ = party", from: 4, to: P.rescue, tone: "accent" }],
  game: [
    // Right of the bird's column (x≈90–190), under the word card.
    { text: "One tone = no party.", from: 0, to: pGameFrame(PGAME.card2), y: 380, left: 300 },
    { text: "Train your ear with FlappyTone", from: pGameFrame(PGAME.card2), to: P.game, y: 380, left: 300, tone: "accent" },
  ],
  queueParty: [
    { text: "Kai: “You wanted to party? We can party in the queue!”", from: 4, to: 120 },
    { text: "Taiwanese love to queue 🇹🇼", from: 120, to: P.queueParty, tone: "accent" },
  ],
  cta: [],
};
