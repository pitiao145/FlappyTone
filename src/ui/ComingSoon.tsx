import { useId } from "react";
import { brand } from "../brand.ts";

/**
 * Email capture, placeholder only.
 *
 * Pierre wires this to the real Kit form embed later. Until then the form is
 * inert: submitting prevents the page reload and does nothing else. No
 * fetch, no storage, no network call belongs here.
 */
export function ComingSoon() {
  const inputId = useId();

  return (
    <section id="coming-soon" className="landing-section landing-coming-soon">
      <h2>{brand.comingSoon.title}</h2>
      <p>{brand.comingSoon.body}</p>
      <form
        className="coming-soon-form"
        onSubmit={(e) => {
          e.preventDefault();
          // TODO(pierre): wire to Kit form embed
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          Email address
        </label>
        <input
          id={inputId}
          type="email"
          name="email"
          placeholder={brand.comingSoon.placeholder}
          autoComplete="email"
          required
        />
        <button type="submit" className="primary">
          {brand.comingSoon.cta}
        </button>
      </form>
      <p className="note">{brand.comingSoon.disclaimer}</p>
    </section>
  );
}
