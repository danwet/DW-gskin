"use client";

import { useEffect, useState } from "react";

/**
 * `true` zodra `bron` niet meer bovenaan staat.
 * `"venster"` volgt de pagina; een element volgt zijn eigen scroll.
 */
export function useScrollShadow(bron: HTMLElement | "venster" | null) {
  const [schaduw, setSchaduw] = useState(false);

  useEffect(() => {
    if (bron === null) {
      setSchaduw(false);
      return;
    }

    const element = bron === "venster" ? null : bron;

    function lees() {
      const onder = element !== null ? element.scrollTop > 0 : window.scrollY > 0;
      setSchaduw((huidig) => (huidig === onder ? huidig : onder));
    }

    lees();
    const doel: HTMLElement | Window = element ?? window;
    doel.addEventListener("scroll", lees, { passive: true });
    return () => doel.removeEventListener("scroll", lees);
  }, [bron]);

  return schaduw;
}
