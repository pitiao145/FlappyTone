import { breadcrumbsFor } from "./links.ts";

/** Visible breadcrumb trail; the BreadcrumbList JSON-LD comes from the same data (`links.ts`). */
export function Breadcrumbs({ path }: { path: string }) {
  const crumbs = breadcrumbsFor(path);
  if (crumbs.length < 2) return null;
  return (
    <nav className="site-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => (
          <li key={c.path}>
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.name}</span>
            ) : (
              <a href={c.path}>{c.name}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
