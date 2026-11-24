import type { SpeechStyle } from "../game/words.ts";

/**
 * The speech style's name on screen. Its own module so the tool page's
 * Visualiser chunk does not pull in Settings (and its account code).
 */
export const SPEECH_STYLE_LABEL: Record<SpeechStyle, string> = { textbook: "Standard", natural: "Spoken" };
