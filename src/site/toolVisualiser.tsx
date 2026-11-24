/**
 * Brief 53: the tone visualizer tool runs the app's own Visualiser, in tool
 * mode. Lazy, like `toolMic.ts`: loaded on the first Start press only.
 */
import { useMemo } from "react";
import type { ArrivalTarget } from "../ui/toolEntry.ts";
import { Visualiser, type ToolMode } from "../ui/Visualiser.tsx";
import { toolSettings } from "./toolMic.ts";

/** The app Visualiser in tool mode, sized by the page. The mic must already be open. */
export function ToolVisualiser({
  width,
  height,
  tool,
  arrival,
}: {
  width: number;
  height: number;
  tool: ToolMode;
  /** The tone or pair to open on (the page's `?tone=`, Tone 3 by default). */
  arrival: ArrivalTarget | null;
}) {
  // Read once per mount: a voice chosen or a calibration made meanwhile
  // shows on the next visit, as in the app.
  const settings = useMemo(() => toolSettings(), []);
  if (!settings) return null;
  return (
    <Visualiser
      settings={settings}
      tier="free"
      tool={tool}
      arrival={arrival}
      canvasWidth={width}
      canvasHeight={height}
    />
  );
}
