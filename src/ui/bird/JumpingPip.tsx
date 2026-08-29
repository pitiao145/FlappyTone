import { drawJumpingPip } from "../../render/pipAnimations.ts";
import { PipCanvas } from "./PipCanvas.tsx";

/**
 * The Pip hopping up and down, excited. A celebratory indicator — used on the
 * tutorial success screen. A thin wrapper pairing `PipCanvas` with one draw
 * function from `render/pipAnimations.ts`, like `SpinningPip`.
 */
export function JumpingPip({
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
      render={(ctx, { size, t }) => drawJumpingPip(ctx, size, t)}
    />
  );
}
