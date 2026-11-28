"use client";

import { useEffect, useRef } from "react";

type Kant = "links" | "rechts";

/**
 * Veeg vanaf een schermrand naar binnen. Op mobiel opent een veeg vanaf links
 * de menubalk en een veeg vanaf rechts het rechterpaneel.
 *
 * De zone is bewust smal: hoe breder hij is, hoe vaker een gewone horizontale
 * veeg in de lijst per ongeluk de rand raakt.
 */
export function useRandVeeg(kant: Kant, actie: () => void, zone = 18): void {
  // De actie verandert bij elke render; via een ref blijven de luisteraars
  // staan in plaats van bij elke render opnieuw te worden aangehangen.
  const actieRef = useRef(actie);
  actieRef.current = actie;

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const vlak = document.querySelector("main");
    if (!vlak) return;

    let start: { x: number; y: number; gedaan: boolean } | null = null;

    const inZone = (x: number) =>
      kant === "links" ? x <= zone : x >= window.innerWidth - zone;

    const begin = (event: TouchEvent) => {
      const raak = event.touches[0];
      if (!raak) return;
      // In een sheet (of ander dialoog) doet de randveeg niet mee.
      const doel = event.target as Element | null;
      if (doel?.closest?.('[role="dialog"], [data-slot="dialog-content"]')) {
        start = null;
        return;
      }
      start = inZone(raak.clientX) ? { x: raak.clientX, y: raak.clientY, gedaan: false } : null;
    };

    const schuif = (event: TouchEvent) => {
      if (!start || start.gedaan) return;
      const raak = event.touches[0];
      if (!raak) return;
      const dx = raak.clientX - start.x;
      const dy = raak.clientY - start.y;
      if (Math.abs(dy) > Math.abs(dx)) {
        start = null;
        return;
      }
      const naarBinnen = kant === "links" ? dx : -dx;
      if (naarBinnen >= 56) {
        start.gedaan = true;
        actieRef.current();
      }
    };

    const eindig = () => {
      start = null;
    };

    vlak.addEventListener("touchstart", begin, { passive: true });
    vlak.addEventListener("touchmove", schuif, { passive: true });
    vlak.addEventListener("touchend", eindig, { passive: true });
    vlak.addEventListener("touchcancel", eindig, { passive: true });
    return () => {
      vlak.removeEventListener("touchstart", begin);
      vlak.removeEventListener("touchmove", schuif);
      vlak.removeEventListener("touchend", eindig);
      vlak.removeEventListener("touchcancel", eindig);
    };
  }, [kant, zone]);
}
