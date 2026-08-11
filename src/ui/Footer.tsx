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
 * links, then an attribution + copyright row. All copy comes from
 * `brand.footer` / `brand.attribution`; this file is layout only, same rule
 * as `Landing.tsx`.
 *
 * Same navy/gold footer as the EasyCard app it was adapted from, minus what
 * doesn't apply here: EasyCard-specific copy, the Legal column, the
 * newsletter signup box, the "independent tool" disclaimer, and the
 * card-number handling notice.
 */
export function Footer() {
  return (
    <footer className="landing-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <p className="footer-blurb">{brand.footer.blurb}</p>
          <p className="footer-builtby">
            {brand.footer.builtByPrefix}{" "}
            <a href="https://pierrebuilds.dev" target="_blank" rel="noopener noreferrer" className="footer-builtby-link">
              pierrebuilds.dev
            </a>
          </p>
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

      <div className="footer-bottom">
        <p className="footer-copyright">© {new Date().getFullYear()} pierrebuilds.dev</p>
        <p className="footer-attribution">{brand.attribution}</p>
      </div>
    </footer>
  );
}
