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
  headline: "Practice Mandarin tones the fun way",
  tagline: "Your voice is the controller.",
  /** One sentence, under the tagline. Say what it does, not what it feels like. */
  pitch:
    "Fly through corridors shaped like Mandarin tone marks by producing the matching tone. Your pitch is the flight path.",
  /** PRD §8 requires this to be visible before the mic is ever requested. */
  requirement: "Needs a microphone and a quiet room.",

  /** Hero's second button — scrolls to the #mobile home-screen instructions. */
  installCta: "Install on your phone",

  privacyNote:
    "Your voice is processed on your device, never uploaded or stored.",

  /** Caption under the demo loop. */
  demoCaption: "Flappytone in action.",

  /** Subhead + lead-in above the four tone cards. */
  toneDataTitle: "Based on real-life data",
  toneDataIntro:
    "These aren't the textbook tone marks. Every corridor is measured from a native Taiwanese speaker's own voice.",

  /** The three beats under "How it works". */
  howItWorks: [
    {
      title: "Your pitch moves the dot",
      body: "The game listens and maps your voice onto the screen, live. Higher voice, higher dot, no buttons, no taps.",
    },
    {
      title: "The corridor is the tone mark",
      body: "The four tone marks are pitch diagrams. The gap you fly through is the shape you have to say, so the obstacle and the lesson are the same thing.",
    },
    {
      title: "Hear it, then answer it",
      body: "Each gate plays a native recording first. You listen, then you say it, and you see your contour against the target as you go.",
    },
  ],

  /**
   * The four tones, as the landing page names them.
   *
   * `TONE_INFO` in `src/game/gates.ts` reads this rather than owning it: the
   * prerender may import only `src/brand.ts` (it is data → HTML, never the game
   * engine), and one copy is better than two that can drift apart.
   */
  tones: {
    1: { pinyin: "mā", hanzi: "妈", cue: "say it flat and high" },
    2: { pinyin: "má", hanzi: "麻", cue: "start mid, slide up" },
    3: { pinyin: "mǎ", hanzi: "马", cue: "dip low, then rise" },
    4: { pinyin: "mà", hanzi: "骂", cue: "drop sharply top to bottom" },
  },

  /** PRD §11, stated in the product rather than only in the spec. */
  limits: [
    "It checks your pitch contour, not your pronunciation, humming will beat it. It's a tone trainer, not a pronunciation checker.",
    "Single syllables only. No sandhi, no connected speech, no sentences yet.",
  ],

  visualiser: {
    title: "Can't hear the difference between mǎ and mà? Visualise it instead.",
    body: "Say a tone as many times as you like and watch every attempt stack on the target shape, no gates, no score, no pressure. It's the fastest way to see what your voice is actually doing.",
    cta: "Try the visualiser",
  },

  mobile: {
    title: "Mobile app",
    body: "iOS and Android apps aren't out yet. A native app would add offline play, practice reminders and a streak you can keep, but there's nothing to install from a store today.",
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
    title: "More words, and your own tone history, coming next",
    body: "Right now it's one syllable, four tones, enough to test whether the mechanic works. Next up: a bigger word list, and a page that shows how your tone shapes change over time as you practice. Want to know when it ships?",
    placeholder: "you@example.com",
    cta: "Notify me",
    disclaimer: "Only for FlappyTone updates. No spam, unsubscribe anytime.",
  },

  /** Footer credit for the reference clips. Jane recorded them; say so. */
  attribution:
    "Reference audio: Jane, a native Taiwanese speaker, used with permission.",

  /**
   * Footer content beyond the attribution line above: a brand blurb, a
   * built-by line, and the Connect column of external links. See
   * `docs/redesign/footer-template.tsx` for the layout this was adapted from
   * — that file explains what was deliberately dropped (no legal/newsletter
   * columns; FlappyTone has neither yet).
   */
  footer: {
    blurb: "A tiny voice-controlled game for practicing Mandarin tones.",
    builtByPrefix: "Built while 🏄 by",
    connectHeading: "Connect",
    connect: [
      { href: "https://pierrebuilds.dev", label: "pierrebuilds.dev", external: true, icon: "web" },
      { href: "https://x.com/PierreBuilds", label: "Follow on X", external: true, icon: "x" },
      {
        href: "https://www.buymeacoffee.com/pierrebuilds",
        label: "Buy me a bubble tea",
        external: true,
        icon: "coffee",
      },
      { href: "mailto:pierre@pierrebuilds.dev", label: "pierre@pierrebuilds.dev", external: false, icon: "mail" },
    ],
  },

  sections: [
    { id: "top", title: "FlappyTone" },
    { id: "demo", title: "See it" },
    {
      id: "visualiser",
      title: "Tone visualiser",
      navLabel: "Visualiser",
      inNav: true,
    },
    {
      id: "how-it-works",
      title: "How it works",
      navLabel: "How it works",
      inNav: true,
    },
    { id: "play", title: "Play", navLabel: "Play", inNav: true },
    { id: "coming-soon", title: "Get notified" },
    { id: "limits", title: "What it doesn't do" },
    { id: "mobile", title: "Mobile app", navLabel: "Mobile", inNav: true },
  ] as LandingSection[],
} as const;
