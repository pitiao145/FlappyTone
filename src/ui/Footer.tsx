import { brand } from "../brand.ts";
import { LEARN_LINKS } from "../site/links.ts";
import { CoffeeIcon, MailIcon, WebIcon, XIcon } from "./icons.tsx";

const CONNECT_ICONS = {
  web: WebIcon,
  x: XIcon,
  coffee: CoffeeIcon,
  mail: MailIcon,
} as const;

/**
 * The marketing site's footer (Sky, `src/site/site.css`): one outlined cloud
 * panel with the brand blurb, the Learn links and the Connect links, in one
 * row from tablet up; then a row with the copyright, the legal links and the
 * attribution. All copy comes from `brand.footer` / `brand.attribution`; this
 * file is layout only.
 */
export function Footer() {
  return (
    <footer className="sky-footer">
      <div className="sky-footer-grid">
        <div className="sky-footer-brand">
          <p>{brand.footer.blurb}</p>
          <p>
            {brand.footer.builtByPrefix}{" "}
            <a href="https://pierrebuilds.dev" target="_blank" rel="noopener noreferrer">
              pierrebuilds.dev
            </a>
          </p>
        </div>

        <nav aria-label={brand.footer.learnHeading}>
          <h3>{brand.footer.learnHeading}</h3>
          <ul>
            {LEARN_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="sky-footer-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3>{brand.footer.connectHeading}</h3>
          <ul>
            {brand.footer.connect.map((link) => {
              const Icon = CONNECT_ICONS[link.icon];
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="sky-footer-link"
                  >
                    <span className="sky-footer-icon" aria-hidden="true">
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

      <div className="sky-footer-bottom">
        <p>© {new Date().getFullYear()} pierrebuilds.dev</p>
        <p className="sky-footer-legal">
          <a href="/terms-of-service">Terms of Service</a>
          <a href="/privacy-policy">Privacy Policy</a>
        </p>
        <p>{brand.attribution}</p>
      </div>
    </footer>
  );
}
