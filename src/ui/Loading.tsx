import { SpinningPip } from "./bird";

/**
 * A reusable loading state: the spinning Pip (see `src/ui/bird`) with an
 * optional line of text under it. Prop-light so it can front any short wait —
 * grid seeding today, whatever else later.
 */
interface Props {
  /** One line under the pip, e.g. "We're personalising your grid for you". */
  label?: string;
}

export function Loading({ label }: Props) {
  return (
    <div className="screen loading-screen" role="status" aria-live="polite">
      <SpinningPip className="loading-pip" />
      {label && <p className="note loading-label">{label}</p>}
    </div>
  );
}
