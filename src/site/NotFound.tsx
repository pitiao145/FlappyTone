import { ScrollBird } from "../ui/ScrollBird.tsx";
import { Nav } from "../ui/Nav.tsx";
import { Footer } from "../ui/Footer.tsx";
import { appHref } from "../ui/appLink.ts";
import { LEARN_LINKS } from "./links.ts";

/**
 * The body of `dist/404.html` (written by `src/dev/prerender.ts`). Static: the
 * page ships without the client bundle, so it is plain links, no hooks.
 */
export function NotFoundPage() {
  return (
    <div id="top" className="sky sky-site">
      <Nav linkBase="/" playHref={appHref()} />
      <ScrollBird />
      <main className="sky-site-main">
        <div className="screen legal-screen site-page">
          <article className="legal-body">
            <h1>Page not found</h1>
            <p className="site-answer">
              <strong>
                That page does not exist. Start with the guide to the four
                Mandarin tones, or pick a tool below.
              </strong>
            </p>
            <p>
              <a href="/chinese-tones">The four Mandarin tones, explained</a>
            </p>
            <ul>
              {LEARN_LINKS.filter((l) => l.href !== "/chinese-tones").map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
              <li>
                <a href="/">FlappyTone home</a>
              </li>
            </ul>
          </article>
        </div>
      </main>
      <div className="sky-footer">
        <Footer />
      </div>
    </div>
  );
}
