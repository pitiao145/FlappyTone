/**
 * Product identity and marketing copy, in one object.
 *
 * The landing page renders from here rather than hard-coding strings, so a
 * re-brand is this file plus `src/ui/tokens.css`. In-game microcopy stays where
 * it is used — this is the marketing surface, not an i18n layer.
 *
 * Three places cannot read TypeScript and must be edited by hand alongside a
 * rename here:
 *   - `index.html`               — <title> and apple-mobile-web-app-title
 *   - `public/manifest.webmanifest` — name, short_name, description
 *   - `public/icons/`            — regenerate with `npm run make-icons`
 */

export interface LandingSection {
  /** Anchor target; also the nav link's href. */
  id: string;
  /** Section heading. */
  title: string;
  /** Shown in the nav bar when `inNav`; kept short. */
  navLabel?: string;
  inNav?: boolean;
}

export const brand = {
  name: "FlappyTone",
  shortName: "FlappyTone",
  tagline: "Your voice is the controller.",
  /** One sentence, under the tagline. Say what it does, not what it feels like. */
  pitch:
    "Fly through corridors shaped like Mandarin tone marks by producing the matching tone. Your pitch is the flight path.",
  /** PRD §8 requires this to be visible before the mic is ever requested. */
  requirement: "Needs a microphone and a quiet room.",

  /** The three beats under "How it works". */
  howItWorks: [
    {
      title: "Your pitch moves the dot",
      body: "The game listens and maps your voice onto the screen, live. Higher voice, higher dot — no buttons, no taps.",
    },
    {
      title: "The corridor is the tone mark",
      body: "ˉ ˊ ˇ ˋ are pitch diagrams. The gap you fly through is the shape you have to say, so the obstacle and the lesson are the same thing.",
    },
    {
      title: "Hear it, then answer it",
      body: "Each gate plays a native recording first. You listen, then you say it — and you see your contour against the target as you go.",
    },
  ],

  /** PRD §11, stated in the product rather than only in the spec. */
  limits: [
    "It checks your pitch contour, not your pronunciation — humming will beat it. It's a tone trainer, not a pronunciation checker.",
    "Single syllables only. No sandhi, no connected speech, no sentences yet.",
  ],

  visualiser: {
    title: "Tone visualiser",
    body: "The game with the game taken out: no gates, no scrolling, no score. Say a tone as many times as you like and watch your attempts stack on top of the target.",
    cta: "Open the visualiser",
  },

  mobile: {
    title: "Mobile app",
    summary: "iOS and Android — not yet",
    body: "A native app is planned. It would add offline play, practice reminders and a streak you can keep. There is nothing to install from a store today.",
    meantime:
      "In the meantime it installs from the browser, and it's better that way — full screen, no URL bar eating a fifth of the display.",
    ios: "iPhone / iPad: open this in Safari, tap Share, then Add to Home Screen.",
    android: "Android: open the ⋮ menu in Chrome, then Install app.",
    note: "Add it from the game screen or from here — either one opens straight into the game.",
  },

  sections: [
    { id: "top", title: "FlappyTone" },
    { id: "demo", title: "See it" },
    {
      id: "how-it-works",
      title: "How it works",
      navLabel: "How it works",
      inNav: true,
    },
    { id: "play", title: "Play", navLabel: "Play", inNav: true },
    {
      id: "visualiser",
      title: "Tone visualiser",
      navLabel: "Visualiser",
      inNav: true,
    },
    { id: "mobile", title: "Mobile app", navLabel: "Mobile", inNav: true },
    { id: "limits", title: "What it doesn't do" },
  ] as LandingSection[],
} as const;
