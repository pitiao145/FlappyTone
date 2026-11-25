/**
 * Brief 54's screenshot page (`shots.html`, dev only, not a build input).
 *
 * Mounts `GameApp` without `AuthGate`: the harness has no account, and the
 * screens it shoots do not depend on one. The harness seeds localStorage
 * (calibration, a dev tier) before this loads, and reaches states either by
 * real clicks or by GameApp's dev-only `window.__ftShots` hook.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import GameApp from "../../app/GameApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameApp />
  </StrictMode>,
);
