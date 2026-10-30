/**
 * PartyStory's timing and caption script, kept free of JSX (same shape as
 * tonyStoryScript.ts).
 */

import type { Cap } from "./tonyStoryScript.ts";

export const PARTY_FPS = 30;

/** Scene lengths in frames, in play order: ≈20s in all. */
export const P = { call: 75, mishear: 60, glowup: 54, reveal: 75, rescue: 48, game: 126, queueParty: 75, cta: 90 };
export type PartyScene = keyof typeof P;
export const PARTY_ORDER: PartyScene[] = ["call", "mishear", "glowup", "reveal", "rescue", "game", "queueParty", "cta"];
export const PARTY_STORY_FRAMES = Object.values(P).reduce((a, b) => a + b, 0);

/**
 * Gameplay clip (demo/scenarios/tony-paidui.json, no listen cue, no audio),
 * real time from clip second PGAME_START. Measured off the footage: gate 1
 * (學校, 2+4, shown as 排隊) is flown 1.6–2.67 and the card switches to gate 2
 * at 2.67 (= its resolvedAt); gate 2 (對面, 4+4, shown as 派對) is flown
 * 3.4–4.77, when the card clears.
 */
export const PGAME_START = 1.0;
export const PGAME = { fly1: 1.6, done1: 2.667, card2: 2.667, fly2: 3.4, done2: 4.767 };
export const pGameFrame = (clipS: number) => Math.round((clipS - PGAME_START) * PARTY_FPS);

/** Every burned-in caption, in scene frames. */
export const PCAPS: Record<PartyScene, Cap[]> = {
  call: [{ text: "He heard “party.” They said “queue.”", from: 4, to: P.call }],
  mishear: [{ text: "我們在派對?! Send me the location!!", from: 18, to: P.mishear, tone: "highlight" }],
  glowup: [{ text: "Toney got ready.", from: 2, to: P.glowup }],
  reveal: [{ text: "…it was a line for 雞排 🍗", from: 20, to: P.reveal, tone: "highlight" }],
  rescue: [{ text: "páiduì ↗ = line up · pàiduì ↘ = party", from: 4, to: P.rescue, tone: "accent" }],
  game: [
    // Right of the bird's column (x≈90–190), under the word card.
    { text: "One tone = no party.", from: 0, to: pGameFrame(PGAME.card2), y: 380, left: 300 },
    { text: "Train your ear with FlappyTone", from: pGameFrame(PGAME.card2), to: P.game, y: 380, left: 300, tone: "accent" },
  ],
  queueParty: [{ text: "You wanted to party? We can party in the queue! Taiwanese love to queue 🇹🇼", from: 4, to: P.queueParty }],
  cta: [],
};
