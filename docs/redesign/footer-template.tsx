/**
 * REFERENCE ONLY — not wired into the app.
 *
 * Adapted from easy-card-balance-checker/app/components/Footer.js (Next.js +
 * Tailwind) into FlappyTone's stack (plain React + CSS custom properties from
 * src/ui/tokens.css). Dropped, deliberately, from the EasyCard original:
 *
 * - NoteStrip (the "card numbers are relayed to EasyCard..." bar) — that's a
 *   EasyCard-specific compliance notice, nothing to port.
 * - The "Legal / Privacy Policy" column — FlappyTone has no privacy page and
 *   collects far less (mic audio never leaves the device; analytics is
 *   consent-gated and documented in Settings). Nothing to link to yet.
 * - NewsletterModal + isNewsletterSubscribed wiring — EasyCard's footer opens
 *   a real subscribe modal. Pierre wants FlappyTone's capture to stay a
 *   placeholder for now (a real-looking form, no submit handler) until a Kit
 *   form replaces it — see the TODO in FooterCapture below. Also: per Pierre's
 *   call, FlappyTone gets ONE email ask on the page, in the dedicated
 *   "coming soon" section (see the brief) — not a second one here. So this
 *   reference footer has no capture box at all; the brief explains why.
 *
 * Kept, adapted to FlappyTone's tokens/voice:
 * - The three-column layout (brand blurb+built-by / connect links).
 * - pierrebuilds.dev + Buy Me a Bubble Tea + email as "Connect" links (EasyCard
 *   pattern), plus an X link added per Pierre's confirmation (EasyCard's
 *   footer doesn't have one; FlappyTone's should, per the distribution plan
 *   in Pierrebuilds HQ).
 * - Jane's attribution line, unchanged — it's FlappyTone's own, not EasyCard's.
 *
 * Icons here are inlined for legibility in this reference. When integrating,
 * follow src/ui/icons.tsx's existing pattern (see PauseIcon/PlayIcon/GearIcon/
 * HeartIcon) — add WebIcon/XIcon/CoffeeIcon/MailIcon there instead of leaving
 * raw SVG in Footer.tsx, for consistency with how every other icon in this
 * codebase is organized.
 *
 * Copy is written here as literals for readability, but per brand.ts's own
 * header comment ("copy lives in src/brand.ts ... this file is layout"), the
 * brief requires moving every string below into a new `brand.footer` object
 * before this is considered done. Do not ship this file's hardcoded strings.
 */

interface ConnectLink {
  href: string;
  label: string;
  external: boolean;
  icon: "web" | "x" | "coffee" | "mail";
}

const CONNECT_LINKS: ConnectLink[] = [
  { href: "https://pierrebuilds.dev", label: "pierrebuilds.dev", external: true, icon: "web" },
  { href: "https://x.com/PierreBuilds", label: "Follow on X", external: true, icon: "x" },
  {
    href: "https://www.buymeacoffee.com/pierrebuilds",
    label: "Buy me a bubble tea",
    external: true,
    icon: "coffee",
  },
  { href: "mailto:pierre@pierrebuilds.dev", label: "pierre@pierrebuilds.dev", external: false, icon: "mail" },
];

function ConnectIcon({ kind }: { kind: ConnectLink["icon"] }) {
  switch (kind) {
    case "web":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.6L4.5 22H1.4l8.2-9.4L1 2h7l4.9 6L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
        </svg>
      );
    case "coffee":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" />
          <line x1="6" y1="2" x2="6" y2="4" />
          <line x1="10" y1="2" x2="10" y2="4" />
          <line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      );
    case "mail":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
  }
}

/**
 * Adapted footer — brand blurb + built-by line, a Connect column, Jane's
 * attribution. No email capture here; that lives in the dedicated
 * "coming soon" section higher up the page (see the brief, Task 4).
 *
 * Class names below are proposals, not gospel — match whatever the
 * `.landing-footer` selector already does in App.css and extend it, rather
 * than introducing a parallel naming scheme.
 */
export function Footer() {
  return (
    <footer className="landing-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          {/* TODO(brand.ts): pull from brand.footer.blurb / brand.footer.builtBy */}
          <p className="footer-blurb">
            A tiny voice-controlled game for practicing Mandarin tones.
          </p>
          <p className="footer-builtby">
            Built by Pierre, an indie dev in Taiwan.
          </p>
        </div>

        <div className="footer-connect">
          <h3>Connect</h3>
          <ul>
            {CONNECT_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="footer-link"
                >
                  <span className="footer-link-icon">
                    <ConnectIcon kind={link.icon} />
                  </span>
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Existing line — brand.attribution, unchanged. Keep it visually
          distinct from the Connect column (it's a credit, not a link list). */}
      <p className="note footer-attribution">
        Reference audio: Jane, a native Taiwanese speaker, recorded direct to
        mic and used with permission.
      </p>
    </footer>
  );
}
