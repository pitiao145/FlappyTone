import type { Testimonial as Quote } from "./testimonials.ts";
import "./testimonial.css";

/** One player quote card: the landing page's proof row and the demo's end screen. */
export function Testimonial({ quote, className }: { quote: Quote; className?: string }) {
  return (
    <figure className={className ? `sky-testimonial ${className}` : "sky-testimonial"}>
      <blockquote>{quote.text}</blockquote>
      <figcaption>
        <img src={`/lp/birds/${quote.bird}.webp`} width={48} height={48} alt="" loading="lazy" />
        <cite>{quote.who}</cite>
      </figcaption>
    </figure>
  );
}
