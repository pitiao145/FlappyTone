/**
 * A reusable loading state: the mascot spinning about its own centre, with an
 * optional line of text under it. Deliberately self-contained and prop-light so
 * it can front any short wait (grid seeding today; whatever else later).
 */
interface Props {
  /** One line under the pip, e.g. "We're personalising your grid for you". */
  label?: string;
}

export function Loading({ label }: Props) {
  return (
    <div className="screen loading-screen" role="status" aria-live="polite">
      <img src="/Bird-hor-halo.png" alt="" className="loading-pip" aria-hidden />
      {label && <p className="note loading-label">{label}</p>}
    </div>
  );
}
