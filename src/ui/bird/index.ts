/**
 * Bird animations for UI chrome. `PipCanvas` is the reusable canvas+rAF host;
 * each animation is a thin component pairing it with a draw function from
 * `src/render/pipAnimations.ts`. Add a new one alongside `SpinningPip`.
 */
export { PipCanvas } from "./PipCanvas.tsx";
export { SpinningPip } from "./SpinningPip.tsx";
