import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../App.css";
import { initPostHog } from "../analytics/posthog.ts";
import { loadShareData } from "../game/settings";
import { routeFor } from "./routes.ts";
import { SitePage } from "./pages.tsx";
import { pageViewProps } from "./pageAnalytics.ts";
import { setAppLinkSource } from "../ui/appLink.ts";

/** Client entry for every `shell: "site"` route (see `site.html`). */
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const route = routeFor(path);
if (route) setAppLinkSource(route.path);
initPostHog(loadShareData(), route ? pageViewProps(route) : undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SitePage path={path} />
  </StrictMode>,
);
