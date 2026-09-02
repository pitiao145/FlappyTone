/**
 * Product identity and marketing copy, in one object.
 *
 * The landing page renders from here rather than hard-coding strings, so a
 * re-brand is this file plus `src/ui/tokens.css`. In-game microcopy stays where
 * it is used — this is the marketing surface, not an i18n layer.
 *
 * These cannot read TypeScript and must be edited by hand alongside a rename
 * here:
 *   - `index.html`               — <title>, apple-mobile-web-app-title, the
 *                                  description, the OG copy and the JSON-LD
 *   - `public/manifest.webmanifest` — name, short_name, description
 *   - `public/robots.txt`        — the Sitemap: URL
 *   - `public/sitemap.xml`       — the <loc>, and `lastmod` (a real date, never
 *                                  regenerated per deploy — see
 *                                  docs/SEO_PRERENDER_BRIEF.md)
 *   - `public/icons/`            — regenerate with `npm run make-icons`
 *
 * The landing page's body copy is *not* on that list: `src/dev/prerender.ts`
 * renders `Landing` itself at build time and writes the markup into
 * `index.html`, so the crawlable HTML *is* the page rather than a copy of it.
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
  /**
   * The page's `h1`, and the thing someone would actually search for.
   *
   * Deliberately not the brand name: "FlappyTone" is a coined word with no
   * search demand, and a brand-name `h1` is part of what got the sibling
   * project deindexed. The wordmark in `Nav` carries the name instead.
   */
  /** Small caps label above the h1. */
  heroEyebrow: "A tone-training game, not a fluency app",
  headline: "A visual way to train your Mandarin tones",
  tagline: "Your voice is the controller.",
  /** One sentence, under the h1. Say what it does, not what it feels like. */
  pitch:
    "Tones can be hard to grasp for non-Mandarin speakers. FlappyTone lets you practice tones intuitively, while having fun!",
  /** PRD §8 requires this to be visible before the mic is ever requested. */
  requirement: "Needs a microphone and a quiet room.",

  privacyNote:
    "Your voice is processed on your device, never uploaded or stored. No AI, just maths.",

  /** Caption under the demo loop. */
  demoCaption: "Flappytone in action.",

  /** The two teaser cards directly under the hero: Play vs. Visualise. */
  heroCards: {
    play: {
      eyebrow: "For practice",
      title: "Fly through corridors with your voice",
      body: "Fly through gates shaped like tone contours. Ace the pitch, clear the gate. This builds muscle memory without you even thinking about it.",
      cta: "Play the game",
    },
    visualise: {
      eyebrow: "For understanding",
      title: "Visualiser: understand how to use your voice",
      body: "No gates, no score. Watch your voice trace the tone shape in real time against a native speaker's. Wait for the \"aha!\" moment and then go try out the game!",
      cta: "Try the visualiser",
    },
  },

  /** "Why this works" — text only, no image, sits above the visualiser section. */
  whyThisWorks: {
    eyebrow: "How this works",
    title: "You know how tones look like on paper.\nThis makes you understand them.",
    body: "mā, má, mǎ, mà trace four different pitch shapes every time a native speaker says them, that's literally what the tone marks are. Say a tone enough times while watching its shape and you will start recognizing it before you can explain why. You're effectively creating a visual memory of pitch, pretty cool!\n" +
      "This runs on nothing but pitch-detection math in your browser. No model, no upload, no AI.",
  },

  /** Subhead + lead-in above the four tone cards. */
  toneDataTitle: "Trained on the voice of a native Mandarin speaker from Taiwan",
  toneDataEyebrow: "Based on real speech, not the textbook",
  toneDataIntro:
    "Every corridor is measured from Jane, a native Taiwanese speaker. The gate shapes therefore represent the exact path of her voice at the moment of recording. So if a shape doesn't match a textbook you've used, that's not a bug, it's a real accent. More accents, and eventually other tonal languages, are on the roadmap.",

  /**
   * The four tones, as the landing page names them.
   *
   * `TONE_INFO` in `src/game/gates.ts` reads this rather than owning it: the
   * prerender may import only `src/brand.ts` (it is data → HTML, never the game
   * engine), and one copy is better than two that can drift apart.
   */
  tones: {
    1: { pinyin: "mā", hanzi: "媽", cue: "say it flat and high" },
    2: { pinyin: "má", hanzi: "麻", cue: "start mid, slide up" },
    3: { pinyin: "mǎ", hanzi: "馬", cue: "dip low, then rise" },
    4: { pinyin: "mà", hanzi: "罵", cue: "drop sharply top to bottom" },
  },

  /**
   * PRD §11, stated in the product rather than only in the spec. Shown as
   * small pill tags at the foot of the "based on real speech" section.
   */
  limits: [
    "Not pronunciation scoring",
    "Not a fluency app",
    "One syllable at a time",
    "No AI, just maths",
  ],

  visualiser: {
    eyebrow: "The other half of the app",
    title: "Understand how to use your voice",
    body: "Say mǎ ten times in a row and watch every attempt stack on the target shape. No score, no pressure, no gate to clear. Helps you understand how to voice each tone properly.",
    cta: "Open the visualiser",
    imageCaption: "mǎ — three attempts stacked on the target shape",
  },

  mobile: {
    eyebrow: "On mobile",
    title: "Mobile app",
    body: "iOS and Android apps aren't out yet. A native app would add offline play, practice reminders and a streak you can keep, sign up below to get notified when it's out!",
    notify: {
      placeholder: "you@example.com",
      cta: "Notify me",
      disclaimer: "Only for FlappyTone updates. No spam, unsubscribe anytime.",
    },
    homeScreen: {
      title: "In the meantime, add it to your home screen",
      body: "Same effect as an app icon: full screen, no URL bar eating a fifth of the display.",
      ios: {
        label: "iPhone / iPad (Safari or Chrome)",
        steps: [
          { icon: "share", text: "Open this page, then tap Share" },
          { icon: "add", text: "Tap Add to Home Screen" },
        ],
      },
      android: {
        label: "Android",
        steps: [
          { icon: "menu", text: "Open this page in Chrome, then tap ⋮" },
          { icon: "add", text: "Tap Install app" },
        ],
      },
    },
  },

  comingSoon: {
    eyebrow: "Coming next",
    title: "More tones to fly, coming next",
    body: "Right now it's 120 one-syllable words and four tones. Good for starters. Next: a bigger word list, tone-pair drills and eventually more accents. Get notified when new words ship.",
    items: [
      { label: "Next", title: "A bigger word list" },
      { label: "Then", title: "Tone-pair drills" },
      { label: "Later", title: "More accents & languages" },
    ],
    placeholder: "you@example.com",
    cta: "Notify me",
    disclaimer: "One list. Only for FlappyTone updates, no spam, unsubscribe anytime.",
  },

  /** Footer credit for the reference clips. Jane recorded them; say so. */
  attribution:
    "Reference audio: Jane, a native Taiwanese speaker, used with permission.",

  /**
   * Footer content beyond the attribution line above: a brand blurb, a
   * built-by line, and the Connect column of external links. See
   * `docs/_archive/redesign/footer-template.tsx` for the layout this was adapted from
   * — that file explains what was deliberately dropped (no legal/newsletter
   * columns; FlappyTone has neither yet).
   */
  footer: {
    blurb: "A tiny voice-controlled game for practicing Mandarin tones.",
    builtByPrefix: "Built while 🏄 by",
    connectHeading: "Connect",
    connect: [
      { href: "https://pierrebuilds.dev", label: "pierrebuilds.dev", external: true, icon: "web" },
      { href: "https://x.com/pierreBuildsDev", label: "Follow on X", external: true, icon: "x" },
      {
        href: "https://www.buymeacoffee.com/pierrebuilds",
        label: "Buy me a bubble tea",
        external: true,
        icon: "coffee",
      },
      { href: "mailto:pierre@pierrebuilds.dev", label: "pierre@pierrebuilds.dev", external: false, icon: "mail" },
    ],
  },

  /** In DOM order as they appear in `Landing.tsx` — Nav renders `inNav`
   *  entries in this array's order, so a section moved in the page has to
   *  move here too or the nav links stop matching the scroll order. */
  sections: [
    { id: "top", title: "FlappyTone" },
    { id: "demo", title: "See it" },
    { id: "play", title: "Play", navLabel: "Play", inNav: true },
    {
      id: "how-it-works",
      title: "How it works",
      navLabel: "How it works",
      inNav: true,
    },
    {
      id: "visualiser",
      title: "Tone visualiser",
      navLabel: "Visualiser",
      inNav: true,
    },
    {
      id: "real-speech",
      title: "Based on real speech, not the textbook",
      navLabel: "Real speech",
      inNav: true,
    },
    { id: "coming-soon", title: "Get notified" },
    { id: "mobile", title: "Mobile app", navLabel: "Mobile", inNav: true },
  ] as LandingSection[],
} as const;
