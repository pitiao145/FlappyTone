import { useId, useState } from "react";
import { brand } from "../brand.ts";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

/** Email capture, wired to the Kit form via `api/newsletter.ts`. */
export function ComingSoon() {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const { status, error, submit } = useNewsletterSubscribe();

  return (
    <section id="coming-soon" className="landing-section landing-coming-soon">
      <h2>{brand.comingSoon.title}</h2>
      <p>{brand.comingSoon.body}</p>
      {status === "success" ? (
        <p className="coming-soon-success">You&rsquo;re on the list.</p>
      ) : (
        <form
          className="coming-soon-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(email);
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
          />
          <button type="submit" className="primary" disabled={status === "loading"}>
            {status === "loading" ? "Joining…" : brand.comingSoon.cta}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="coming-soon-disclaimer">{brand.comingSoon.disclaimer}</p>
    </section>
  );
}
