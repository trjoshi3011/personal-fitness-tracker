"use client";

import { useEffect, useState } from "react";

/** Keep navigation quiet while reading, and reveal it on intentional upward scrolling. */
export function useScrollChrome() {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    let anchor = Math.max(0, window.scrollY);
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      if (y <= 80) {
        setFaded(false);
        anchor = y;
      } else if (Math.abs(y - anchor) >= 12) {
        setFaded(y > anchor);
        anchor = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return faded;
}
