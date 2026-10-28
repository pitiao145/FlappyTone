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
  /** PRD §8 requires this to be visible before the mic is ever requested. */
  requirement: "Needs a microphone and a quiet room.",

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
    title: "Imagine seeing your pitch as you speak it.",
    body: "mā, má, mǎ, mà trace four different pitch shapes every time a native speaker says them, that's literally what the tone marks are. Once you make that audio-to-visual connection, tones get a lot more approachable. Watching the shape as you speak trains your voice to actually produce the right pitch changes, and it doesn't take long before you start recognizing tones by ear too, without even trying.\n" +
      "This runs on nothing but pitch-detection math in your browser. No model, no upload, no AI.",
  },

  /** Subhead + lead-in above the four tone cards. */
  toneDataTitle: "Trained on the voice of a native Mandarin speaker from Taiwan",

  /** The line about Jane, with "Jane's Mandarin" linked. Placeholder copy, to be edited. */
  jane: {
    before: "Jane is also the founder of ",
    linkText: "Jane's Mandarin",
    after: ", where she helps heritage learners reconnect with their roots through Taiwanese Mandarin.",
    href: "https://janesmandarin.com/",
  },

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
    "Real speech, not flashcards",
    "No AI, just maths",
  ],

  /** "Why this isn't textbook practice" — problem framing, sits between
   *  how-it-works and the visualiser deep-dive. */
  notTextbook: {
    eyebrow: "Not another textbook drill",
    title: "You don't study tones. You feel them.",
    body: "Most tone practice is a chart and a list of rules: memorize the shape, repeat the syllable, move on. It doesn't stick. Seeing the tone as you speak it, and watching your own voice trace the shape in real time, builds a mental image most people never get from a textbook. It doesn't really feel like practicing, but you're building muscle memory the whole time.",
    quote: "“Really cool. I have been here for three years and my tones are shit! This is really great.”",
    quoteAttribution: "— r/taiwan",
  },

  /** Tone Pairs, live and player-reachable: real two-syllable words. */
  tonePairs: {
    eyebrow: "Now live",
    title: "Real two-syllable words, not just single tones",
    body: "Most tone trainers stop at one syllable. FlappyTone doesn't. Tone Pairs mode flies real two-syllable words, 好玩, 以前, and 240+ more, with a corridor shaped from the exact recording, sandhi and all. Shuffle across every combo, or drill the one that keeps beating you.",
    cta: "Try Tone Pairs",
    quote: "“Tone pairs are what I need most, 3-3 still gets me.”",
    quoteAttribution: "— an early tester",
  },

  /** Modes and settings, now that there are enough of them to be worth listing. */
  options: {
    eyebrow: "Your game, your way",
    title: "Pick how you practise",
    body: "Same voice-controlled bird, shaped around where you are with the tones.",
    modesTitle: "Game modes",
    modes: [
      { title: "Classic", body: "A scored run of random words. Hearts, combos, and a difficulty that climbs." },
      { title: "Tone Drill", body: "Choose one tone and fly it again and again until it sticks." },
      { title: "Learn", body: "Hum along with the demo's shape. A gentle way to meet each tone." },
      { title: "Tone Pairs", body: "Two-syllable words, shuffled or drilled one combo at a time." },
    ],
    settingsTitle: "Settings",
    settings: [
      {
        title: "Speech style",
        choices: "Standard · Spoken",
        body: "Standard is slow, clear, textbook-style pronunciation. Spoken is a bit faster, the way people really talk.",
      },
      {
        title: "Words",
        choices: "Beginner · Intermediate",
        body: "Beginner flies single syllables. Intermediate mixes in two-syllable pairs.",
      },
      {
        title: "Tunnel width",
        choices: "Narrow · Normal · Wide",
        body: "Make the corridor forgiving while a tone is new, or demanding once it isn't.",
      },
    ],
    cta: "Try it",
  },

  /** Weekly leaderboard. */
  leaderboard: {
    eyebrow: "Compete",
    title: "A real leaderboard, week, month, or all-time",
    body: "Sign up free and every run counts toward your rank. See where you stand this week, this month, or against everyone who's ever played, and come back to defend your spot.",
    cta: "See the board",
  },

  /** Free vs Pro, pulled from live tier limits so it can't drift. */
  pricing: {
    eyebrow: "Free to play",
    title: "Free to start, one-time to go further",
    quote: "“I can not continue studying Chinese without this app. I depend on it so much.”",
    quoteAttribution: "— EarlyBird player, over email",
    free: {
      label: "Free",
      cta: "Start free",
    },
    pro: {
      label: "Pro",
      cta: "Go Pro",
    },
  },

  faq: [
    {
      q: "Does this teach me to speak naturally?",
      a: "No. It's built for muscle memory on the four tones, not fluency. Words are pronounced clearly and a bit exaggerated on purpose, that's what makes the shape learnable.",
    },
    {
      q: "Is this AI?",
      a: "No generative AI anywhere. Your voice never leaves your device, it's just pitch-detection math running in the browser.",
    },
    {
      q: "Is this exam prep for TOCFL or HSK?",
      a: "No. Words are picked using the TOCFL beginner lists because they're a good, real answer to what to learn first, not because this trains you for a test. This is about pronunciation, not certification.",
    },
    {
      q: "Why Taiwan pronunciation and not Beijing?",
      a: "That's the only accent recorded so far. Regional variation in tone contours is real, more accents are on the roadmap.",
    },
    {
      q: "What are tone pairs?",
      a: "Real two-syllable words, not single syllables drilled in isolation. The corridor shape comes straight from the recording, sandhi included.",
    },
    {
      q: "Do I need an account?",
      a: "No, you can play as a guest. An account saves your progress across devices and gets you on the leaderboard.",
    },
  ],

  visualiser: {
    eyebrow: "The other half of the app",
    title: "Understand how to use your voice",
    body: "Say mǎ ten times in a row and watch every attempt stack on the target shape. No score, no pressure, no gate to clear. Helps you understand how to voice each tone properly.",
    cta: "Open the visualiser",
    imageCaption: "mǎ, average pronunciation of a native Taiwanese speaker",
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
    learnHeading: "Learn & tools",
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
      { href: "https://peerpush.com/p/flappytone", label: "PeerPush", external: true, icon: "web" },
    ],
  },

  /** In DOM order as they appear on the landing page (`src/ui/landing/SkyLanding.tsx`).
   *  The site pages' Nav renders the `inNav` entries as `/#id` links in this
   *  order, so a section moved or renamed on the page has to change here too. */
  sections: [
    { id: "top", title: "FlappyTone" },
    { id: "demo", title: "Try it now" },
    { id: "how-it-works", title: "How it works", navLabel: "How it works", inNav: true },
    { id: "real-speech", title: "Based on real speech, not the textbook", navLabel: "Real speech" },
    { id: "visualiser", title: "Tone visualiser", navLabel: "Visualiser", inNav: true },
    { id: "progress", title: "See your tones take shape", navLabel: "Track progress", inNav: true },
    { id: "tone-pairs", title: "Tone pairs", navLabel: "Tone pairs" },
    { id: "options", title: "Game modes and settings" },
    { id: "leaderboard", title: "Leaderboard", navLabel: "Leaderboard" },
    { id: "pricing", title: "Free to start, one-time to go further", navLabel: "Pricing", inNav: true },
    { id: "faq", title: "Questions" },
    { id: "mobile", title: "Mobile app", navLabel: "Mobile" },
    { id: "founder", title: "Made by a Mandarin learner" },
  ] as LandingSection[],
  /**
   * The landing page's own lines (`src/ui/landing/SkyLanding.tsx`). Titles,
   * lists and quotes it shares with the rest of the site stay in their own
   * fields above; these are the shorter bodies the Sky design uses.
   */
  landing: {
    /**
     * The page's `h1`. Catchy on purpose, not the search phrase: the `<title>`
     * (index.html, routes.ts) carries the keywords. Never the brand name: a
     * brand-name `h1` is part of what got the sibling project deindexed.
     */
    headline: "Finally nail the Mandarin tones",
    lede: "Your voice flies a bird through tunnels shaped like each tone. You build muscle memory without it feeling like study.",
    privacy: "Needs a microphone and a quiet room. Your voice stays on your device: no upload, no AI.",
    why: [
      "mā, má, mǎ, mà trace four different pitch shapes. That is all a tone mark is.",
      "See the shape as you speak and your voice learns to make it. Your ear soon follows.",
    ],
    tunnels:
      "Each tunnel is the tone of the word you hear, cut from a real recording of a native speaker. Pick a word to see its gate.",
    realSpeech:
      "450+ recorded words in Traditional characters and Taiwan pronunciation, in TOCFL order, so the first words are the useful ones. A shape that differs from your textbook is a real accent, not a bug.",
    averages: "The bold line is the average. The faint lines are every real take.",
    notTextbook:
      "Most tone practice is a chart and rules to memorize, and it doesn't stick. Watching your own voice trace the shape gives you the picture a textbook never does.",
    visualiser: "Say mǎ ten times and watch every try stack on the target shape. No score, no pressure.",
    /** The Progress section (`src/ui/landing/ProgressSection.tsx`). No name for the native speaker. */
    progress: {
      title: "See your tones take shape",
      lede: "FlappyTone keeps your results, so you can see what is improving and what is not.",
      source: "Real screens from the founder's account",
      shape: {
        badge: "Pro",
        title: "Your tone next to a native speaker's",
        alt: "Screen recording of the tone evolution view. A native speaker's average pitch shape is drawn with the player's average now and from an earlier date, and the player's line moves closer to the native curve.",
      },
      accuracy: {
        badges: ["Free: last 5 runs", "Pro: every run"],
        title: "Accuracy per tone",
        alt: "Accuracy per tone for the last 5 runs: tone 1 86 percent, tone 2 68, tone 3 56, tone 4 76. Buttons switch between the last 5 runs, last 50 runs and all time.",
      },
      trend: {
        badge: "Pro",
        title: "Accuracy progress",
        alt: "Line chart of tone 1 accuracy by day in October, climbing from 65 percent on the 1st to 96 percent on the 26th.",
      },
    },
    pairsTitle: "Level up to tone pairs when you're ready",
    pairs: "Once single tones feel easy, Tone Pairs flies two syllables at a time: 好玩, 以前 and 240+ more. Each corridor comes from the exact recording, sandhi and all.",
    leaderboard: "Sign up free and every run counts. This week, this month or all-time.",
    mobile: "Native apps aren't out yet. They'll add offline play, reminders and a streak. Get told when they ship:",
    founder: [
      "I'm Pierre, and I'm learning Mandarin too.",
      "I realised I learn far better with visuals than with audio alone, so I built a way to see the tones, not just hear them. Every word is recorded by a native speaker from Taiwan. Questions or ideas? Write to me.",
    ],
  },
} as const;
