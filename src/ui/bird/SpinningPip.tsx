import { drawSpinningPip } from "../../render/pipAnimations.ts";
import { PipCanvas } from "./PipCanvas.tsx";

/**
 * The Pip spinning fast about its own body centre. A loading/wait indicator.
 * The template for future bird animations: a thin wrapper pairing `PipCanvas`
 * with one draw function from `render/pipAnimations.ts`.
 */
export function SpinningPip({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <PipCanvas
      size={size}
      className={className}
      render={(ctx, { size, t }) => drawSpinningPip(ctx, size, t)}
    />
  );
}
