import { brand } from "../brand.ts";
import { CoffeeIcon, MailIcon, WebIcon, XIcon } from "./icons.tsx";

const CONNECT_ICONS = {
  web: WebIcon,
  x: XIcon,
  coffee: CoffeeIcon,
  mail: MailIcon,
} as const;

/**
 * Page footer: brand blurb + built-by line, a Connect column of external
 * links, then the existing clip-attribution line (kept visually distinct —
 * it's a credit, not a nav item). All copy comes from `brand.footer` /
 * `brand.attribution`; this file is layout only, same rule as `Landing.tsx`.
 *
 * Adapted from `docs/redesign/footer-template.tsx` — see that file's header
 * comment for what was dropped from the EasyCard original (legal column,
 * newsletter modal) and why. No email capture here; that ask lives in
 * `ComingSoon.tsx`, higher up the page.
 */
export function Footer() {
  return (
    <footer className="landing-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <p className="footer-blurb">{brand.footer.blurb}</p>
          <p className="footer-builtby">{brand.footer.builtBy}</p>
        </div>

        <div className="footer-connect">
          <h3>{brand.footer.connectHeading}</h3>
          <ul>
            {brand.footer.connect.map((link) => {
              const Icon = CONNECT_ICONS[link.icon];
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="footer-link"
                  >
                    <span className="footer-link-icon">
                      <Icon />
                    </span>
                    <span>{link.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="note footer-attribution">{brand.attribution}</p>
    </footer>
  );
}
