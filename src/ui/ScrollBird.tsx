import { useEffect, useRef } from "react";
import { Pip } from "../site/Pip.tsx";

/**
 * The scroll indicator: the bird in a small round button, bottom-left. It
 * turns as you scroll, one full loop from the top of the page to the bottom,
 * and a tap flies back to the top. Written straight to the DOM from one rAF,
 * never React state (hard rule 1).
 */
export function ScrollBird() {
  const bird = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      if (bird.current) bird.current.style.transform = `rotate(${(p * 360).toFixed(1)}deg)`;
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <a className="sky-scrollbird" href="#top" aria-label="Back to top">
      <span ref={bird} className="sky-scrollbird-bird" aria-hidden="true">
        <Pip size={28} />
      </span>
    </a>
  );
}
